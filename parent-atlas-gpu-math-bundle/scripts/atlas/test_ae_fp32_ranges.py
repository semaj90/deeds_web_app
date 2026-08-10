#!/usr/bin/env python3
import unittest
import numpy as np

from ae_fp32_ranges import (
    ensure_fp32_finite, l2_normalize_fp32, lerp_fp32, slerp_fp32,
    interpolation_path, interpolation_report, range_stats,
)

class TestAeFp32Ranges(unittest.TestCase):
    def test_768_contract(self):
        x = np.ones((2, 768), dtype=np.float32)
        y = ensure_fp32_finite(x, expected_dim=768)
        self.assertEqual(y.dtype, np.float32)

    def test_reject_nonfinite(self):
        x = np.zeros((1, 768), dtype=np.float32); x[0, 7] = np.nan
        with self.assertRaises(ValueError): ensure_fp32_finite(x, expected_dim=768)

    def test_l2_norm(self):
        x = np.random.default_rng(3).normal(size=(4, 768)).astype(np.float32)
        y = l2_normalize_fp32(x)
        np.testing.assert_allclose(np.linalg.norm(y, axis=1), 1.0, atol=1e-5)

    def test_lerp_endpoints(self):
        a = np.array([1,2,3], np.float32); b = np.array([4,5,6], np.float32)
        np.testing.assert_array_equal(lerp_fp32(a,b,0), a)
        np.testing.assert_array_equal(lerp_fp32(a,b,1), b)

    def test_slerp_norm(self):
        a=np.array([1,0,0],np.float32); b=np.array([0,1,0],np.float32)
        m=slerp_fp32(a,b,0.5)
        self.assertAlmostEqual(float(np.linalg.norm(m)),1.0,places=5)

    def test_report(self):
        a=np.array([1,0,0],np.float32); b=np.array([0,1,0],np.float32)
        p=interpolation_path(a,b,5,spherical=True)
        r=interpolation_report(p)
        self.assertTrue(r['finite'])
        self.assertEqual(r['steps'],5)
        self.assertTrue(range_stats(p).finite)

if __name__ == '__main__': unittest.main()
