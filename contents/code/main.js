/**
 * Selective Krohnkite-Style Tiler for KDE Plasma 6.8 (KWin 6 API)
 * Version 0.10.0
 *
 * Features:
 * - Strict Opt-In Application Allowlist (nothing tiled by default).
 * - Multi-Master Support: Promote without demoting, dynamic master capacity.
 * - Dual Layouts: Master-Stack and Dwindle/Spiral.
 * - Manual Float / Tile toggle per window (Meta+F).
 * - Theme-matched border highlighting (active vs inactive).
 * - Instant live config reload on System Settings "Apply".
 */

const CONFIG = {
    // =========================================================================
    // 1. OPT-IN APPLICATION WHITELIST SECTION
    // =========================================================================
    tiledApps: [],

    // =========================================================================
    // 2. WINDOW GAPS SECTION (px)
    // =========================================================================
    gaps: {
        inner: 8,
        outerTop: 10,
        outerBottom: 10,
        outerLeft: 10,
        outerRight: 10
    },

    // =========================================================================
    // 3. WINDOW BORDER SETTINGS SECTION
    // =========================================================================
    borders: {
        mode: "theme",           // "theme" | "none" | "active"
        keepOnSingle: true,      // Keep borders when only 1 tiled window is visible
        restoreOnFloat: true     // Restore original borders when floating
    },

    // =========================================================================
    // 4. LAYOUT & TILING ENGINE SECTION
    // =========================================================================
    layout: {
        mode: "master-stack",    // "master-stack" | "dwindle"
        masterRatio: 0.50,       // 0.15 to 0.85
        stepRatio: 0.05,
        defaultMasterCount: 1    // Default number of master windows
    }
};

// Internal runtime state maps
const windowStateMap = new Map();       // window.internalId -> State
const surfaceLayoutMap = new Map();     // surfaceKey -> layout mode string
const surfaceMasterCount = new Map();   // surfaceKey -> number of masters
const surfaceWindowOrder = new Map();   // surfaceKey -> Array<string internalId>
const hookedWindows = new Set();
let isArranging = false;

/**
 * Load settings from KDE System Settings (main.xml)
 */
function loadConfiguration() {
    const rawApps = String(readConfig("TiledApps", CONFIG.tiledApps.join(",")));
    CONFIG.tiledApps = rawApps
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0);

    CONFIG.gaps.inner = Number(readConfig("InnerGap", CONFIG.gaps.inner));
    CONFIG.gaps.outerTop = Number(readConfig("OuterGapTop", CONFIG.gaps.outerTop));
    CONFIG.gaps.outerBottom = Number(readConfig("OuterGapBottom", CONFIG.gaps.outerBottom));
    CONFIG.gaps.outerLeft = Number(readConfig("OuterGapLeft", CONFIG.gaps.outerLeft));
    CONFIG.gaps.outerRight = Number(readConfig("OuterGapRight", CONFIG.gaps.outerRight));

    CONFIG.borders.mode = String(readConfig("BorderMode", CONFIG.borders.mode));
    CONFIG.borders.keepOnSingle = Boolean(readConfig("KeepBorderSingle", CONFIG.borders.keepOnSingle));
    CONFIG.borders.restoreOnFloat = Boolean(readConfig("RestoreBorderFloat", CONFIG.borders.restoreOnFloat));

    CONFIG.layout.mode = String(readConfig("DefaultLayout", CONFIG.layout.mode));
    CONFIG.layout.defaultMasterCount = Math.max(1, Number(readConfig("DefaultMasterCount", CONFIG.layout.defaultMasterCount)));

    const ratioPct = Number(readConfig("MasterRatioPercent", Math.round(CONFIG.layout.masterRatio * 100)));
    CONFIG.layout.masterRatio = Math.min(0.85, Math.max(0.15, ratioPct / 100));
}

function isManageable(win) {
    if (!win || win.deleted) return false;
    if (!win.normalWindow || win.dialog || win.splash || win.utility || win.specialWindow) return false;
    if (!win.moveable || !win.resizeable) return false;
    return true;
}

