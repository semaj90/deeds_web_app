from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from atlas_compute.semantic_snapshot_freeze import freeze_semantic_snapshot, load_and_verify_frozen_snapshot

try:
    import pyarrow  # noqa: F401
    HAVE_PYARROW = True
except ImportError:
    HAVE_PYARROW = False


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
            self.assertTrue(receipt.ordinal_map_revision.startswith("sha256:"))
            self.assertNotEqual(receipt.row_identity_checksum, receipt.canonical_order_checksum)
            matrix, manifest = load_and_verify_frozen_snapshot(root / "snapshot.json")
            self.assertEqual(matrix.shape, (2, 768))
            self.assertTrue(np.all(matrix[0] == 1.0))
            self.assertTrue(np.all(matrix[1] == 2.0))
            self.assertEqual(manifest["tensor_checksum"], receipt.tensor_checksum)
            self.assertEqual(manifest["canonical_order_checksum"], receipt.canonical_order_checksum)

    @unittest.skipUnless(HAVE_PYARROW, "pyarrow is required for Arrow IPC proof")
    def test_arrow_snapshot_is_revisioned_checksummed_and_mmap_verified(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "input.ndjson"
            source.write_text(
                "\n".join([
                    json.dumps(self._row("entity:b", "source:r2", 2.0)),
                    json.dumps(self._row("entity:a", "source:r1", 1.0)),
                ]) + "\n",
                encoding="utf-8",
            )
            receipt = freeze_semantic_snapshot(
                source,
                tensor_path=root / "semantic_768.npy",
                manifest_path=root / "snapshot.json",
                snapshot_revision="snapshot:r1",
                representation_revision="semantic_768:r109",
                producer_revision="test:v3",
                workspace_revision="workspace:742",
                arrow_ipc_path=root / "semantic_768.arrow",
            )
            self.assertEqual(receipt.schema, "atlas.semantic-snapshot.v1")
            self.assertEqual(receipt.workspace_revision, "workspace:742")
            self.assertTrue(receipt.ordinal_map_revision.startswith("sha256:"))
            self.assertTrue(receipt.source_ref_unique)
            self.assertTrue(receipt.mmap_verified)
            self.assertEqual(len(receipt.arrow_ipc_checksum or ""), 64)
            self.assertGreater(receipt.arrow_ipc_bytes or 0, 0)
            matrix, manifest = load_and_verify_frozen_snapshot(root / "snapshot.json")
            self.assertEqual(matrix.shape, (2, 768))
            self.assertEqual(manifest["schema"], "atlas.semantic-snapshot.v1")

    def test_duplicate_source_ref_blocks_strict_or_arrow_promotion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            row_a = self._row("entity:a", "r1", 1.0)
            row_b = self._row("entity:b", "r2", 2.0)
            row_b["source_ref"] = row_a["source_ref"]
            source = root / "input.ndjson"
            source.write_text("\n".join([json.dumps(row_a), json.dumps(row_b)]) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate source_ref"):
                freeze_semantic_snapshot(
                    source,
                    tensor_path=root / "semantic_768.npy",
                    manifest_path=root / "snapshot.json",
                    snapshot_revision="snapshot:r1",
                    representation_revision="semantic_768:r109",
                    producer_revision="test:v3",
                    workspace_revision="workspace:742",
                    arrow_ipc_path=root / "semantic_768.arrow",
                )

    def test_arrow_promotion_requires_workspace_revision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "input.ndjson"
            source.write_text(json.dumps(self._row("entity:a", "r1", 1.0)) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "workspace_revision"):
                freeze_semantic_snapshot(
                    source,
                    tensor_path=root / "semantic_768.npy",
                    manifest_path=root / "snapshot.json",
                    snapshot_revision="snapshot:r1",
                    representation_revision="semantic_768:r109",
                    producer_revision="test:v3",
                    arrow_ipc_path=root / "semantic_768.arrow",
                )

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
