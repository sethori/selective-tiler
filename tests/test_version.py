import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import version  # noqa: E402


class BumpTest(unittest.TestCase):
    def test_patch(self):
        self.assertEqual(version.bump((1, 0, 1)), (1, 0, 2))

    def test_patch_rolls_into_minor(self):
        self.assertEqual(version.bump((1, 0, 9)), (1, 1, 0))

    def test_minor_rolls_into_major(self):
        self.assertEqual(version.bump((1, 9, 9)), (2, 0, 0))

    def test_mid_minor(self):
        self.assertEqual(version.bump((1, 4, 9)), (1, 5, 0))


class NextVersionTest(unittest.TestCase):
    def test_no_tags_starts_at_1_0_1(self):
        self.assertEqual(version.next_version([]), (1, 0, 1))

    def test_ignores_unrelated_tags(self):
        self.assertEqual(version.next_version(["foo", "release-3"]), (1, 0, 1))

    def test_pre_1_0_tags_start_at_1_0_1(self):
        self.assertEqual(version.next_version(["v0.10.0"]), (1, 0, 1))

    def test_continues_from_highest(self):
        tags = ["v1.0.1", "v1.0.9", "v1.0.3"]
        self.assertEqual(version.next_version(tags), (1, 1, 0))

    def test_two_part_tag_is_x_y_0(self):
        self.assertEqual(version.parse_tag("v2.3"), (2, 3, 0))
        self.assertEqual(version.next_version(["v2.3", "v1.9.9"]), (2, 3, 1))

    def test_numeric_not_lexical_order(self):
        self.assertEqual(version.highest(["v1.2.0", "v1.10.0"]), (1, 10, 0))


class StampTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copy(ROOT / "metadata.json", self.tmp / "metadata.json")
        (self.tmp / "contents" / "code").mkdir(parents=True)
        shutil.copy(ROOT / "contents/code/main.js", self.tmp / "contents/code/main.js")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_stamp_writes_both_files(self):
        version.stamp("1.2.3", root=self.tmp)
        meta = json.loads((self.tmp / "metadata.json").read_text())
        self.assertEqual(meta["KPlugin"]["Version"], "1.2.3")
        self.assertIn(" * Version 1.2.3\n", (self.tmp / "contents/code/main.js").read_text())

    def test_rejects_bad_version(self):
        with self.assertRaises(ValueError):
            version.stamp("1.2", root=self.tmp)

    def test_checkout_carries_placeholder(self):
        meta = json.loads((ROOT / "metadata.json").read_text())
        self.assertEqual(meta["KPlugin"]["Version"], version.PLACEHOLDER)


if __name__ == "__main__":
    unittest.main()
