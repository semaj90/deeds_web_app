from __future__ import annotations

import unittest

from freeze_real_semantic_snapshot_v2 import sha256_bytes, stable_bytes, verify_v2_identity


class FreezeRealSemanticSnapshotV2Tests(unittest.TestCase):
    def manifest(self):
        rows = [
            {
                "ordinal": 0,
                "canonical_id": "packet:a",
                "canonical_revision": "sha256:" + "a" * 64,
                "source_ref": "src/a.ts",
            },
            {
                "ordinal": 1,
                "canonical_id": "packet:b",
                "canonical_revision": "sha256:" + "b" * 64,
                "source_ref": "src/b.ts",
            },
        ]
        ids = [row["canonical_id"] for row in rows]
        return {
            "schema": "atlas.frozen-semantic-snapshot.v2",
            "row_count": len(rows),
            "rows": rows,
            "row_identity_checksum": sha256_bytes(stable_bytes(rows)),
            "canonical_order_checksum": sha256_bytes(stable_bytes(ids)),
        }

    def test_verifies_dense_ordinals_versioned_rows_and_canonical_order(self) -> None:
        receipt = verify_v2_identity(self.manifest())
        self.assertTrue(receipt["rowIdentityChecksumVerified"])
        self.assertTrue(receipt["canonicalOrderChecksumVerified"])
        self.assertEqual(receipt["denseOrdinalCount"], 2)

    def test_rejects_revision_tamper(self) -> None:
        manifest = self.manifest()
        manifest["rows"][1]["canonical_revision"] = "sha256:" + "c" * 64
        with self.assertRaisesRegex(RuntimeError, "ROW_IDENTITY_CHECKSUM_MISMATCH"):
            verify_v2_identity(manifest)

    def test_rejects_non_dense_ordinal(self) -> None:
        manifest = self.manifest()
        manifest["rows"][1]["ordinal"] = 3
        with self.assertRaisesRegex(RuntimeError, "ORDINAL_NOT_DENSE"):
            verify_v2_identity(manifest)


if __name__ == "__main__":
    unittest.main()
