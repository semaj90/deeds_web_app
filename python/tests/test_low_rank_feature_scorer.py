#!/usr/bin/env python3
"""test_low_rank_feature_scorer.py — Unit tests for low_rank_feature_scorer."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from atlas_compute.low_rank_feature_scorer import (
    FEATURE_NAMES,
    NUM_FEATURES,
    LowRankFeatureScorer,
    gelu,
)


class TestLowRankFeatureScorer(unittest.TestCase):
    def setUp(self):
        self.mu = [0.5, 50.0, 0.05, 2.0, 0.8, 10.0, 0.1, 0.5]
        self.sigma = [0.2, 25.0, 0.02, 1.0, 0.15, 5.0, 0.05, 0.5]
        self.scorer = LowRankFeatureScorer(hidden_dim=8, mu=self.mu, sigma=self.sigma)

    def test_feature_names(self):
        self.assertEqual(len(FEATURE_NAMES), 8)
        self.assertEqual(NUM_FEATURES, 8)
        self.assertIn("dense_similarity", FEATURE_NAMES)
        self.assertIn("pagerank", FEATURE_NAMES)

    def test_gelu_activation(self):
        self.assertAlmostEqual(gelu(0.0), 0.0, places=4)
        self.assertGreater(gelu(1.0), 0.8)
        self.assertLess(gelu(-2.0), 0.0)

    def test_normalization(self):
        # Value equal to mu should normalize to 0.0
        norm = self.scorer.normalize(self.mu)
        for val in norm:
            self.assertAlmostEqual(val, 0.0, places=4)

        # Value equal to mu + sigma should normalize to 1.0
        plus_one = [m + s for m, s in zip(self.mu, self.sigma)]
        norm_plus = self.scorer.normalize(plus_one)
        for val in norm_plus:
            self.assertAlmostEqual(val, 1.0, places=4)

    def test_rerank_candidates(self):
        cids = ["chunk:A", "chunk:B", "chunk:C"]
        features = [
            [0.9, 10.0, 0.08, 1.0, 0.95, 2.0, 0.02, 1.0],  # Strong candidate
            [0.2, 80.0, 0.01, 5.0, 0.30, 25.0, 0.30, 0.0],  # Weak candidate
            [0.6, 40.0, 0.04, 2.0, 0.75, 8.0, 0.08, 1.0],  # Medium candidate
        ]
        results = self.scorer.rerank_candidates(cids, features)

        self.assertEqual(len(results), 3)
        self.assertEqual(results[0].advisory_rank, 0)
        self.assertEqual(results[1].advisory_rank, 1)
        self.assertEqual(results[2].advisory_rank, 2)

        # Traceability: original rank preserved
        orig_ranks = {r.candidate_id: r.original_rank for r in results}
        self.assertEqual(orig_ranks["chunk:A"], 0)
        self.assertEqual(orig_ranks["chunk:B"], 1)
        self.assertEqual(orig_ranks["chunk:C"], 2)

    def test_dimension_mismatch_raises(self):
        with self.assertRaises(ValueError):
            self.scorer.normalize([1.0, 2.0])  # Missing features


if __name__ == "__main__":
    unittest.main()
