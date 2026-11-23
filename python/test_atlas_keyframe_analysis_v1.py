"""Unit tests for atlas_keyframe_analysis_v1 pure helpers (no SAM 2, no Tesseract). Run from repo root:
python -m unittest python/test_atlas_keyframe_analysis_v1.py
"""
import base64
import io
import unittest

import numpy as np
from PIL import Image

import atlas_keyframe_analysis_v1 as ka


class BoxTests(unittest.TestCase):
    def test_normalizes_and_clips_to_unit_square(self):
        nb = ka.normalized_box([-10, 0, 640, 360], 1280, 720)
        self.assertEqual(nb, [0.0, 0.0, 0.5, 0.5])

    def test_rejects_degenerate_after_normalization(self):
        with self.assertRaises(ValueError):
            ka.normalized_box([5, 5, 5, 9], 1280, 720)


class MaskTests(unittest.TestCase):
    def test_mask_round_trip_and_stats(self):
        m = np.zeros((10, 20), np.uint8)
        m[2:5, 4:9] = 255
        buf = io.BytesIO()
        Image.fromarray(m).save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        mask = ka.mask_from_png_b64(b64, 20, 10)
        stats = ka.mask_stats(mask)
        self.assertEqual(stats["pixels"], 15)
        self.assertEqual(stats["bboxXYXY"], [4, 2, 9, 5])

    def test_empty_mask_has_no_bbox(self):
        self.assertEqual(ka.mask_stats(np.zeros((4, 4), bool)), {"pixels": 0, "bboxXYXY": None})

    def test_mask_size_mismatch_rejected(self):
        buf = io.BytesIO()
        Image.fromarray(np.zeros((4, 4), np.uint8)).save(buf, format="PNG")
        with self.assertRaises(ValueError):
            ka.mask_from_png_b64(base64.b64encode(buf.getvalue()).decode(), 8, 8)


class DepthTests(unittest.TestCase):
    def test_median_inside_box_ignores_nan(self):
        d = np.full((6, 6), 100.0, np.float32)
        d[0:2, 0:2] = [[1, 2], [3, np.nan]]
        self.assertEqual(ka.box_median_depth(d, [0, 0, 2, 2]), 2.0)

    def test_empty_box_rejected(self):
        d = np.full((4, 4), np.nan, np.float32)
        with self.assertRaises(ValueError):
            ka.box_median_depth(d, [0, 0, 2, 2])


class OcrPreprocessTests(unittest.TestCase):
    def test_enhance_returns_binary_image_same_shape(self):
        g = np.random.default_rng(0).integers(0, 256, (40, 60), dtype=np.uint8)
        out = ka.enhance_for_ocr(g)
        self.assertEqual(out.shape, (g.shape[0] * ka.OCR_UPSCALE, g.shape[1] * ka.OCR_UPSCALE))
        self.assertTrue(set(np.unique(out).tolist()) <= {0, 255})


if __name__ == "__main__":
    unittest.main()
