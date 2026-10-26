"""RFF transform tests. Stdlib unittest, so they run in any env with torch and no pytest."""

from __future__ import annotations

import unittest

import torch

from atlas_rff_features_v1 import build_rff, rbf_exact_on_normalized, rff_transform


def _unit_rows(n: int, d: int, seed: int) -> torch.Tensor:
    g = torch.Generator().manual_seed(seed)
    x = torch.randn(n, d, generator=g, dtype=torch.float64)
    return x / x.norm(dim=1, keepdim=True)


class RffTransformTests(unittest.TestCase):
    def test_shapes_and_validation(self):
        w, b = build_rff(input_dim=16, output_dim=64, sigma=1.0, seed=0)
        self.assertEqual(tuple(w.shape), (64, 16))
        self.assertEqual(tuple(b.shape), (64,))
        z = rff_transform(torch.randn(5, 16), w, b)
        self.assertEqual(tuple(z.shape), (5, 64))
        with self.assertRaises(ValueError):
            build_rff(input_dim=0, output_dim=4, sigma=1.0, seed=0)
        with self.assertRaises(ValueError):
            build_rff(input_dim=4, output_dim=4, sigma=0.0, seed=0)
        with self.assertRaises(ValueError):
            rff_transform(torch.randn(3, 7), w, b)

    def test_fixed_seed_is_deterministic_and_seed_sensitive(self):
        w1, b1 = build_rff(8, 32, 0.7, seed=123)
        w2, b2 = build_rff(8, 32, 0.7, seed=123)
        w3, _ = build_rff(8, 32, 0.7, seed=124)
        self.assertTrue(torch.equal(w1, w2))
        self.assertTrue(torch.equal(b1, b2))
        self.assertFalse(torch.equal(w1, w3))

    def test_rbf_approximation_quality(self):
        d, big_d, sigma = 32, 8192, 1.0
        x = _unit_rows(64, d, seed=7).float()
        w, b = build_rff(d, big_d, sigma, seed=42)
        z = rff_transform(x, w, b)
        approx = z @ z.T
        exact = rbf_exact_on_normalized(x.double(), sigma).float()
        mean_abs_err = (approx - exact).abs().mean().item()
        self.assertLess(mean_abs_err, 0.02, mean_abs_err)

    def test_rff_kernel_is_distinct_from_cosine_similarity(self):
        d, big_d, sigma = 32, 4096, 0.5
        x = _unit_rows(48, d, seed=11).float()
        w, b = build_rff(d, big_d, sigma, seed=5)
        z = rff_transform(x, w, b)
        rff_gram = z @ z.T
        cosine = x @ x.T
        # The RBF-style kernel on normalized inputs is not the raw cosine similarity.
        self.assertGreater((rff_gram - cosine).abs().max().item(), 0.05)


if __name__ == "__main__":
    unittest.main()
