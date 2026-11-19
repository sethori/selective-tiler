# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.10.0] - 2026-10-17

### Added
- **Multi-Master Layout Engine:** Master-Stack mode now divides the master column dynamically across any number of master windows.
- **Promote Without Demoting:** Added shortcut `Meta+Shift+Return` (*Add Active Window to Master*) to promote the focused stack window into the master column and increment the master capacity by 1, preserving all previous masters.
- **Master Count Adjustments:** Added shortcuts `Meta+I` (increase master count) and `Meta+D` (decrease master count).
- **Default Master Count Configuration:** Added `DefaultMasterCount` to `main.xml` and `config.ui` to configure how many master windows are used by default.
- **Live System Settings Reload:** Enhanced `options.configChanged` signal handler to re-read configuration and re-tile all displays the moment "Apply" or "OK" is clicked in System Settings, without needing manual DBus commands.

---

## [0.9.0] - 2026-10-17

### Added
- **Opt-in Application Filtering:** Default behavior where no windows are auto-tiled unless added to the allowlist or manually toggled.
- **Dual Layout Engines:** Master-Stack and Dwindle / Spiral modes, switchable via `Meta+\`.
- **Manual Float Control:** `Meta+F` toggle preserving previous floating geometry on float.
- **Theme-Integrated Border Modes:** `theme` (accent colors), `active`, and `none`.
- **Window Gaps:** Configurable inner and outer gaps.
- **KConfigXT & Qt UI Integration:** Full GUI inside KDE System Settings.