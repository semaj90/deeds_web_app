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


if __name__ == "__main__":
    unittest.main()
