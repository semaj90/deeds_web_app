from __future__ import annotations

import unittest

import numpy as np


try:
    import torch
    from atlas_compute.contextual_windows import contextualize_sliding_windows
    from atlas_compute.feature_alignment import FeatureBlock, align_feature_blocks
    from atlas_compute.interpolation import interpolate_topology_field
    from atlas_compute.nary_feature_propagation import propagate_nary_features
    from atlas_compute.som import aggregate_som_lattice, train_deterministic_som
    from atlas_compute.sparse_relations import (
        build_binary_incidence,
        choose_sparse_compute_mode,
        sparse_relation_softmax,
        sparse_relation_spmm,
    )
    AVAILABLE = True
except Exception:
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, "PyTorch/NumPy required")
class FeatureAlignmentTests(unittest.TestCase):
    def test_feature_blocks_require_identical_row_order_and_preserve_binary(self) -> None:
        ids = ["a", "b", "c"]
        counts = FeatureBlock(
            block_id="counts",
            revision="r1",
            canonical_ids=ids,
            values=np.array([[0.0], [3.0], [9.0]], dtype=np.float32),
            column_names=["count"],
            normalizations=["log1p_minmax"],
        )
        mask = FeatureBlock(
            block_id="mask",
            revision="r1",
            canonical_ids=ids,
            values=np.array([[0.0], [1.0], [1.0]], dtype=np.float32),
            column_names=["has_relation"],
            normalizations=["binary"],
        )
        matrix, receipt = align_feature_blocks([counts, mask])
        self.assertEqual(matrix.shape, (3, 2))
        self.assertEqual(set(matrix[:, 1].tolist()), {0.0, 1.0})
        self.assertEqual(receipt.canonical_ids, ids)

        bad = FeatureBlock(
            block_id="bad",
            revision="r1",
            canonical_ids=["b", "a", "c"],
            values=np.zeros((3, 1), dtype=np.float32),
            column_names=["bad"],
            normalizations=["none"],
        )
        with self.assertRaises(ValueError):
            align_feature_blocks([counts, bad])

    def test_sparse_softmax_uses_only_explicit_relation_support(self) -> None:
        relation, relation_receipt = build_binary_incidence(
            ["q0", "q1"],
            ["r0", "r1", "r2"],
            [("q0", "r0"), ("q0", "r2"), ("q1", "r1")],
            device="cpu",
        )
        probabilities, receipt = sparse_relation_softmax(relation, dim=1, temperature=1.0)
        dense = probabilities.to_dense().numpy()
        self.assertAlmostEqual(float(dense[0].sum()), 1.0, places=6)
        self.assertAlmostEqual(float(dense[1].sum()), 1.0, places=6)
        self.assertEqual(float(dense[0, 1]), 0.0)
        self.assertEqual(float(dense[1, 0]), 0.0)
        self.assertEqual(float(dense[1, 2]), 0.0)
        self.assertEqual(receipt.unspecified_probability, 0.0)
        self.assertEqual(relation_receipt.nnz, 3)

    def test_sparse_spmm_aggregates_only_supported_neighbors(self) -> None:
        relation, _ = build_binary_incidence(
            ["q0", "q1"], ["r0", "r1", "r2"],
            [("q0", "r0"), ("q0", "r2"), ("q1", "r1")], device="cpu",
        )
        features = np.array([[1.0, 0.0], [0.0, 2.0], [3.0, 4.0]], dtype=np.float32)
        output, receipt = sparse_relation_spmm(relation, features)
        np.testing.assert_allclose(output.numpy(), np.array([[4.0, 4.0], [0.0, 2.0]], dtype=np.float32))
        self.assertEqual(receipt.nnz, 3)

    def test_nary_feature_propagation_only_weights_existing_memberships(self) -> None:
        output, receipt = propagate_nary_features(
            ["entity:a", "entity:b"],
            ["relationship:r1", "relationship:r2", "relationship:r3"],
            [
                ("entity:a", "relationship:r1"),
                ("entity:a", "relationship:r3"),
                ("entity:b", "relationship:r2"),
            ],
            np.array([[1.0], [10.0], [3.0]], dtype=np.float32),
            direction="relationship_to_entity",
            device="cpu",
        )
        # Uniform softmax over supported memberships => entity:a gets mean(1,3), entity:b gets 10.
        np.testing.assert_allclose(output.numpy(), np.array([[2.0], [10.0]], dtype=np.float32), atol=1e-6)
        self.assertFalse(receipt.unsupported_membership_created)
        self.assertEqual(receipt.incidence_nnz, 3)

    def test_sparse_policy_uses_density_and_size_not_mosparse_claim(self) -> None:
        small = choose_sparse_compute_mode(rows=8, columns=8, nnz=4)
        large_sparse = choose_sparse_compute_mode(rows=256, columns=256, nnz=256)
        self.assertEqual(small.selected_mode, "dense")
        self.assertEqual(large_sparse.selected_mode, "sparse")
        self.assertFalse(large_sparse.learned_selector_used)
        self.assertFalse(large_sparse.mosparse_reimplementation_claimed)

    def test_context_window_is_bounded_and_softmax_normalized(self) -> None:
        matrix = np.eye(7, dtype=np.float32)
        context, masks, receipt = contextualize_sliding_windows(
            matrix, window_size=3, stride=1, causal=False, device="cpu",
        )
        self.assertEqual(tuple(context.shape), (7, 7))
        self.assertEqual(masks.shape, (7, 7))
        self.assertEqual(int(masks[3].sum()), 3)
        self.assertLess(receipt.max_softmax_sum_error, 1e-6)

    def test_som_lattice_can_feed_interpolation(self) -> None:
        matrix = np.array([
            [0.0, 0.0], [0.1, 0.0], [1.0, 1.0], [0.9, 1.0],
        ], dtype=np.float32)
        coordinates, _codebook, som_receipt = train_deterministic_som(
            matrix, grid_rows=2, grid_columns=2, epochs=3, device="cpu",
        )
        values = np.array([0.0, 0.2, 1.0, 0.8], dtype=np.float32)
        field, counts, lattice_receipt = aggregate_som_lattice(
            coordinates, values, grid_rows=2, grid_columns=2,
        )
        output, interpolation_receipt = interpolate_topology_field(
            field, [[0.5, 0.5]], spatial_dimensions=2, device="cpu",
        )
        self.assertTrue(np.isfinite(float(output[0])))
        self.assertGreaterEqual(int(counts.sum()), 4)
        self.assertFalse(som_receipt.canonical_authority)
        self.assertFalse(lattice_receipt.canonical_authority)
        self.assertFalse(interpolation_receipt.canonical_authority)


if __name__ == "__main__":
    unittest.main()
