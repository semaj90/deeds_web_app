"""Tests for atlas_depth_anything_v1 (normalization, receipt shape) and atlas_image_enhance_v1.

Run: python -m unittest python/test_atlas_depth_and_enhance_v1.py   (from the repo root)
No model is loaded; the depth model path is tested only through its pure helpers.
"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

import atlas_depth_anything_v1 as depth
import atlas_image_enhance_v1 as enh


class DepthHelperTests(unittest.TestCase):
    def test_normalize_maps_range_to_uint8(self):
        d = np.array([[0.0, 5.0], [10.0, 2.5]], dtype=np.float32)
        u8 = depth.normalize_depth_u8(d)
        self.assertEqual(u8.dtype, np.uint8)
        self.assertEqual(u8.min(), 0)
        self.assertEqual(u8.max(), 255)

    def test_normalize_rejects_non_2d_and_all_nan(self):
        with self.assertRaises(ValueError):
            depth.normalize_depth_u8(np.zeros((2, 2, 2), dtype=np.float32))
        with self.assertRaises(ValueError):
            depth.normalize_depth_u8(np.full((2, 2), np.nan, dtype=np.float32))

    def test_normalize_ignores_nan_samples(self):
        d = np.array([[np.nan, 1.0], [3.0, 2.0]], dtype=np.float32)
        u8 = depth.normalize_depth_u8(d)
        self.assertEqual(u8[0, 0], 0)
        self.assertEqual(u8[1, 0], 255)

    def test_receipt_records_revision_hashes_and_relative_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            weights = tmpdir / "model.safetensors"
            weights.write_bytes(b"fake-weights")
            npy = tmpdir / "depth.npy"
            d = np.ones((4, 6), dtype=np.float32)
            np.save(npy, d)
            receipt = depth.build_receipt(
                weights=weights,
                image_bytes=b"img",
                image_size=(6, 4),
                depth=d,
                device="cpu",
                load_s=0.1,
                infer_s=0.2,
                png_bytes=b"png",
                npy_path=npy,
            )
        self.assertEqual(receipt["model"]["revision"], depth.MODEL_REVISION)
        self.assertEqual(receipt["depthType"], "relative_monocular")
        self.assertTrue(receipt["input"]["sha256"].startswith("sha256:"))
        self.assertEqual(receipt["output"]["width"], 6)
        self.assertEqual(receipt["output"]["height"], 4)
        self.assertTrue(any("relative depth only" in s for s in receipt["limits"]))


class OrientationTests(unittest.TestCase):
    def test_exif_orientation_is_applied_before_depth(self):
        import io

        from PIL import Image

        img = Image.new("RGB", (20, 10), (200, 10, 10))  # landscape 20x10
        exif = Image.Exif()
        exif[0x0112] = 6  # Orientation: rotate 90 degrees clockwise to display
        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif.tobytes())
        oriented = depth.load_oriented_rgb(buf.getvalue())
        self.assertEqual(oriented.size, (10, 20))


class EnhanceTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(0)
        self.sharp = np.zeros((64, 64), dtype=np.uint8)
        self.sharp[:, 32:] = 255
        self.noise = rng.integers(0, 256, size=(64, 64), dtype=np.uint8)
        self.flat = np.full((64, 64), 128, dtype=np.uint8)

    def test_blur_score_orders_sharp_above_flat(self):
        self.assertGreater(enh.blur_score(self.sharp), enh.blur_score(self.flat))

    def test_blur_score_lower_after_gaussian_blur(self):
        import cv2

        blurred = cv2.GaussianBlur(self.sharp, (9, 9), 3)
        self.assertLess(enh.blur_score(blurred), enh.blur_score(self.sharp))

    def test_helpers_return_new_arrays_and_keep_input(self):
        before = self.noise.copy()
        out = enh.clahe(self.noise)
        self.assertIsNot(out, self.noise)
        np.testing.assert_array_equal(self.noise, before)
        self.assertEqual(enh.unsharp(self.sharp).shape, self.sharp.shape)
        self.assertEqual(enh.adaptive_binary(self.noise).dtype, np.uint8)

    def test_rejects_wrong_dtype_and_shape(self):
        with self.assertRaises(ValueError):
            enh.blur_score(self.sharp.astype(np.float32))
        with self.assertRaises(ValueError):
            enh.clahe(np.zeros((8, 8, 3), dtype=np.uint8))

    def test_bad_params_rejected(self):
        with self.assertRaises(ValueError):
            enh.unsharp(self.sharp, sigma=0)
        with self.assertRaises(ValueError):
            enh.adaptive_binary(self.sharp, block=4)

    def test_redact_blur_changes_only_the_box(self):
        bgr = np.zeros((40, 40, 3), dtype=np.uint8)
        bgr[:, :, :] = np.arange(40, dtype=np.uint8)[None, :, None]
        out = enh.redact_box(bgr, (10, 10, 30, 30), mode="blur", strength=7)
        np.testing.assert_array_equal(out[:10, :], bgr[:10, :])
        np.testing.assert_array_equal(out[30:, :], bgr[30:, :])
        self.assertFalse(np.array_equal(out[10:30, 10:30], bgr[10:30, 10:30]))
        np.testing.assert_array_equal(bgr[10:30, 10:30], bgr[10:30, 10:30])  # input untouched

    def test_redact_pixelate_produces_blocks(self):
        bgr = np.random.default_rng(1).integers(0, 256, size=(40, 40, 3), dtype=np.uint8)
        out = enh.redact_box(bgr, (0, 0, 20, 20), mode="pixelate", strength=10)
        self.assertEqual(out.shape, bgr.shape)
        self.assertTrue(np.array_equal(out[0:10, 0:10], np.repeat(np.repeat(out[0:1, 0:1], 10, 0), 10, 1)))

    def test_redact_rejects_out_of_bounds_and_unknown_mode(self):
        bgr = np.zeros((10, 10, 3), dtype=np.uint8)
        with self.assertRaises(ValueError):
            enh.redact_box(bgr, (0, 0, 11, 5))
        with self.assertRaises(ValueError):
            enh.redact_box(bgr, (0, 0, 5, 5), mode="erase")


if __name__ == "__main__":
    unittest.main()
