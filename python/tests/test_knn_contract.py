import unittest

from knn_contract import deterministic_topk_from_scores, deterministic_topk_with_boundary


class DeterministicTopKTests(unittest.TestCase):
    def test_score_order_uses_candidate_ordinal_for_exact_ties(self):
        result = deterministic_topk_from_scores(
            [0.9, 0.8, 0.8, 0.7], [50, 30, 10, 1], limit=3
        )
        self.assertEqual([(row[0], row[1]) for row in result], [(0.9, 50), (0.8, 10), (0.8, 30)])

    def test_fetches_all_candidates_tied_at_k_boundary_before_ordinal_sort(self):
        distances = [0.1, 0.2, 0.2, 0.2, 0.3, 0.4]
        ordinals = [40, 30, 10, 20, 50, 60]
        calls = []

        def search(limit):
            calls.append(limit)
            indices = [0, 1, 3, 2, 4, 5][:limit]
            return [distances[index] for index in indices], indices

        result = deterministic_topk_with_boundary(search, ordinals, limit=2)

        self.assertEqual([row[2] for row in result], [0, 2])
        self.assertEqual([row[1] for row in result], [40, 10])
        self.assertEqual(calls, [4, 6])

    def test_returns_all_rows_when_limit_exceeds_corpus(self):
        result = deterministic_topk_with_boundary(
            lambda limit: ([0.1, 0.2], [0, 1]), [8, 3], limit=10
        )
        self.assertEqual([row[1] for row in result], [8, 3])

    def test_rejects_duplicate_or_invalid_ordinals(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE_CANDIDATE_ORDINAL"):
            deterministic_topk_with_boundary(lambda limit: ([0.1], [0]), [1, 1], limit=1)
        with self.assertRaisesRegex(ValueError, "INVALID_CANDIDATE_ORDINAL"):
            deterministic_topk_with_boundary(lambda limit: ([0.1], [0]), [-1], limit=1)

    def test_rejects_nonfinite_and_malformed_search_results(self):
        with self.assertRaisesRegex(ValueError, "NONFINITE_DISTANCE"):
            deterministic_topk_with_boundary(lambda limit: ([float("nan")], [0]), [0], limit=1)
        with self.assertRaisesRegex(ValueError, "SEARCH_DISTANCES_NOT_ASCENDING"):
            deterministic_topk_with_boundary(lambda limit: ([0.2, 0.1], [0, 1]), [0, 1], limit=1)

    def test_canonical_candidate_ordinals_and_duplicate_rejection(self):
        from knn_contract import canonical_candidate_ordinals

        identities = [("pk-2", "rev-1"), ("pk-1", "rev-2"), ("pk-1", "rev-1")]
        # Sorted order: ("pk-1", "rev-1") -> rank 0 (pos 2), ("pk-1", "rev-2") -> rank 1 (pos 1), ("pk-2", "rev-1") -> rank 2 (pos 0)
        ordinals = canonical_candidate_ordinals(identities)
        self.assertEqual(ordinals, [2, 1, 0])

        with self.assertRaisesRegex(ValueError, "DUPLICATE_CANDIDATE_IDENTITY"):
            canonical_candidate_ordinals([("pk-1", "rev-1"), ("pk-1", "rev-1")])

    def test_l2_normalize_f32_valid_and_fail_closed(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy not installed in this Python environment")

        from knn_contract import l2_normalize_f32

        vecs = np.array([[3.0, 4.0], [1.0, 0.0]], dtype=np.float32)
        normed = l2_normalize_f32(vecs)
        self.assertAlmostEqual(float(np.linalg.norm(normed[0])), 1.0, places=6)
        self.assertAlmostEqual(float(np.linalg.norm(normed[1])), 1.0, places=6)

        # Zero norm
        with self.assertRaisesRegex(ValueError, "ZERO_OR_NONFINITE_NORM"):
            l2_normalize_f32(np.array([[0.0, 0.0]], dtype=np.float32))

        # Nonfinite norm
        with self.assertRaisesRegex(ValueError, "ZERO_OR_NONFINITE_NORM"):
            l2_normalize_f32(np.array([[float("nan"), 1.0]], dtype=np.float32))

    def test_boundary_extension_multiple_steps(self):
        # 10 rows, all tied at 0.5. Limit = 2.
        # Initial request: min(10, max(3, 4)) = 4.
        # 4 rows returned, all 0.5. boundary_distance = 0.5, last = 0.5.
        # Not > boundary and not full corpus -> requested grows: max(5, 8) = 8.
        # Next loop: 8 rows returned, all 0.5 -> requested grows to 10 (full corpus) -> completes.
        calls = []
        ordinals = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]

        def search(req_limit):
            calls.append(req_limit)
            return [0.5] * req_limit, list(range(req_limit))

        result = deterministic_topk_with_boundary(search, ordinals, limit=2)
        self.assertEqual(calls, [4, 8, 10])
        # Ranked by (distance, ordinal): distance is all 0.5, ordinals in corpus are [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]
        # Top 2 ordinals are 0 (pos 9) and 10 (pos 8)
        self.assertEqual([row[1] for row in result], [0, 10])
        self.assertEqual([row[2] for row in result], [9, 8])


if __name__ == "__main__":
    unittest.main()
