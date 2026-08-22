from __future__ import annotations

import unittest

import numpy as np

from atlas_compute.binary_hamming import (
    evaluate_binary_hamming_retrieval,
    rank_binary_hamming_exact,
    spread_query_ordinals,
)


class BinaryHammingTests(unittest.TestCase):
    def test_exact_rank_uses_hamming_distance_and_ordinal_tiebreak(self) -> None:
        encoded = np.asarray([
            [0b00000000],
            [0b00000001],
            [0b00000010],
            [0b00000011],
        ], dtype=np.uint8)
        ranking, distances = rank_binary_hamming_exact(encoded, query_ordinal=0, top_k=3)
        self.assertEqual(ranking, [1, 2, 3])
        self.assertEqual(distances, [1, 1, 2])

    def test_spread_query_ordinals_cover_full_corpus_deterministically(self) -> None:
        self.assertEqual(spread_query_ordinals(10, 4), [0, 3, 6, 9])
        self.assertEqual(spread_query_ordinals(5000, 32)[0], 0)
        self.assertEqual(spread_query_ordinals(5000, 32)[-1], 4999)
        self.assertEqual(len(set(spread_query_ordinals(5000, 32))), 32)

    def test_receipt_measures_mean_worst_overlap_and_boundary_ties(self) -> None:
        encoded = np.asarray([
            [0b00000000],
            [0b00000001],
            [0b00000010],
            [0b00000011],
            [0b11111111],
        ], dtype=np.uint8)
        receipt = evaluate_binary_hamming_retrieval(
            encoded,
            query_ordinals=[0, 4],
            exact_reference_ordinals=[[1, 2], [3, 1]],
            top_k=2,
            benchmark_repeats=2,
        )
        self.assertEqual(receipt.schema, "atlas.binary-hamming-retrieval-receipt.v1")
        self.assertEqual(receipt.search_backend, "numpy_exact_popcount")
        self.assertEqual(receipt.search_metric, "bitwise_hamming")
        self.assertTrue(receipt.self_exclusion)
        self.assertEqual(receipt.mean_overlap_at_k, 1.0)
        self.assertEqual(receipt.minimum_query_overlap_at_k, 1.0)
        self.assertGreaterEqual(receipt.mean_boundary_tie_count, 1.0)
        self.assertGreaterEqual(receipt.maximum_boundary_tie_count, 1)
        self.assertEqual(len(receipt.rankings_checksum), 64)
        self.assertEqual(len(receipt.distances_checksum), 64)
        self.assertFalse(receipt.canonical_authority)

    def test_reference_must_be_self_excluding(self) -> None:
        encoded = np.asarray([[0], [1], [3]], dtype=np.uint8)
        with self.assertRaises(ValueError):
            evaluate_binary_hamming_retrieval(
                encoded,
                query_ordinals=[0],
                exact_reference_ordinals=[[0, 1]],
                top_k=2,
            )

    def test_invalid_encoded_values_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            rank_binary_hamming_exact(
                np.asarray([[0], [256]], dtype=np.int32),
                query_ordinal=0,
                top_k=1,
            )

    def test_invalid_spread_query_count_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            spread_query_ordinals(3, 4)


if __name__ == "__main__":
    unittest.main()
