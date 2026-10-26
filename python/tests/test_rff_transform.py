"""Unit tests for Random Fourier Features (RFF) prototype in atlas_compute."""

from __future__ import annotations

import unittest
import torch
import torch.nn.functional as F

from atlas_compute.rff_transform import (
    build_rff,
    rff_transform,
    rbf_kernel_exact,
    rff_approx_kernel,
)


class TestRFFTransform(unittest.TestCase):
    def test_output_shapes(self) -> None:
        """Verify projection produces expected output shapes for 2D and 3D inputs."""
        w, b = build_rff(input_dim=768, output_dim=256, seed=42)
        self.assertEqual(w.shape, (768, 256))
        self.assertEqual(b.shape, (256,))

        # 2D batch
        x_2d = torch.randn(16, 768)
        z_2d = rff_transform(x_2d, w, b)
        self.assertEqual(z_2d.shape, (16, 256))

        # 3D sequence batch
        x_3d = torch.randn(4, 8, 768)
        z_3d = rff_transform(x_3d, w, b)
        self.assertEqual(z_3d.shape, (4, 8, 256))

    def test_determinism_and_seed_reproducibility(self) -> None:
        """Verify identical seed produces bit-identical weights and projections."""
        w1, b1 = build_rff(input_dim=768, output_dim=256, seed=12345)
        w2, b2 = build_rff(input_dim=768, output_dim=256, seed=12345)
        w3, b3 = build_rff(input_dim=768, output_dim=256, seed=99999)

        self.assertTrue(torch.equal(w1, w2))
        self.assertTrue(torch.equal(b1, b2))
        self.assertFalse(torch.equal(w1, w3))

        x = torch.randn(10, 768)
        z1 = rff_transform(x, w1, b1)
        z2 = rff_transform(x, w2, b2)
        self.assertTrue(torch.equal(z1, z2))

    def test_rbf_kernel_approximation_fidelity(self) -> None:
        """Verify inner product of RFF features approximates exact Gaussian RBF kernel.

        With D=2048 or D=1024, approximation error is small. We test that with D=2048,
        mean absolute error between exact RBF and RFF inner product is < 0.05.
        """
        torch.manual_seed(100)
        n = 20
        d_in = 768
        d_rff = 2048
        sigma = 1.0

        x = torch.randn(n, d_in)
        y = torch.randn(n, d_in)

        # Build RFF and project
        w, b = build_rff(input_dim=d_in, output_dim=d_rff, sigma=sigma, seed=42)
        zx = rff_transform(x, w, b, normalize_input=True)
        zy = rff_transform(y, w, b, normalize_input=True)

        k_exact = rbf_kernel_exact(x, y, sigma=sigma, normalize_input=True)
        k_approx = rff_approx_kernel(zx, zy)

        mae = torch.mean(torch.abs(k_exact - k_approx)).item()
        # Monte-Carlo standard error for D=2048 is ~ 1/sqrt(2048) ~ 0.022
        self.assertLess(mae, 0.05, f"RFF approximation error MAE was {mae:.4f}, expected < 0.05")

    def test_divergence_from_raw_cosine_similarity(self) -> None:
        """Verify RFF inner product matches non-linear RBF kernel, distinct from raw cosine."""
        torch.manual_seed(200)
        x = F.normalize(torch.randn(10, 768), p=2, dim=-1)
        # Create y with known cosine similarities
        y = x.clone()  # identical: cos = 1.0
        y_neg = -x.clone()  # opposite: cos = -1.0

        w, b = build_rff(input_dim=768, output_dim=1024, sigma=1.0, seed=42)
        zx = rff_transform(x, w, b, normalize_input=False)
        zy = rff_transform(y, w, b, normalize_input=False)
        zy_neg = rff_transform(y_neg, w, b, normalize_input=False)

        # For identical vectors, dist=0 -> RBF kernel = exp(0) = 1.0, approx should be ~1.0
        k_ident = torch.diagonal(rff_approx_kernel(zx, zy))
        self.assertTrue(torch.allclose(k_ident, torch.ones_like(k_ident), atol=0.08))

        # For opposite vectors, dist^2 = 4 -> RBF kernel = exp(-4 / 2) = exp(-2) ~ 0.135
        # Raw cosine would be -1.0!
        k_neg = torch.diagonal(rff_approx_kernel(zx, zy_neg))
        expected_neg_rbf = torch.exp(torch.tensor(-2.0))
        self.assertTrue(torch.allclose(k_neg, expected_neg_rbf.expand_as(k_neg), atol=0.08))

    def test_invalid_parameters_raise(self) -> None:
        """Verify invalid parameters fail closed with ValueError."""
        with self.assertRaises(ValueError):
            build_rff(input_dim=-1, output_dim=256)
        with self.assertRaises(ValueError):
            build_rff(input_dim=768, output_dim=0)
        with self.assertRaises(ValueError):
            build_rff(input_dim=768, output_dim=256, sigma=-0.5)

        w, b = build_rff(input_dim=768, output_dim=256)
        with self.assertRaises(ValueError):
            # Input dim mismatch: 384 vs 768
            rff_transform(torch.randn(4, 384), w, b)


if __name__ == "__main__":
    unittest.main()
