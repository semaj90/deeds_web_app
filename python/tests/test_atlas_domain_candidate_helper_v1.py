"""Unit tests for atlas_domain_candidate_helper_v1."""

import hashlib
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_domain_candidate_helper_v1 import (
    compute_source_revision,
    verify_text_evidence,
    bind_candidate_record,
)


class TestAtlasDomainCandidateHelperV1(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace_root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_compute_source_revision(self):
        test_file = self.workspace_root / "src/sample.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        content = b"export const answer = 42;\n"
        test_file.write_bytes(content)

        expected_hash = "sha256:" + hashlib.sha256(content).hexdigest()
        digest = compute_source_revision(test_file)
        self.assertEqual(digest, expected_hash)

        # Non-existent file returns None
        self.assertIsNone(compute_source_revision(self.workspace_root / "missing.ts"))

    def test_verify_text_evidence_exact(self):
        source = "function authenticateUser(req: Request) {\n  const token = req.headers.get('auth');\n  return token;\n}"
        evidence = "const token = req.headers.get('auth');"
        result = verify_text_evidence(source, evidence)
        self.assertTrue(result["found"])
        self.assertTrue(result["exact_match"])
        self.assertEqual(source[result["start_char"]:result["end_char"]], evidence)

    def test_verify_text_evidence_partial_fallback(self):
        source = "export async function searchCodebase(query: string) {\n  const results = await orchestrateRetrieval(query);\n  return results;\n}"
        evidence = "  const results = await orchestrateRetrieval(query);\n  return results;\n  // trailing comment that got cut off"
        result = verify_text_evidence(source, evidence)
        self.assertTrue(result["found"])
        self.assertFalse(result["exact_match"])
        self.assertGreater(result["partial_match_length"], 20)

    def test_bind_candidate_record_resolves_revision(self):
        rel_path = "src/routes/api/search/+server.ts"
        test_file = self.workspace_root / rel_path
        test_file.parent.mkdir(parents=True, exist_ok=True)
        content = "export async function POST(req) { return json({ ok: true }); }"
        test_file.write_text(content, encoding="utf-8")

        raw_candidate = {
            "schema": "atlas.domain-calibration-example.draft.v1",
            "packetKey": None,
            "sourceRef": rel_path,
            "sourceRevision": None,
            "featureLabel": "+server.ts",
            "textEvidence": "export async function POST",
            "selectionSignalDomain": "api",
        }

        bound = bind_candidate_record(raw_candidate, self.workspace_root)
        self.assertEqual(bound["revisionResolution"], "CONTENT_HASH_OBSERVED_NOT_ADMITTED")
        self.assertTrue(bound["sourceContentHash"].startswith("sha256:"))
        self.assertIsNone(bound["sourceRevision"])
        self.assertFalse(bound["canonicalAuthority"])
        self.assertFalse(bound["writesPerformed"])
        self.assertTrue(bound["evidenceSpanCheck"]["found"])

    def test_bind_candidate_record_handles_missing_file(self):
        raw_candidate = {
            "schema": "atlas.domain-calibration-example.draft.v1",
            "packetKey": None,
            "sourceRef": "non/existent/file.ts",
            "sourceRevision": None,
        }
        bound = bind_candidate_record(raw_candidate, self.workspace_root)
        self.assertEqual(bound["revisionResolution"], "SOURCE_REF_INVALID_OR_NOT_FOUND")
        self.assertIsNone(bound["sourceRevision"])

    def test_bind_candidate_record_rejects_path_traversal_and_untrusted_identity(self):
        raw_candidate = {
            "packetKey": "packet:forged",
            "sourceRef": "../../outside.txt",
            "sourceRevision": "revision:forged",
            "textEvidence": "secret",
        }
        bound = bind_candidate_record(raw_candidate, self.workspace_root)
        self.assertEqual(bound["revisionResolution"], "SOURCE_REF_INVALID_OR_NOT_FOUND")
        self.assertIsNone(bound["packetKey"])
        self.assertIsNone(bound["sourceRevision"])
        self.assertEqual(bound["unverifiedPacketKey"], "packet:forged")
        self.assertEqual(bound["unverifiedSourceRevision"], "revision:forged")
        self.assertFalse(bound["canonicalAuthority"])

    def test_bind_candidate_record_never_upgrades_content_hash_to_workspace_revision(self):
        source_file = self.workspace_root / "src" / "sample.py"
        source_file.parent.mkdir(parents=True)
        source_file.write_text("value = 1\n", encoding="utf-8")
        bound = bind_candidate_record({"sourceRef": "src/sample.py"}, self.workspace_root)
        self.assertEqual(bound["revisionResolution"], "CONTENT_HASH_OBSERVED_NOT_ADMITTED")
        self.assertTrue(bound["sourceContentHash"].startswith("sha256:"))
        self.assertIsNone(bound["sourceRevision"])

    def test_bind_candidate_record_rejects_caller_workspace_and_canonical_ids(self):
        source_file = self.workspace_root / "src" / "sample.py"
        source_file.parent.mkdir(parents=True)
        source_file.write_text("value = 1\n", encoding="utf-8")
        bound = bind_candidate_record(
            {
                "sourceRef": "src/sample.py",
                "workspaceRevision": "workspace:forged",
                "canonicalId": "feature:forged",
            },
            self.workspace_root,
        )
        self.assertIsNone(bound["workspaceRevision"])
        self.assertIsNone(bound["canonicalId"])
        self.assertEqual(bound["unverifiedWorkspaceRevision"], "workspace:forged")
        self.assertEqual(bound["unverifiedCanonicalId"], "feature:forged")
        self.assertFalse(bound["canonicalAuthority"])


if __name__ == "__main__":
    unittest.main()
