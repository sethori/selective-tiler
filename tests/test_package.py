"""Static checks on the package files (no KWin needed)."""
import json
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KCFG = "{http://www.kde.org/standards/kcfg/1.0}"


class PackageTest(unittest.TestCase):
    def test_metadata_is_valid(self):
        meta = json.loads((ROOT / "metadata.json").read_text())
        self.assertEqual(meta["KPackageStructure"], "KWin/Script")
        self.assertEqual(meta["X-Plasma-MainScript"], "code/main.js")
        self.assertTrue((ROOT / "contents" / meta["X-Plasma-MainScript"]).is_file())

    def test_config_ui_keys_exist_in_main_xml(self):
        kcfg = ET.parse(ROOT / "contents/config/main.xml")
        keys = {e.get("name") for e in kcfg.iter(KCFG + "entry")}
        ui = ET.parse(ROOT / "contents/ui/config.ui")
        widgets = {w.get("name")[5:] for w in ui.iter("widget")
                   if (w.get("name") or "").startswith("kcfg_")}
        self.assertEqual(widgets - keys, set(), "config.ui widgets without a main.xml entry")

    def test_main_js_reads_only_known_keys(self):
        kcfg = ET.parse(ROOT / "contents/config/main.xml")
        keys = {e.get("name") for e in kcfg.iter(KCFG + "entry")}
        js = (ROOT / "contents/code/main.js").read_text()
        read = set(re.findall(r'readConfig\("(\w+)"', js))
        self.assertEqual(read - keys, set(), "readConfig keys missing from main.xml")


if __name__ == "__main__":
    unittest.main()
