from __future__ import annotations

import unittest
import json

import numpy as np


try:
    import torch  # noqa: F401
    from atlas_compute.exact_semantic import exact_semantic_search
    from atlas_compute.hypergraph_tensor import run_tensor_ppr
    from atlas_compute.interpolation import interpolate_topology_field
    from atlas_compute.low_rank import (
        candidate_ordinal_map_checksum,
        compare_low_rank_recommendations,
        prove_low_rank_cpu_cuda_parity,
    )
    from atlas_compute.rapids_matrix import deterministic_farthest_first_ordinals
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False


@unittest.skipUnless(TORCH_AVAILABLE, "PyTorch is required for Atlas compute reference tests")
class AtlasComputeReferenceTests(unittest.TestCase):
    def test_exact_semantic_uses_stable_ordinal_tie_break(self) -> None:
        corpus = np.array([[1, 0], [1, 0], [0, 1]], dtype=np.float32)
        query = np.array([[1, 0]], dtype=np.float32)
        receipt = exact_semantic_search(
            corpus, query, ["entity:a", "entity:b", "entity:c"],
            metric="cosine", top_k=3, device="cpu",
        )
        self.assertEqual([hit.canonical_id for hit in receipt.hits[0]], ["entity:a", "entity:b", "entity:c"])
        self.assertEqual(receipt.tie_break, "distance_ascending_then_canonical_ordinal")

    def test_exact_semantic_metrics_agree_on_simple_fixture(self) -> None:
        corpus = np.array([[1, 0], [0, 1], [-1, 0]], dtype=np.float32)
        query = np.array([[1, 0]], dtype=np.float32)
        ids = ["positive", "orthogonal", "negative"]
        for metric in ("cosine", "inner_product", "sqeuclidean"):
            receipt = exact_semantic_search(corpus, query, ids, metric=metric, top_k=3, device="cpu")
            self.assertEqual(receipt.hits[0][0].canonical_id, "positive")

    def test_tensor_ppr_favors_seed_component(self) -> None:
        receipt = run_tensor_ppr(
            ["entity:a", "relationship:r", "entity:b", "entity:x", "relationship:u"],
            [("entity:a", "relationship:r"), ("relationship:r", "entity:b"), ("entity:x", "relationship:u")],
            ["entity:a"], device="cpu", epsilon=1e-8, max_iterations=300,
        )
        scores = dict(zip(receipt.node_ids, receipt.scores))
        self.assertGreater(scores["relationship:r"], scores["relationship:u"])
        self.assertEqual(receipt.convergence_rule, "l1_delta_lt_node_count_times_epsilon")

    def test_cubic_interpolation_reproduces_integer_lattice_value(self) -> None:
        field = np.arange(4 * 4 * 4, dtype=np.float32).reshape(4, 4, 4)
        output, receipt = interpolate_topology_field(field, [[2.0, 1.0, 3.0]], spatial_dimensions=3, device="cpu")
        self.assertAlmostEqual(float(output[0]), float(field[2, 1, 3]), places=5)
        self.assertEqual(receipt.maximum_samples_per_coordinate, 64)
        self.assertFalse(receipt.canonical_authority)

    def test_quadcubic_interpolation_has_256_sample_bound(self) -> None:
        field = np.zeros((4, 4, 4, 4), dtype=np.float32)
        field[1, 2, 3, 0] = 7.0
        output, receipt = interpolate_topology_field(field, [[1.0, 2.0, 3.0, 0.0]], spatial_dimensions=4, device="cpu")
        self.assertAlmostEqual(float(output[0]), 7.0, places=5)
        self.assertEqual(receipt.maximum_samples_per_coordinate, 256)

    def test_low_rank_challenger_is_repeatable_with_seed(self) -> None:
        rng = np.random.default_rng(42)
        left = rng.normal(size=(12, 3)).astype(np.float32)
        right = rng.normal(size=(3, 16)).astype(np.float32)
        matrix = left @ right
        first = compare_low_rank_recommendations(matrix, query_row=2, target_rank=3, top_k=5, device="cpu", seed=123)
        second = compare_low_rank_recommendations(matrix, query_row=2, target_rank=3, top_k=5, device="cpu", seed=123)
        self.assertEqual(first.output_checksum, second.output_checksum)
        self.assertEqual(first.length_square_sample_ordinals, second.length_square_sample_ordinals)
        self.assertGreaterEqual(first.top_k_overlap, 0.8)
        self.assertFalse(first.canonical_authority)
        self.assertEqual(first.numerical_owner, "python_pytorch")
        self.assertEqual(first.execution_device, "cpu")

    def test_low_rank_cpu_cuda_parity_receipt_is_bounded(self) -> None:
        rng = np.random.default_rng(7)
        matrix = rng.normal(size=(16, 12)).astype(np.float32)
        receipt = prove_low_rank_cpu_cuda_parity(
            matrix, target_rank=3, oversampling=4, power_iterations=2, top_k=4, sample_count=12, seed=9
        )
        self.assertIn(receipt.status, {"PARITY_PROVEN", "CUDA_UNAVAILABLE", "NUMERICAL_MISMATCH"})
        self.assertFalse(receipt.canonical_authority)
        if receipt.cuda_available:
            self.assertEqual(receipt.status, "PARITY_PROVEN")
            self.assertTrue(receipt.sample_bounds_valid)
            self.assertIsNotNone(receipt.singular_value_max_relative_delta)

    def test_low_rank_receipt_serialization_preserves_ordinal_lineage(self) -> None:
        matrix = np.arange(24, dtype=np.float32).reshape(6, 4)
        canonical_ids = [f"packet-{index:02d}" for index in range(6)]
        receipt = prove_low_rank_cpu_cuda_parity(
            matrix,
            target_rank=2,
            oversampling=2,
            power_iterations=1,
            top_k=2,
            sample_count=4,
            seed=11,
            canonical_ids=canonical_ids,
            representation_id="semantic_768",
            representation_revision="0",
        )
        encoded = json.dumps(receipt.to_dict(), sort_keys=True, separators=(",", ":"))
        decoded = json.loads(encoded)
        self.assertEqual(decoded["representation_id"], "semantic_768")
        self.assertEqual(decoded["representation_revision"], "0")
        self.assertEqual(decoded["candidate_ordinal_map_checksum"], candidate_ordinal_map_checksum(canonical_ids))
        self.assertIn(decoded["status"], {"PARITY_PROVEN", "CUDA_UNAVAILABLE", "NUMERICAL_MISMATCH"})
        self.assertFalse(decoded["canonical_authority"])

    def test_farthest_first_initialization_is_deterministic_and_tie_stable(self) -> None:
        matrix = np.array([
            [0.0, 0.0],
            [2.0, 0.0],
            [-2.0, 0.0],
            [0.0, 3.0],
        ], dtype=np.float32)
        first = deterministic_farthest_first_ordinals(matrix, 3)
        second = deterministic_farthest_first_ordinals(matrix, 3)
        self.assertEqual(first, second)
        self.assertEqual(first[0], 0)
        self.assertEqual(first[1], 3)
        # Rows 1 and 2 are symmetric after selecting 0 and 3; ordinal 1 wins.
        self.assertEqual(first[2], 1)


if __name__ == "__main__":
    unittest.main()
