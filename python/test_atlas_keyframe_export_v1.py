"""Tests for atlas_keyframe_export_v1. Run from repo root: python -m unittest python/test_atlas_keyframe_export_v1.py"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

import atlas_keyframe_export_v1 as ex


class ExportTests(unittest.TestCase):
    def test_png_and_jpeg_written_with_hashes_and_sidecar(self):
        with tempfile.TemporaryDirectory() as d:
            rgb = np.full((20, 30, 3), 120, np.uint8)
            s = ex.export_frame(rgb, Path(d) / "kf", formats=("png", "jpeg"))
            self.assertEqual(s["width"], 30)
            self.assertTrue(s["files"]["png"]["sha256"].startswith("sha256:"))
            self.assertTrue(Path(s["files"]["jpeg"]["path"]).exists())
            self.assertTrue((Path(d) / "kf.export.json").exists())

    def test_rejects_unknown_format_and_bad_array(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                ex.export_frame(np.zeros((4, 4, 3), np.uint8), Path(d) / "x", formats=("gif",))
            with self.assertRaises(ValueError):
                ex.export_frame(np.zeros((4, 4), np.uint8), Path(d) / "y")


class BackgroundTests(unittest.TestCase):
    def test_object_region_is_replaced_and_rest_is_unchanged(self):
        rgb = np.zeros((40, 40, 3), np.uint8)
        rgb[:, :] = (60, 90, 120)
        rgb[10:20, 10:20] = (255, 0, 0)  # the "object"
        mask = np.zeros((40, 40), np.uint8)
        mask[10:20, 10:20] = 1
        plate = ex.background_plate(rgb, [mask], dilate_px=0)
        self.assertFalse(np.array_equal(plate[12:18, 12:18], rgb[12:18, 12:18]))  # object removed
        np.testing.assert_array_equal(plate[0:5, 0:5], rgb[0:5, 0:5])  # far background unchanged
        np.testing.assert_array_equal(rgb[10:20, 10:20, 0], 255)  # input not modified

    def test_no_masks_returns_copy(self):
        rgb = np.full((8, 8, 3), 7, np.uint8)
        out = ex.background_plate(rgb, [])
        np.testing.assert_array_equal(out, rgb)
        self.assertIsNot(out, rgb)

    def test_mask_size_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            ex.background_plate(np.zeros((8, 8, 3), np.uint8), [np.zeros((4, 4), np.uint8)])

    def test_cut_out_is_tight_rgba(self):
        rgb = np.full((10, 10, 3), 200, np.uint8)
        m = np.zeros((10, 10), np.uint8)
        m[2:5, 3:7] = 1
        c = ex.cut_out(rgb, m)
        self.assertEqual(c.shape, (3, 4, 4))
        self.assertTrue((c[..., 3] == 255).all())

    def test_empty_mask_cut_out_rejected(self):
        with self.assertRaises(ValueError):
            ex.cut_out(np.zeros((4, 4, 3), np.uint8), np.zeros((4, 4), np.uint8))


if __name__ == "__main__":
    unittest.main()
