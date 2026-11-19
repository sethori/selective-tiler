#!/usr/bin/env python3
"""Package the KWin script as dist/selective-tiler-<version>.kwinscript.

A .kwinscript is a zip with metadata.json and contents/ at its root.
Install with: kpackagetool6 --type KWin/Script -i dist/<file>.kwinscript
(or -u to upgrade). The version comes from metadata.json, so run
`scripts/version.py stamp X.Y.Z` first for a release build.
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# config.ui.xml is a stale copy that KWin does not load; keep it out of packages.
EXCLUDE = {"contents/ui/config.ui.xml"}


def main():
    meta = json.loads((ROOT / "metadata.json").read_text())
    version = meta["KPlugin"]["Version"]
    plugin_id = meta["KPlugin"]["Id"]
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / ("%s-%s.kwinscript" % (plugin_id, version))
    files = [ROOT / "metadata.json"] + sorted(
        p for p in (ROOT / "contents").rglob("*") if p.is_file())
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in files:
            rel = p.relative_to(ROOT).as_posix()
            if rel not in EXCLUDE:
                zf.write(p, rel)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
