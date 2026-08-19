from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from atlas_compute.semantic_snapshot_freeze import freeze_semantic_snapshot, load_and_verify_frozen_snapshot


class FrozenSemanticSnapshotTests(unittest.TestCase):
    def _row(self, canonical_id: str, revision: str, value: float) -> dict:
        return {
            "canonical_id": canonical_id,
            "canonical_revision": revision,
            "source_ref": f"src://{canonical_id}",
            "representation_id": "semantic_768",
            "embedding": [value] * 768,
        }

    def test_freeze_sorts_identity_and_verifies_tensor_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "input.ndjson"
            source.write_text(
                "\n".join([
                    json.dumps(self._row("entity:b", "r2", 2.0)),
                    json.dumps(self._row("entity:a", "r1", 1.0)),
                ]) + "\n",
                encoding="utf-8",
            )
            receipt = freeze_semantic_snapshot(
                source,
                tensor_path=root / "semantic_768.npy",
                manifest_path=root / "snapshot.json",
                snapshot_revision="workspace:742",
                representation_revision="semantic_768:r109",
                producer_revision="test:v2",
            )
            self.assertEqual(receipt.schema, "atlas.frozen-semantic-snapshot.v2")
            self.assertEqual([row.canonical_id for row in receipt.rows], ["entity:a", "entity:b"])
            self.assertEqual([row.ordinal for row in receipt.rows], [0, 1])
            self.assertEqual(receipt.dimensions, 768)
            self.assertEqual(len(receipt.canonical_order_checksum), 64)
            self.assertNotEqual(receipt.row_identity_checksum, receipt.canonical_order_checksum)
            matrix, manifest = load_and_verify_frozen_snapshot(root / "snapshot.json")
            self.assertEqual(matrix.shape, (2, 768))
            self.assertTrue(np.all(matrix[0] == 1.0))
            self.assertTrue(np.all(matrix[1] == 2.0))
            self.assertEqual(manifest["tensor_checksum"], receipt.tensor_checksum)
            self.assertEqual(manifest["canonical_order_checksum"], receipt.canonical_order_checksum)

    def test_duplicate_canonical_identity_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "input.ndjson"
            source.write_text(
                "\n".join([
                    json.dumps(self._row("entity:a", "r1", 1.0)),
                    json.dumps(self._row("entity:a", "r2", 2.0)),
                ]) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "duplicate canonical_id"):
                freeze_semantic_snapshot(
                    source,
                    tensor_path=root / "semantic_768.npy",
                    manifest_path=root / "snapshot.json",
                    snapshot_revision="workspace:742",
                    representation_revision="semantic_768:r109",
                    producer_revision="test:v2",
                )

    def test_non_768_embedding_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "input.ndjson"
            bad = self._row("entity:a", "r1", 1.0)
            bad["embedding"] = [1.0] * 384
            source.write_text(json.dumps(bad) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "expected embedding shape"):
                freeze_semantic_snapshot(
                    source,
                    tensor_path=root / "semantic_768.npy",
                    manifest_path=root / "snapshot.json",
                    snapshot_revision="workspace:742",
                    representation_revision="semantic_768:r109",
                    producer_revision="test:v2",
                )


if __name__ == "__main__":
    unittest.main()
