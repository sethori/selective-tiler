# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), but entries are grouped
by **date** rather than by version, because versions are assigned automatically.

Every push to `main` is released automatically as `vX.Y.Z` (see AGENTS.md), and
each GitHub release lists the commits it contains. Each heading gives the date
and the first version that included those changes.

## 2026-11-19 (from 1.0.1)

### Added
- Automatic versioning: every push to `main` publishes a GitHub release with a
  ready-to-install `.kwinscript` package and a `SHA256SUMS` file.
- `scripts/build.py` to build the `.kwinscript` package locally.
- Shared agent instructions (`AGENTS.md`, with `CLAUDE.md`/`GEMINI.md` pointing to it).

### Changed
- Version numbering restarts at 1.0.1 under the new scheme (previously 0.10.0).
  The version in source checkouts is now the placeholder `0.0.0`.

## 2026-11-19 (from 1.0.2)

### Changed
- The allowlist now matches window classes exactly. An entry matches the class,
  the resource name, or the last part of a dotted class (`konsole` still matches
  `org.kde.konsole`), but no longer matches any class that merely contains it,
  so `code` no longer catches unrelated apps. Check your list if an app stops tiling.
- Maximizing a tiled window now takes it out of the layout instead of being
  undone on the next retile. Unmaximizing puts it back.

### Fixed
- Child windows (properties, settings and similar windows owned by another
  window) are no longer tiled.
- `Meta+I` no longer raises the master count past the number of tiled windows,
  and `Meta+D` has a visible effect on the first press.
- Floating a window that was already tiled when the script started now gives it
  a centred size instead of leaving it at its tiled position.
- Windows are retiled when they move between activities, when an app sets its
  window class late, and when the screen arrangement changes.

### Removed
- Window border handling (the `theme`/`active`/`none` border modes and the two
  border checkboxes). It never worked reliably, and the script no longer
  changes window borders. Any window it already stripped gets its border back
  when you reopen it.

## 2026-10-17 (pre-release 0.9.0 – 0.10.0)

### Added
- Opt-in application allowlist: nothing is tiled unless its window class is listed or it is toggled manually.
- Master-Stack and Dwindle/Spiral layouts, switchable with `Meta+\`.
- `Meta+F` float/tile toggle that restores the previous floating geometry.
- Border modes `theme` (accent colors), `active` and `none`.
- Configurable inner and outer gaps.
- Full settings page in KDE System Settings.
- Multi-master: the master column splits across any number of master windows.
- `Meta+Shift+Return` adds the focused window to the masters without demoting others.
- `Meta+I` / `Meta+D` increase/decrease the master count, and `DefaultMasterCount` sets the default.
- Settings apply live when you click Apply/OK in System Settings.