function getWindowMeta(win) {
    const id = String(win.internalId);
    if (!windowStateMap.has(id)) {
        windowStateMap.set(id, {
            isManuallyFloating: null,
            origNoBorder: Boolean(win.noBorder),
            floatGeometry: {
                x: win.frameGeometry.x,
                y: win.frameGeometry.y,
                width: win.frameGeometry.width,
                height: win.frameGeometry.height
            }
        });
    }
    return windowStateMap.get(id);
}

function shouldTileWindow(win) {
    if (!isManageable(win)) return false;
    if (win.minimized || win.fullScreen) return false;

    const meta = getWindowMeta(win);
    if (meta.isManuallyFloating !== null) {
        return !meta.isManuallyFloating;
    }

    if (CONFIG.tiledApps.length === 0) {
        return false;
    }

    const resClass = String(win.resourceClass || "").toLowerCase();
    const resName = String(win.resourceName || "").toLowerCase();

    return CONFIG.tiledApps.some(allowed =>
        resClass === allowed ||
        resName === allowed ||
        resClass.indexOf(allowed) !== -1
    );
}

function updateWindowBorders(win, isTiled, totalTiled, isActive) {
    const meta = getWindowMeta(win);

    if (!isTiled) {
        if (CONFIG.borders.restoreOnFloat) {
            win.noBorder = meta.origNoBorder;
        }
        return;
    }

    if (totalTiled === 1 && CONFIG.borders.keepOnSingle) {
        win.noBorder = meta.origNoBorder;
        return;
    }

    if (CONFIG.borders.mode === "theme") {
        win.noBorder = false;
    } else if (CONFIG.borders.mode === "none") {
        win.noBorder = true;
    } else if (CONFIG.borders.mode === "active") {
        win.noBorder = !isActive;
    }
}

function setWindowBounds(win, x, y, w, h) {
    win.frameGeometry = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.max(100, w)),
        height: Math.round(Math.max(100, h))
    };
}

function getSurfaceKey(screen, desktop, activity) {
    const s = screen ? (screen.name || String(screen)) : "default";
    const d = desktop ? (desktop.id || String(desktop)) : "all";
    return s + "::" + d + "::" + String(activity || "default");
}

function getSurfaceLayoutMode(surfaceKey) {
    if (!surfaceLayoutMap.has(surfaceKey)) {
        surfaceLayoutMap.set(surfaceKey, CONFIG.layout.mode);
    }
    return surfaceLayoutMap.get(surfaceKey);
}

function getSurfaceMasterCount(surfaceKey) {
    if (!surfaceMasterCount.has(surfaceKey)) {
        surfaceMasterCount.set(surfaceKey, CONFIG.layout.defaultMasterCount);
    }
    return surfaceMasterCount.get(surfaceKey);
}

function setSurfaceMasterCount(surfaceKey, count) {
    surfaceMasterCount.set(surfaceKey, Math.max(1, count));
}

function getOrderedWindows(surfaceKey, tiledWindows) {
    if (!surfaceWindowOrder.has(surfaceKey)) {
        surfaceWindowOrder.set(surfaceKey, []);
    }
    const order = surfaceWindowOrder.get(surfaceKey);
    const validIds = new Set(tiledWindows.map(w => String(w.internalId)));

    const filtered = order.filter(id => validIds.has(id));
    for (let i = 0; i < tiledWindows.length; i++) {
        const id = String(tiledWindows[i].internalId);
        if (filtered.indexOf(id) === -1) {
            filtered.push(id);
        }
    }
    surfaceWindowOrder.set(surfaceKey, filtered);

    const map = new Map(tiledWindows.map(w => [String(w.internalId), w]));
    return filtered.map(id => map.get(id)).filter(Boolean);
}

// =============================================================================
// LAYOUT ENGINES
// =============================================================================

function stackVertical(windows, startIdx, endIdx, x, y, width, height, gap) {
    const count = endIdx - startIdx;
    if (count <= 0) return;
    const totalGaps = gap * (count - 1);
    const itemHeight = Math.floor((height - totalGaps) / count);

    for (let i = 0; i < count; i++) {
        const curY = y + i * (itemHeight + gap);
        const curH = (i === count - 1) ? (y + height - curY) : itemHeight;
        setWindowBounds(windows[startIdx + i], x, curY, width, curH);
    }
}

