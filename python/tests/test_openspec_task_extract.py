import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "scripts" / "atlas" / "openspec-task-extract-v1.py"
SPEC = importlib.util.spec_from_file_location("openspec_task_extract_v1", MODULE_PATH)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXTRACTOR)


class OpenSpecTaskEncodingTests(unittest.TestCase):
    def test_declared_task_code_matches_workboard_id_syntax(self):
        examples = {
            "ENG-03 ship the adapter": "ENG-03",
            "**MICRO-04-TRAIN-SMOKE** prove the fixture": "MICRO-04-TRAIN-SMOKE",
            "`4.1a` review the contract": "4.1a",
        }
        for text, expected in examples.items():
            with self.subTest(text=text):
                match = EXTRACTOR.TASK_CODE.match(text)
                self.assertIsNotNone(match)
                self.assertEqual(match.group(1), expected)

    def test_decodes_utf8_and_utf16_bom_variants(self):
        text = "- [ ] SCENE-01 inspect source\n"
        self.assertEqual(EXTRACTOR.decode_task_bytes(text.encode("utf-8"))[1], "utf-8")
        self.assertEqual(EXTRACTOR.decode_task_bytes(text.encode("utf-8-sig"))[1], "utf-8-bom")
        self.assertEqual(EXTRACTOR.decode_task_bytes(text.encode("utf-16"))[1], "utf-16-le-bom")
        self.assertEqual(EXTRACTOR.decode_task_bytes(b"\xfe\xff" + text.encode("utf-16-be"))[1], "utf-16-be-bom")

    def test_decodes_bomless_utf16_and_flags_invalid_utf8(self):
        text = "- [ ] SCENE-01 inspect source\n"
        decoded, encoding, error = EXTRACTOR.decode_task_bytes(text.encode("utf-16-le"))
        self.assertEqual(decoded, text)
        self.assertEqual(encoding, "utf-16-le-no-bom")
        self.assertIsNone(error)

        decoded, encoding, error = EXTRACTOR.decode_task_bytes(b"- [ ] bad \xff text\n")
        self.assertIsNone(decoded)
        self.assertEqual(encoding, "invalid-utf8")
        self.assertEqual(error["byteStart"], 10)

    def test_extracts_open_partial_done_and_keeps_locator_separate_from_task_code(self):
        content = "# Tasks\n- [ ] SCENE-01 open item\n- [~] SCENE-02 partial item\n- [x] SCENE-03 done item\n"
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            tasks_file = root / "openspec" / "changes" / "sample" / "tasks.md"
            tasks_file.parent.mkdir(parents=True)
            tasks_file.write_text(content, encoding="utf-8")
            rows, file_record = EXTRACTOR.parse_file(root, "openspec/changes/sample/tasks.md")

        self.assertEqual([row["status"] for row in rows], ["open", "partial", "done"])
        self.assertEqual(rows[1]["task_code"], "SCENE-02")
        self.assertEqual(rows[1]["identityState"], "DECLARED_TASK_CODE")
        self.assertEqual(rows[1]["id"], "openspec/changes/sample/tasks.md#L3")
        self.assertTrue(rows[1]["sourceFileRevision"].startswith("sha256:"))
        self.assertEqual(len(rows[1]["taskLineChecksum"]), 64)
        self.assertEqual(file_record["decodeStatus"], "OK")

    def test_invalid_encoding_is_reported_without_parsing_replacement_text(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            tasks_file = root / "openspec" / "changes" / "sample" / "tasks.md"
            tasks_file.parent.mkdir(parents=True)
            tasks_file.write_bytes(b"- [ ] SCENE-01 valid-looking \xff row\n")
            rows, file_record = EXTRACTOR.parse_file(root, "openspec/changes/sample/tasks.md")

        self.assertEqual(rows, [])
        self.assertEqual(file_record["decodeStatus"], "INVALID_ENCODING")
        self.assertEqual(file_record["encoding"], "invalid-utf8")
        self.assertEqual(len(file_record["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
