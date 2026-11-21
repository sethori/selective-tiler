# AGENTS.md

## What this project is

Selective Tiler is a KWin 6 script for KDE Plasma 6. It tiles only the apps you opt into (an allowlist of window classes) and leaves everything else floating. It offers master-stack (multi-master) and dwindle layouts, a per-window float toggle and gaps, and it reloads its config live when you click Apply in System Settings. It's a personal tool that's also shared publicly through GitHub releases. Success means it's stable enough for daily use without fighting KWin.

- `metadata.json`: KPackage metadata (id `selective-tiler`). `Version` is a placeholder (`0.0.0`).
- `contents/code/main.js`: the whole script, covering config loading, layout engines, shortcuts and window lifecycle hooks.
- `contents/config/main.xml`: KConfigXT schema. Every `readConfig` key must be defined here.
- `contents/ui/config.ui`: the System Settings page. Widgets named `kcfg_<Key>` bind to `main.xml`.
- `contents/ui/config.ui.xml`: stale old copy. KWin doesn't load it and it's excluded from packages.
- `scripts/version.py`: computes and stamps versions. `scripts/build.py` builds the `.kwinscript` package.
- `tests/`: Python unittest. Covers the versioning rollover and the static package checks.

## Build, run, test

```sh
python3 -m unittest discover -s tests -v    # tests (also run in CI, plus `node --check`)
python3 scripts/build.py                    # -> dist/selective-tiler-<version>.kwinscript
python3 scripts/version.py next             # version the next main push will get
kpackagetool6 --type KWin/Script -u dist/selective-tiler-0.0.0.kwinscript   # install/upgrade (ask first)
journalctl --user -f | grep -i kwin         # script logs / errors
```

`dist/` and `__pycache__/` are generated. Never commit them.

## Things every agent must know

- The API is KWin 6 (`workspace.windowList()`, `activeWindow`, `windowAdded`, `frameGeometry` and so on). KWin 5 / Plasma 5 names don't work. There's no KWin in CI, so tests can't exercise the behaviour.
- **Ask before you install the script, reload it, or restart KWin/plasmashell**, and never edit `~/.local/share/kwin/scripts/` directly. These act on the owner's live desktop: a bad script can scramble window geometry.
- **Ask before you change default shortcuts.** They're registered in KWin's global shortcut config and can clash with Plasma defaults.
- When you add a setting, update all three of `main.xml`, `config.ui` (`kcfg_<Key>`) and `loadConfiguration()` in `main.js`. `tests/test_package.py` checks that they match.
- Never hand-edit the version in `metadata.json` or the `main.js` header. CI stamps them.
- Say clearly what was and wasn't tested for real. "Tests pass" doesn't mean "works in KWin".

## Versioning and releases

- Versions are `MAJOR.MINOR.PATCH` and each part counts 0–9 then rolls over: `1.0.9 → 1.1.0`, `1.9.9 → 2.0.0`. The first release is `1.0.1`.
- The version comes from git tags (`vX.Y.Z`, with `vX.Y` read as `vX.Y.0`) and is never edited by hand. Checkouts carry `0.0.0`.
- `.github/workflows/build.yml` runs on every push and PR: tests, `node --check`, then build. **Every push to `main` is a release.** CI runs `version.py next`, stamps that version, builds, and publishes GitHub release `vX.Y.Z` with the `.kwinscript` and `SHA256SUMS`. The release notes are the commit subjects since the previous tag. Concurrency is serialized per ref.

## Milestones

- 2026-10-17: 0.9.0, the first working tiler (allowlist, two layouts, float toggle, gaps, borders, settings UI).
- 2026-10-17: 0.10.0, multi-master, master count shortcuts, live settings reload.
- 2026-11-19: agent docs, automatic versioning and CI releases added, released as 1.0.1.
- 2026-11-19: 1.0.2, exact allowlist matching, child windows skipped, maximize leaves the layout, border handling removed.

## Known open issues

- The default shortcuts `Meta+L` (Plasma's lock screen) and `Meta+D` (Peek at Desktop) clash with Plasma defaults.
- `contents/ui/config.ui.xml` is stale: it references `HideTiledBorders` and `RestoreBordersOnUntile`, which aren't in `main.xml`. Delete it or reconcile it.
- The master ratio changed with `Meta+H`/`Meta+L` is runtime-only and resets on reload.
- `metadata.json` lists the author as "Custom KWin Script".
- Resizing a panel (work-area change) does not trigger a retile until the next window event.
- No automated behaviour tests (the code needs a running KWin).

## How to work here (owner preferences)

- **Communication:** concise, plain answers. Explain trade-offs only when they matter. Lead with the outcome and skip filler. When reporting work, say what was verified and what wasn't.
- **Questions:** when something is unclear or a decision is the owner's, ask instead of guessing. Give concrete options and a recommendation.
- **Git:** commit freely on feature branches with clear messages, and branch first if you're on `main`. **Ask before pushing**, opening PRs, touching `main`, creating or deleting releases or tags, or force-pushing. Write commit subjects a user could read, because they become release notes.
- **Destructive or outward-facing actions:** confirm first. That covers deleting files or branches, rewriting history, publishing, changing CI secrets and contacting external services. Approval for one action doesn't carry over to the next.
- **Upkeep (required on every change):** add a line to `CHANGELOG.md` for any user-visible change or fix. Update Milestones and Known open issues when they change. Keep this file short (under ~80 lines).