function applyMasterStackLayout(windows, area, gap, ratio, numMaster) {
    const count = windows.length;
    if (count === 0) return;

    const effectiveMasters = Math.max(1, Math.min(count, numMaster));
    const stackCount = count - effectiveMasters;

    // If all windows fit inside the master area, stack them across the full width
    if (stackCount === 0) {
        stackVertical(windows, 0, count, area.x, area.y, area.width, area.height, gap);
        return;
    }

    const masterWidth = Math.round((area.width - gap) * ratio);
    const stackWidth = area.width - gap - masterWidth;
    const stackX = area.x + masterWidth + gap;

    // Master Column: split vertically among all master windows
    stackVertical(windows, 0, effectiveMasters, area.x, area.y, masterWidth, area.height, gap);

    // Stack Column: split vertically among remaining windows
    stackVertical(windows, effectiveMasters, count, stackX, area.y, stackWidth, area.height, gap);
}

function applyDwindleLayout(windows, area, gap, ratio) {
    const count = windows.length;
    let rx = area.x;
    let ry = area.y;
    let rw = area.width;
    let rh = area.height;

    for (let i = 0; i < count; i++) {
        if (i === count - 1) {
            setWindowBounds(windows[i], rx, ry, rw, rh);
            break;
        }

        const currentRatio = (i === 0) ? ratio : 0.50;
        const dir = i % 4;

        if (dir === 0) {
            const w = Math.floor((rw - gap) * currentRatio);
            setWindowBounds(windows[i], rx, ry, w, rh);
            rx += w + gap;
            rw -= (w + gap);
        } else if (dir === 1) {
            const h = Math.floor((rh - gap) * currentRatio);
            setWindowBounds(windows[i], rx, ry, rw, h);
            ry += h + gap;
            rh -= (h + gap);
        } else if (dir === 2) {
            const w = Math.floor((rw - gap) * currentRatio);
            setWindowBounds(windows[i], rx + rw - w, ry, w, rh);
            rw -= (w + gap);
        } else {
            const h = Math.floor((rh - gap) * currentRatio);
            setWindowBounds(windows[i], rx, ry + rh - h, rw, h);
            rh -= (h + gap);
        }
    }
}

// =============================================================================
// SURFACE & DISPATCH
// =============================================================================

function arrangeSurface(screen, desktop, activity) {
    const surfaceKey = getSurfaceKey(screen, desktop, activity);
    const currentMode = getSurfaceLayoutMode(surfaceKey);
    const numMaster = getSurfaceMasterCount(surfaceKey);
    const allWindows = workspace.windowList();
    const activeWin = workspace.activeWindow;
    const tiledList = [];

    for (let i = 0; i < allWindows.length; i++) {
        const win = allWindows[i];
        if (!isManageable(win)) continue;
        if (win.output !== screen) continue;

        const onDesktop = win.onAllDesktops || (win.desktops && win.desktops.indexOf(desktop) !== -1);
        const onActivity = !win.activities || win.activities.length === 0 || win.activities.indexOf(activity) !== -1;
        if (!onDesktop || !onActivity) continue;

        if (shouldTileWindow(win)) {
            tiledList.push(win);
        } else {
            updateWindowBorders(win, false, 0, win === activeWin);
        }
    }

    const ordered = getOrderedWindows(surfaceKey, tiledList);
    const count = ordered.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
        const win = ordered[i];
        if (win.setMaximize) {
            win.setMaximize(false, false);
        }
        updateWindowBorders(win, true, count, win === activeWin);
    }

    const area = workspace.clientArea(KWin.PlacementArea, screen, desktop);
    const g = CONFIG.gaps;
    const usableArea = {
        x: area.x + g.outerLeft,
        y: area.y + g.outerTop,
        width: Math.max(100, area.width - g.outerLeft - g.outerRight),
        height: Math.max(100, area.height - g.outerTop - g.outerBottom)
    };

    if (currentMode === "dwindle") {
        applyDwindleLayout(ordered, usableArea, g.inner, CONFIG.layout.masterRatio);
    } else {
        applyMasterStackLayout(ordered, usableArea, g.inner, CONFIG.layout.masterRatio, numMaster);
    }
}

function retileAll() {
    if (isArranging) return;
    isArranging = true;
    try {
        const desktop = workspace.currentDesktop;
        const activity = workspace.currentActivity;
        const screens = workspace.screens;
        for (let i = 0; i < screens.length; i++) {
            arrangeSurface(screens[i], desktop, activity);
        }
    } finally {
        isArranging = false;
    }
}

