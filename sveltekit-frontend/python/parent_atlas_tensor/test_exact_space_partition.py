from __future__ import annotations

import importlib.util
import unittest

import numpy as np

from parent_atlas_tensor.exact_space_partition import exact_search


class ExactSpacePartitionTests(unittest.TestCase):
    def setUp(self) -> None:
        rng = np.random.default_rng(42)
        self.corpus = rng.normal(size=(256, 6)).astype(np.float64)
        self.queries = rng.normal(size=(8, 6)).astype(np.float64)
        self.ids = [f"C{i:04d}" for i in range(self.corpus.shape[0])]

    def _ids(self, rows):
        return [[row.canonical_id for row in query_rows] for query_rows in rows]

    def test_brute_is_deterministic(self):
        first, receipt = exact_search(
            algorithm="brute",
            corpus=self.corpus,
            queries=self.queries,
            canonical_ids=self.ids,
            k=10,
            metric="euclidean",
        )
        second, _ = exact_search(
            algorithm="brute",
            corpus=self.corpus,
            queries=self.queries,
            canonical_ids=self.ids,
            k=10,
            metric="euclidean",
        )
        self.assertEqual(self._ids(first), self._ids(second))
        self.assertTrue(receipt.exact)
        self.assertTrue(receipt.canonical_tie_break)

    @unittest.skipUnless(importlib.util.find_spec("scipy") is not None, "scipy unavailable")
    def test_ckdtree_matches_brute_euclidean(self):
        brute, _ = exact_search(
            algorithm="brute", corpus=self.corpus, queries=self.queries,
            canonical_ids=self.ids, k=12, metric="euclidean",
        )
        tree, receipt = exact_search(
            algorithm="scipy_ckdtree", corpus=self.corpus, queries=self.queries,
            canonical_ids=self.ids, k=12, metric="euclidean", leaf_size=30,
        )
        self.assertEqual(self._ids(tree), self._ids(brute))
        self.assertFalse(receipt.post_verified)

    @unittest.skipUnless(importlib.util.find_spec("sklearn") is not None, "scikit-learn unavailable")
    def test_sklearn_kdtree_matches_brute_manhattan(self):
        brute, _ = exact_search(
            algorithm="brute", corpus=self.corpus, queries=self.queries,
            canonical_ids=self.ids, k=7, metric="manhattan",
        )
        tree, _ = exact_search(
            algorithm="sklearn_kdtree", corpus=self.corpus, queries=self.queries,
            canonical_ids=self.ids, k=7, metric="manhattan", leaf_size=30,
        )
        self.assertEqual(self._ids(tree), self._ids(brute))

    @unittest.skipUnless(importlib.util.find_spec("sklearn") is not None, "scikit-learn unavailable")
    def test_balltree_matches_brute_euclidean(self):
        brute, _ = exact_search(
            algorithm="brute", corpus=self.corpus, queries=self.queries,
            canonical_ids=self.ids, k=9, metric="euclidean",
        )
        tree, _ = exact_search(
            algorithm="sklearn_balltree", corpus=self.corpus, queries=self.queries,
            canonical_ids=self.ids, k=9, metric="euclidean", leaf_size=30,
        )
        self.assertEqual(self._ids(tree), self._ids(brute))

    @unittest.skipUnless(importlib.util.find_spec("scipy") is not None, "scipy unavailable")
    def test_quaternion_antipodal_ckdtree_matches_angular_brute(self):
        rng = np.random.default_rng(7)
        corpus = rng.normal(size=(300, 4))
        corpus /= np.linalg.norm(corpus, axis=1, keepdims=True)
        queries = rng.normal(size=(5, 4))
        queries /= np.linalg.norm(queries, axis=1, keepdims=True)
        ids = [f"Q{i:04d}" for i in range(corpus.shape[0])]

        brute, _ = exact_search(
            algorithm="brute", corpus=corpus, queries=queries,
            canonical_ids=ids, k=10, metric="quaternion_angular",
        )
        tree, receipt = exact_search(
            algorithm="scipy_ckdtree", corpus=corpus, queries=queries,
            canonical_ids=ids, k=10, metric="quaternion_angular", leaf_size=20,
        )
        self.assertEqual(self._ids(tree), self._ids(brute))
        self.assertTrue(receipt.post_verified)

    def test_duplicate_ids_are_rejected(self):
        ids = self.ids.copy()
        ids[-1] = ids[0]
        with self.assertRaisesRegex(ValueError, "canonical_ids must be unique"):
            exact_search(
                algorithm="brute", corpus=self.corpus, queries=self.queries,
                canonical_ids=ids, k=4, metric="euclidean",
            )


if __name__ == "__main__":
    unittest.main()
