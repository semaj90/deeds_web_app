from __future__ import annotations

import unittest

from atlas_documentation_diff_learning_circuit import (
    ACE_PREVIEW_SCHEMA,
    ESTIMATOR_REVISION,
    INDEX_SCHEMA,
    approximate_tokens,
    build_ace_preview,
    build_index_row,
    deterministic_evidence_id,
    prompt_priority,
)


class DocumentationDiffLearningCircuitTests(unittest.TestCase):
    def test_deterministic_evidence_id(self) -> None:
        a = deterministic_evidence_id("postgres-18", "sha256:abc", "https://example.com/a")
        b = deterministic_evidence_id("postgres-18", "sha256:abc", "https://example.com/a")
        c = deterministic_evidence_id("postgres-18", "sha256:def", "https://example.com/a")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)

    def test_token_estimator_is_bounded_and_nonzero(self) -> None:
        self.assertEqual(approximate_tokens(""), 1)
        self.assertEqual(approximate_tokens("abcd"), 1)
        self.assertEqual(approximate_tokens("abcde"), 2)

    def test_prompt_priority_prefers_changed_api_rich_docs(self) -> None:
        plain = prompt_priority("CONTENT_CHANGED", api_signature_count=0, code_block_count=0)
        rich = prompt_priority("CONTENT_CHANGED", api_signature_count=5, code_block_count=5)
        unchanged = prompt_priority("CONTENT_UNCHANGED", api_signature_count=5, code_block_count=5)
        self.assertGreater(rich, plain)
        self.assertGreater(plain, unchanged)
        self.assertLessEqual(rich, 100)

    def test_index_row_is_noncanonical(self) -> None:
        entry = {
            "evidenceId": "e1",
            "sourceId": "s1",
            "sourceRevision": "sha256:r1",
            "sourceRef": "https://example.com/a",
            "normalizedChecksum": "abc",
            "diffKind": "CONTENT_CHANGED",
            "domainClass": "retrieval",
            "ontologyClasses": ["API"],
            "tokenFeatures": {
                "approximateTokens": 7,
                "estimatorRevision": ESTIMATOR_REVISION,
            },
            "promptPriority": 88,
        }
        row = build_index_row(entry)
        self.assertEqual(row["schema"], INDEX_SCHEMA)
        self.assertFalse(row["canonicalAuthority"])
        self.assertEqual(row["approximateTokens"], 7)

    def test_ace_preview_is_blocked_and_never_writes_or_inserts_kv(self) -> None:
        entries = [
            {
                "diffKind": "CONTENT_CHANGED",
                "domainClass": "retrieval",
                "ontologyClasses": ["API", "RETRIEVAL"],
                "tokenFeatures": {"approximateTokens": 17},
                "promptPriority": 91,
            },
            {
                "diffKind": "CONTENT_UNCHANGED",
                "domainClass": "database",
                "ontologyClasses": ["STORAGE"],
                "tokenFeatures": {"approximateTokens": 11},
                "promptPriority": 10,
            },
        ]
        preview = build_ace_preview(entries, "sha256:artifact")
        self.assertEqual(preview["schema"], ACE_PREVIEW_SCHEMA)
        self.assertEqual(preview["status"], "BLOCKED_IDENTITY")
        self.assertEqual(preview["featureMapping"]["changedDocumentCount"], 1)
        self.assertEqual(preview["featureMapping"]["approximateTokens"], 28)
        self.assertFalse(preview["bitfrost"]["cacheWrite"])
        self.assertFalse(preview["bitfrost"]["modelKvTensorInsert"])
        self.assertFalse(preview["writesPerformed"])
        self.assertFalse(preview["canonicalAuthority"])
        self.assertIn("candidateSnapshotRevision", preview["requiredForAdmission"])
        self.assertIn("ordinalMapChecksum", preview["requiredForAdmission"])


if __name__ == "__main__":
    unittest.main()