function onActiveWindowChanged(activeWin) {
    if (!activeWin || !isManageable(activeWin)) return;
    const desktop = workspace.currentDesktop;
    const activity = workspace.currentActivity;
    const surfaceKey = getSurfaceKey(activeWin.output, desktop, activity);
    const order = surfaceWindowOrder.get(surfaceKey) || [];

    if (CONFIG.borders.mode === "active") {
        const all = workspace.windowList();
        for (let i = 0; i < all.length; i++) {
            const w = all[i];
            if (order.indexOf(String(w.internalId)) !== -1) {
                updateWindowBorders(w, true, order.length, w === activeWin);
            }
        }
    }
}

// =============================================================================
// SHORTCUT ACTIONS
// =============================================================================

function toggleFloatActiveWindow() {
    const win = workspace.activeWindow;
    if (!isManageable(win)) return;

    const meta = getWindowMeta(win);
    const currentlyTiled = shouldTileWindow(win);

    if (currentlyTiled) {
        meta.isManuallyFloating = true;
        updateWindowBorders(win, false, 0, true);
        if (meta.floatGeometry) {
            setWindowBounds(
                win,
                meta.floatGeometry.x,
                meta.floatGeometry.y,
                meta.floatGeometry.width,
                meta.floatGeometry.height
            );
        }
    } else {
        meta.floatGeometry = {
            x: win.frameGeometry.x,
            y: win.frameGeometry.y,
            width: win.frameGeometry.width,
            height: win.frameGeometry.height
        };
        meta.isManuallyFloating = false;
    }
    retileAll();
}

function toggleLayoutMode() {
    const win = workspace.activeWindow;
    const screen = win ? win.output : workspace.activeScreen;
    const surfaceKey = getSurfaceKey(screen, workspace.currentDesktop, workspace.currentActivity);
    const current = getSurfaceLayoutMode(surfaceKey);

    surfaceLayoutMap.set(surfaceKey, (current === "master-stack") ? "dwindle" : "master-stack");
    retileAll();
}

/**
 * Standard promote: swaps the active window with Master #1 (or second if already #1)
 */
function promoteToMasterSolo() {
    const win = workspace.activeWindow;
    if (!win || !isManageable(win)) return;

    const surfaceKey = getSurfaceKey(win.output, workspace.currentDesktop, workspace.currentActivity);
    const order = surfaceWindowOrder.get(surfaceKey) || [];
    const id = String(win.internalId);
    const idx = order.indexOf(id);

    if (idx === -1) return;
    if (idx === 0 && order.length > 1) {
        const tmp = order[0];
        order[0] = order[1];
        order[1] = tmp;
    } else {
        order.splice(idx, 1);
        order.unshift(id);
    }
    surfaceWindowOrder.set(surfaceKey, order);
    retileAll();
}

/**
 * NEW: Promote WITHOUT demoting existing masters.
 * Moves active window into the master area and increments master count.
 */
function addActiveWindowToMaster() {
    const win = workspace.activeWindow;
    if (!win || !isManageable(win)) return;

    const surfaceKey = getSurfaceKey(win.output, workspace.currentDesktop, workspace.currentActivity);
    const order = surfaceWindowOrder.get(surfaceKey) || [];
    const id = String(win.internalId);
    const idx = order.indexOf(id);
    const currentMasters = getSurfaceMasterCount(surfaceKey);

    if (idx === -1) return;

    if (idx >= currentMasters) {
        // Window is currently in the stack: move it to the master area
        order.splice(idx, 1);
        order.splice(currentMasters, 0, id); // Place at the end of the master group
        setSurfaceMasterCount(surfaceKey, currentMasters + 1);
    } else {
        // Window is already a master: move it to the top position
        order.splice(idx, 1);
        order.unshift(id);
    }

    surfaceWindowOrder.set(surfaceKey, order);
    retileAll();
}

function increaseMasterCapacity() {
    const win = workspace.activeWindow;
    const screen = win ? win.output : workspace.activeScreen;
    const surfaceKey = getSurfaceKey(screen, workspace.currentDesktop, workspace.currentActivity);
    setSurfaceMasterCount(surfaceKey, getSurfaceMasterCount(surfaceKey) + 1);
    retileAll();
}

