import contextlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("export_frozen_semantic768_snapshot.py")
SPEC = importlib.util.spec_from_file_location("frozen_snapshot_exporter", MODULE_PATH)
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class FrozenSnapshotExporterContractTests(unittest.TestCase):
    def test_tag_cannot_escape_snapshot_output_directories(self):
        for tag in ("../outside", "a/b", "a\\b", "..", ""):
            with self.subTest(tag=tag):
                with self.assertRaises(ValueError):
                    EXPORTER.snapshot_output_paths(tag)

    def test_existing_artifacts_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            existing = Path(temp_dir) / "already-there.bin"
            existing.write_bytes(b"preserve")
            with self.assertRaises(FileExistsError):
                EXPORTER.ensure_snapshot_paths_new((str(existing),))
            self.assertEqual(existing.read_bytes(), b"preserve")

    def test_existing_tag_blocks_before_database_connection(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "semantic768"
            report_dir = Path(temp_dir) / "reports"
            output_dir.mkdir()
            report_dir.mkdir()
            existing = output_dir / "frozen_semantic_768_v5_ordinal_map.json"
            existing.write_text("preserve", encoding="utf-8")

            with mock.patch.object(EXPORTER, "OUT_DIR", str(output_dir)), \
                    mock.patch.object(EXPORTER, "REPORT_DIR", str(report_dir)), \
                    mock.patch.object(sys, "argv", [str(MODULE_PATH), "--tag", "v5"]), \
                    mock.patch.object(EXPORTER.psycopg2, "connect") as connect, \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    EXPORTER.main()

            self.assertEqual(raised.exception.code, 78)
            connect.assert_not_called()
            self.assertEqual(existing.read_text(encoding="utf-8"), "preserve")

    def test_export_manifest_cannot_claim_unproven_lineage(self):
        fields = EXPORTER.snapshot_qualification_fields()
        self.assertEqual(fields["status"], "FROZEN_ARTIFACT_STRUCTURAL_ONLY")
        self.assertEqual(fields["lineageQualification"], "NOT_PROVEN")
        self.assertEqual(fields["modelIdentityQualification"], "NOT_PROVEN")
        self.assertIsNone(fields["canonicalSourceColumn"])
        self.assertIsNone(fields["producerRevision"])


if __name__ == "__main__":
    unittest.main()
