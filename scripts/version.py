#!/usr/bin/env python3
"""Versioning for selective-tiler.

Versions are MAJOR.MINOR.PATCH where each part counts 0-9 and rolls over
into the part on its left (1.0.9 -> 1.1.0, 1.9.9 -> 2.0.0). The version is
derived from git tags (vX.Y.Z, or vX.Y treated as vX.Y.0); source checkouts
carry the placeholder 0.0.0 and CI stamps the real version into builds.

Usage:
  version.py current          highest existing tag version (or "none")
  version.py next             version the next release should use
  version.py stamp VERSION    write VERSION into metadata.json and main.js
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIRST_RELEASE = (1, 0, 1)
PLACEHOLDER = "0.0.0"
TAG_RE = re.compile(r"^v(\d+)\.(\d+)(?:\.(\d+))?$")


def parse_tag(tag):
    m = TAG_RE.match(tag.strip())
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))


def bump(version):
    major, minor, patch = version
    patch += 1
    if patch > 9:
        patch = 0
        minor += 1
    if minor > 9:
        minor = 0
        major += 1
    return (major, minor, patch)


def highest(tags):
    versions = [v for v in (parse_tag(t) for t in tags) if v is not None]
    return max(versions) if versions else None


def next_version(tags):
    top = highest(tags)
    if top is None or top < FIRST_RELEASE:
        # No releases yet (or only pre-1.0 tags): start the scheme at 1.0.1.
        return FIRST_RELEASE
    return bump(top)


def fmt(version):
    return "%d.%d.%d" % version


def git_tags():
    out = subprocess.run(["git", "tag", "--list", "v*"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return out.split()


def stamp(version, root=ROOT):
    if parse_tag("v" + version) is None or len(version.split(".")) != 3:
        raise ValueError("version must look like X.Y.Z: %r" % version)
    meta_path = root / "metadata.json"
    meta = json.loads(meta_path.read_text())
    meta["KPlugin"]["Version"] = version
    meta_path.write_text(json.dumps(meta, indent=4) + "\n")

    js_path = root / "contents" / "code" / "main.js"
    js = js_path.read_text()
    js, n = re.subn(r"^( \* Version )\S+$", r"\g<1>" + version, js, count=1, flags=re.M)
    if n != 1:
        raise RuntimeError("could not find ' * Version' header line in main.js")
    js_path.write_text(js)


def main(argv):
    if len(argv) < 2 or argv[1] not in ("current", "next", "stamp"):
        print(__doc__, file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd == "current":
        top = highest(git_tags())
        print(fmt(top) if top else "none")
    elif cmd == "next":
        print(fmt(next_version(git_tags())))
    elif cmd == "stamp":
        if len(argv) != 3:
            print("usage: version.py stamp X.Y.Z", file=sys.stderr)
            return 2
        stamp(argv[2])
        print("stamped " + argv[2])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