function decreaseMasterCapacity() {
    const win = workspace.activeWindow;
    const screen = win ? win.output : workspace.activeScreen;
    const surfaceKey = getSurfaceKey(screen, workspace.currentDesktop, workspace.currentActivity);
    setSurfaceMasterCount(surfaceKey, Math.max(1, getSurfaceMasterCount(surfaceKey) - 1));
    retileAll();
}

function registerShortcuts() {
    registerShortcut(
        "SelectiveTiler: Toggle Float",
        "Selective Tiler: Toggle Float/Tile for Active Window",
        "Meta+F",
        toggleFloatActiveWindow
    );

    registerShortcut(
        "SelectiveTiler: Switch Layout Mode",
        "Selective Tiler: Switch Between Master-Stack and Dwindle",
        "Meta+\\",
        toggleLayoutMode
    );

    registerShortcut(
        "SelectiveTiler: Promote Window",
        "Selective Tiler: Promote Window to Solo Master",
        "Meta+Return",
        promoteToMasterSolo
    );

    // NEW: Add window to master without demoting others
    registerShortcut(
        "SelectiveTiler: Add Window to Master",
        "Selective Tiler: Add Active Window to Masters (Multi-Master)",
        "Meta+Shift+Return",
        addActiveWindowToMaster
    );

    // NEW: Master count adjustments
    registerShortcut(
        "SelectiveTiler: Increase Master Count",
        "Selective Tiler: Increase Number of Master Windows",
        "Meta+I",
        increaseMasterCapacity
    );

    registerShortcut(
        "SelectiveTiler: Decrease Master Count",
        "Selective Tiler: Decrease Number of Master Windows",
        "Meta+D",
        decreaseMasterCapacity
    );

    registerShortcut(
        "SelectiveTiler: Grow Master",
        "Selective Tiler: Grow Master Ratio",
        "Meta+L",
        function () {
            CONFIG.layout.masterRatio = Math.min(0.85, CONFIG.layout.masterRatio + CONFIG.layout.stepRatio);
            retileAll();
        }
    );

    registerShortcut(
        "SelectiveTiler: Shrink Master",
        "Selective Tiler: Shrink Master Ratio",
        "Meta+H",
        function () {
            CONFIG.layout.masterRatio = Math.max(0.15, CONFIG.layout.masterRatio - CONFIG.layout.stepRatio);
            retileAll();
        }
    );
}

// =============================================================================
// LIFECYCLE
// =============================================================================

function hookWindow(win) {
    if (!isManageable(win)) return;
    const id = String(win.internalId);
    if (hookedWindows.has(id)) return;
    hookedWindows.add(id);

    getWindowMeta(win);

    win.minimizedChanged.connect(retileAll);
    win.fullScreenChanged.connect(retileAll);
    win.desktopsChanged.connect(retileAll);
    win.outputChanged.connect(retileAll);

    win.interactiveMoveResizeFinished.connect(function () {
        if (!shouldTileWindow(win)) {
            const meta = getWindowMeta(win);
            meta.floatGeometry = {
                x: win.frameGeometry.x,
                y: win.frameGeometry.y,
                width: win.frameGeometry.width,
                height: win.frameGeometry.height
            };
        }
        retileAll();
    });

    if (shouldTileWindow(win)) {
        retileAll();
    }
}

function unhookWindow(win) {
    if (!win) return;
    const id = String(win.internalId);
    hookedWindows.delete(id);
    windowStateMap.delete(id);
    retileAll();
}

function init() {
    loadConfiguration();
    registerShortcuts();

    const existing = workspace.windowList();
    for (let i = 0; i < existing.length; i++) {
        hookWindow(existing[i]);
    }

    workspace.windowAdded.connect(hookWindow);
    workspace.windowRemoved.connect(unhookWindow);
    workspace.currentDesktopChanged.connect(retileAll);
    workspace.screensChanged.connect(retileAll);
    workspace.currentActivityChanged.connect(retileAll);
    workspace.windowActivated.connect(onActiveWindowChanged);

    // Live update triggered whenever user hits "Apply" in System Settings
    if (options && options.configChanged) {
        options.configChanged.connect(function () {
            loadConfiguration();
            retileAll();
        });
    }

    retileAll();
}

init();