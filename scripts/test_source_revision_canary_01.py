import hashlib
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

from scripts import source_revision_canary_01


class SourceRevisionCanaryPreflightTests(unittest.TestCase):
    def test_preflight_does_not_claim_workspace_or_canonical_identity_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "fixture.ts"
            source_path.write_bytes(b"export const fixture = true;\n")
            digest = hashlib.sha256(source_path.read_bytes()).hexdigest()

            with patch.object(source_revision_canary_01, "psycopg2", None):
                result = source_revision_canary_01.execute_canary_preflight(
                    db_dsn="unused",
                    canary_workspace_id="canary-workspace-1",
                    prod_workspace_id="production-workspace",
                    target_file_path=str(source_path),
                    expected_sha256=digest,
                    authorized_workspace_rev="caller-asserted-revision",
                    canonical_id="caller-asserted-canonical-id",
                )

        self.assertTrue(result["SOURCE_HASH_MATCH"])
        self.assertEqual(result["SOURCE_CONTENT_HASH"], f"sha256:{digest}")
        self.assertNotIn("SOURCE_REVISION", result)
        self.assertEqual(result["WORKSPACE_REVISION_CLAIM"], "caller-asserted-revision")
        self.assertFalse(result["WORKSPACE_REVISION_VERIFIED"])
        self.assertEqual(result["CANONICAL_IDENTITY_CLAIM"], "caller-asserted-canonical-id")
        self.assertFalse(result["CANONICAL_IDENTITY_RESOLVED"])
        self.assertEqual(result["WRITER_PREFLIGHT_PASS"], "NOT_CHECKED_NO_PSYCOPG2")
        self.assertFalse(result["databaseRead"])
        self.assertFalse(result["writesPerformed"])

    def test_schema_read_does_not_claim_row_or_writer_proof(self):
        class Cursor:
            statements = []

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, query):
                self.statements.append(query)

            def fetchall(self):
                return [
                    {"column_name": "source_ref", "data_type": "text"},
                    {"column_name": "source_revision", "data_type": "text"},
                ]

        class Connection:
            def __init__(self):
                self.cursor_instance = Cursor()
                self.rolled_back = False
                self.closed = False

            def cursor(self, **_kwargs):
                return self.cursor_instance

            def rollback(self):
                self.rolled_back = True

            def close(self):
                self.closed = True

        connection = Connection()
        fake_psycopg2 = SimpleNamespace(connect=lambda _dsn: connection)

        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "fixture.ts"
            source_path.write_bytes(b"export const fixture = true;\n")
            digest = hashlib.sha256(source_path.read_bytes()).hexdigest()

            with (
                patch.object(source_revision_canary_01, "psycopg2", fake_psycopg2),
                patch.object(source_revision_canary_01, "RealDictCursor", object),
            ):
                result = source_revision_canary_01.execute_canary_preflight(
                    db_dsn="fixture-dsn",
                    canary_workspace_id="canary-workspace-1",
                    prod_workspace_id="production-workspace",
                    target_file_path=str(source_path),
                    expected_sha256=digest,
                    authorized_workspace_rev="caller-asserted-revision",
                    canonical_id="caller-asserted-canonical-id",
                )

        self.assertEqual(result["WRITER_PREFLIGHT_PASS"], "SCHEMA_ONLY_NOT_CHECKED")
        self.assertTrue(result["databaseRead"])
        self.assertFalse(result["writesPerformed"])
        self.assertFalse(result["WORKSPACE_REVISION_VERIFIED"])
        self.assertFalse(result["CANONICAL_IDENTITY_RESOLVED"])
        self.assertTrue(connection.rolled_back)
        self.assertTrue(connection.closed)
        self.assertIn("SET TRANSACTION READ ONLY", connection.cursor_instance.statements[0])
        self.assertIn("information_schema.columns", connection.cursor_instance.statements[1])

    def test_digest_mismatch_fails_before_database_connection(self):
        connection = SimpleNamespace(connect=lambda _dsn: self.fail("database must not be contacted"))

        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "fixture.ts"
            source_path.write_bytes(b"different bytes")

            with patch.object(source_revision_canary_01, "psycopg2", connection):
                with self.assertRaisesRegex(ValueError, "SOURCE_HASH_MATCH failed"):
                    source_revision_canary_01.execute_canary_preflight(
                        db_dsn="unused",
                        canary_workspace_id="canary-workspace-1",
                        prod_workspace_id="production-workspace",
                        target_file_path=str(source_path),
                        expected_sha256="0" * 64,
                        authorized_workspace_rev="caller-asserted-revision",
                        canonical_id="caller-asserted-canonical-id",
                    )


if __name__ == "__main__":
    unittest.main()
