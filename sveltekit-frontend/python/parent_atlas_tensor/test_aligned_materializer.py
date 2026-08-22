from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc

from parent_atlas_tensor.aligned_materializer import (
    CanonicalRow,
    materialize_aligned_artifacts,
    verify_mmap_alignment,
)
from parent_atlas_tensor.nary_incidence import Member


class AlignedMaterializerTests(unittest.TestCase):
    def _rows(self):
        return [
            CanonicalRow("C900", "canon:r8", "P900"),
            CanonicalRow("C517", "canon:r7", "P992"),
        ]

    def test_materializes_aligned_semantic_feature_and_hypergraph_views(self):
        rows = self._rows()
        semantic = np.arange(2 * 768, dtype=np.float32).reshape(2, 768)
        features = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]], dtype=np.float32)
        members = [
            Member("H2", "C900", "resource", 0.5),
            Member("H1", "C517", "actor", 1.0),
            Member("H1", "C900", "resource", 0.75),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            receipt = materialize_aligned_artifacts(
                output_dir=tmp,
                materialization_revision="mat:r1",
                source_snapshot_revision="source:r11",
                rows=rows,
                semantic_768=semantic,
                features=features,
                members=members,
                producer_revision="test:r1",
            )
            self.assertEqual(receipt.row_count, 2)
            aligned = [a for a in receipt.artifacts if a.row_identity_checksum is not None]
            self.assertEqual({a.kind for a in aligned}, {"SEMANTIC", "FEATURE", "HYPERGRAPH"})
            self.assertTrue(all(a.row_identity_checksum == receipt.row_identity_checksum for a in aligned))
            raw = next(a for a in receipt.artifacts if a.kind == "NARY_INCIDENCE")
            self.assertIsNone(raw.row_identity_checksum)
            self.assertEqual(raw.physical_row_count, 3)
            verify_mmap_alignment(receipt)
            self.assertTrue((Path(tmp) / "manifest.json").exists())

    def test_hypergraph_node_view_uses_canonical_row_order(self):
        rows = self._rows()
        semantic = np.zeros((2, 768), dtype=np.float32)
        features = np.zeros((2, 2), dtype=np.float32)
        members = [Member("H1", "C517", "actor", 1.0)]
        with tempfile.TemporaryDirectory() as tmp:
            receipt = materialize_aligned_artifacts(
                output_dir=tmp,
                materialization_revision="mat:r2",
                source_snapshot_revision="source:r11",
                rows=rows,
                semantic_768=semantic,
                features=features,
                members=members,
                producer_revision="test:r1",
            )
            artifact = next(a for a in receipt.artifacts if a.kind == "HYPERGRAPH")
            with pa.memory_map(artifact.path, "r") as source:
                table = ipc.open_file(source).read_all()
            self.assertEqual(table.column("canonical_id").to_pylist(), ["C517", "C900"])
            self.assertEqual(table.column("ordinal").to_pylist(), [0, 1])
            self.assertEqual(table.column("hyperedge_ids").to_pylist(), [["H1"], []])

    def test_rejects_non_finite_tensor_values(self):
        rows = self._rows()
        semantic = np.zeros((2, 768), dtype=np.float32)
        semantic[0, 0] = np.nan
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "semantic matrix must be finite"):
                materialize_aligned_artifacts(
                    output_dir=tmp,
                    materialization_revision="mat:bad",
                    source_snapshot_revision="source:r11",
                    rows=rows,
                    semantic_768=semantic,
                    features=np.zeros((2, 2), dtype=np.float32),
                    members=[],
                    producer_revision="test:r1",
                )


if __name__ == "__main__":
    unittest.main()
