from __future__ import annotations

import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "doc14_upsert", REPO_ROOT / "scripts" / "atlas" / "doc14-embedding-upsert-v1.py"
)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class Doc14EmbeddingUpsertV1Tests(unittest.TestCase):
    def _sample_record(self, text: str = "hello doc14") -> dict:
        return {
            "chunkId": "c1",
            "sourceRef": "docs/a.md",
            "sourceRevision": "sha256:" + "a" * 64,
            "contentSha256": "b" * 64,
            "chunkSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "text": text,
            "title": "A",
            "scope": "repo:deeds",
            "pgReadbackStatus": "PROVEN",
            "admissionStatus": "INDEX_ELIGIBLE",
        }

    def test_validates_record_and_builds_pinned_matrix_receipt(self) -> None:
        rec = MOD.check_record(self._sample_record(), "repo:deeds", 8192)
        self.assertEqual(MOD.format_document(rec, "embeddinggemma2-document-v1"), "title: A | text: hello doc14")
        vec = [0.1] * 768
        receipt = MOD.build_feature_matrix_receipt(
            [rec],
            [vec],
            model="embeddinggemma2:q8_0",
            model_sha="c" * 64,
            prefix_policy="embeddinggemma2-document-v1",
        )
        self.assertEqual(receipt["shape"], [1, 768])
        self.assertEqual(receipt["dtype"], "float32")
        self.assertTrue(receipt["matrixChecksum"].startswith("sha256:"))
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])

    def test_rejects_bad_digest_and_non_proven_record(self) -> None:
        bad = self._sample_record()
        bad["chunkSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "chunkSha256 mismatch"):
            MOD.check_record(bad, "repo:deeds", 8192)

        unproven = self._sample_record()
        unproven["pgReadbackStatus"] = "UNVERIFIED"
        with self.assertRaisesRegex(ValueError, "not approved"):
            MOD.check_record(unproven, "repo:deeds", 8192)


if __name__ == "__main__":
    unittest.main()
