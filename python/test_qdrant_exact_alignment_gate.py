from __future__ import annotations

import unittest

from atlas_compute.qdrant_exact_alignment_gate import evaluate_qdrant_exact_alignment_gate


class QdrantExactAlignmentGateTests(unittest.TestCase):
    def test_rejects_when_mean_passes_but_one_query_is_below_floor(self) -> None:
        receipt = evaluate_qdrant_exact_alignment_gate(
            [1.0, 1.0, 0.8],
            minimum_exact_overlap_at_k=0.9,
        )

        self.assertGreaterEqual(receipt.mean_exact_overlap_at_k, 0.9)
        self.assertEqual(receipt.minimum_query_exact_overlap_at_k, 0.8)
        self.assertTrue(receipt.mean_floor_met)
        self.assertFalse(receipt.minimum_query_floor_met)
        self.assertFalse(receipt.hnsw_allowed)
        self.assertEqual(receipt.status, "QDRANT_EXACT_STORE_MISMATCH")

    def test_accepts_only_when_mean_and_worst_query_meet_floor(self) -> None:
        receipt = evaluate_qdrant_exact_alignment_gate(
            [1.0, 0.95, 0.9],
            minimum_exact_overlap_at_k=0.9,
        )

        self.assertTrue(receipt.mean_floor_met)
        self.assertTrue(receipt.minimum_query_floor_met)
        self.assertTrue(receipt.hnsw_allowed)
        self.assertEqual(receipt.status, "QDRANT_EXACT_ALIGNED")

    def test_rejects_invalid_inputs(self) -> None:
        with self.assertRaises(ValueError):
            evaluate_qdrant_exact_alignment_gate([], minimum_exact_overlap_at_k=0.9)
        with self.assertRaises(ValueError):
            evaluate_qdrant_exact_alignment_gate([1.1], minimum_exact_overlap_at_k=0.9)
        with self.assertRaises(ValueError):
            evaluate_qdrant_exact_alignment_gate([1.0], minimum_exact_overlap_at_k=-0.1)


if __name__ == "__main__":
    unittest.main()
