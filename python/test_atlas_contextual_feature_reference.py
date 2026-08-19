from __future__ import annotations

import unittest

import numpy as np

from atlas_contextual_feature_reference import (
    deduplicate_context,
    geodesic_distance_s3,
    normalize_s3,
    pack_binary_rows,
    polynomial_features,
    sparse_binary_csr,
    stable_checksum,
    unpack_binary_rows,
)


class ContextualFeatureReferenceTests(unittest.TestCase):
    def test_bit_pack_round_trip_preserves_exact_support(self) -> None:
        rows = np.array(
            [[1, 0, 1, 0, 0, 1, 1, 0, 1], [0, 1, 0, 1, 1, 0, 0, 1, 0]],
            dtype=np.uint8,
        )
        packed, receipt = pack_binary_rows(rows, bitorder="little")
        restored = unpack_binary_rows(packed, dimensions=rows.shape[1], bitorder="little")
        np.testing.assert_array_equal(restored, rows)
        self.assertEqual(receipt["dimensions"], 9)
        self.assertNotEqual(receipt["logical_checksum"], receipt["transport_checksum"])
        self.assertFalse(receipt["canonical_authority"])

    def test_pack_rejects_non_binary_values(self) -> None:
        with self.assertRaises(ValueError):
            pack_binary_rows(np.array([[0, 2, 1]], dtype=np.int64))

    def test_csr_preserves_only_supported_positions(self) -> None:
        rows = np.array([[1, 0, 1], [0, 1, 0]], dtype=np.uint8)
        csr = sparse_binary_csr(rows)
        self.assertEqual(csr["indptr"], [0, 2, 3])
        self.assertEqual(csr["indices"], [0, 2, 1])
        self.assertEqual(csr["values"], [1, 1, 1])
        self.assertFalse(csr["canonical_authority"])

    def test_s3_is_three_dimensional_manifold_embedded_in_r4(self) -> None:
        coordinates, receipt = normalize_s3(np.array([[1, 2, 3, 4], [4, 0, 0, 0]], dtype=np.float64))
        np.testing.assert_allclose(np.linalg.norm(coordinates, axis=1), np.ones(2), atol=1e-12)
        self.assertEqual(receipt["ambient_dimension"], 4)
        self.assertEqual(receipt["intrinsic_dimension"], 3)
        self.assertLess(receipt["max_unit_norm_error"], 1e-12)

    def test_s3_geodesic_differs_from_euclidean_chord_conceptually(self) -> None:
        a = [1.0, 0.0, 0.0, 0.0]
        b = [0.0, 1.0, 0.0, 0.0]
        self.assertAlmostEqual(geodesic_distance_s3(a, b), np.pi / 2, places=12)

    def test_polynomial_features_add_interactions_without_changing_fact_identity(self) -> None:
        features = polynomial_features([2.0, 3.0], degree=2)
        np.testing.assert_array_equal(features, np.array([2.0, 3.0, 4.0, 6.0, 9.0]))

    def test_context_dedup_preserves_changed_source_revision(self) -> None:
        same = stable_checksum("evidence")
        items = [
            {"id": "a", "logical_checksum": same, "source_ref": "src/a.ts", "source_revision": "r1", "tree_node_id": "T1", "repeat_policy": "DEDUP_SOURCE_COORDINATE"},
            {"id": "b", "logical_checksum": same, "source_ref": "src/a.ts", "source_revision": "r1", "tree_node_id": "T1", "repeat_policy": "DEDUP_SOURCE_COORDINATE"},
            {"id": "c", "logical_checksum": same, "source_ref": "src/a.ts", "source_revision": "r2", "tree_node_id": "T1", "repeat_policy": "DEDUP_SOURCE_COORDINATE"},
        ]
        result = deduplicate_context(items)
        self.assertEqual([item["id"] for item in result], ["a", "c"])


if __name__ == "__main__":
    unittest.main()
