"""Unit tests for atlas_yolox_nano_v1 pure helpers (no model load). Run from repo root:
python -m unittest python/test_atlas_yolox_nano_v1.py
"""
import unittest

import numpy as np

import atlas_yolox_nano_v1 as y


class LetterboxTests(unittest.TestCase):
    def test_scale_and_padding_for_landscape(self):
        rgb = np.zeros((720, 1280, 3), np.uint8)
        tensor, scale = y.letterbox(rgb)
        self.assertAlmostEqual(scale, 416 / 1280, places=6)
        self.assertEqual(tensor.shape, (1, 3, 416, 416))
        # Bottom padding is the 114 fill value.
        self.assertEqual(tensor[0, 0, -1, -1], 114.0)

    def test_inverse_scale_maps_back_to_original_pixels(self):
        rgb = np.zeros((720, 1280, 3), np.uint8)
        _, scale = y.letterbox(rgb)
        # A point at the centre of the 416 canvas maps back to the centre of the source.
        cx_canvas = 208.0
        self.assertAlmostEqual(cx_canvas / scale, 640.0, delta=2.0)


class NmsTests(unittest.TestCase):
    def test_overlapping_lower_score_box_is_suppressed(self):
        dets = np.array([
            [0, 0, 100, 100, 0.9, 0],
            [5, 5, 105, 105, 0.8, 0],   # heavy overlap with the first
            [200, 200, 260, 260, 0.7, 1],
        ], dtype=np.float32)
        kept = y.nms(dets, iou_thr=0.45)
        self.assertEqual(len(kept), 2)
        self.assertAlmostEqual(float(kept[0, 4]), 0.9, places=5)

    def test_empty_input(self):
        self.assertEqual(y.nms(np.zeros((0, 6), np.float32)).size, 0)


class DecodeTests(unittest.TestCase):
    def test_anchor_count_mismatch_is_rejected(self):
        with self.assertRaises(ValueError):
            y.decode(np.zeros((10, 85), np.float32), 1.0)

    def test_decode_returns_original_pixel_boxes(self):
        n = 3549  # 52^2 + 26^2 + 13^2
        raw = np.zeros((n, 85), np.float32)
        raw[0, 0:4] = [0.0, 0.0, 0.0, 0.0]  # cx=0+grid, w=exp(0)*8
        raw[0, 4] = 10.0  # high objectness after sigmoid-free test input
        raw[0, 5] = 10.0
        out = y.decode(raw, scale=0.5)
        self.assertEqual(out.shape[1], 6)
        self.assertEqual(int(out[0, 5]), 0)


class ObservationShapeTests(unittest.TestCase):
    def test_records_are_image_frame_observed_without_world_position(self):
        recs = y.observation_records(
            [{"classLabel": "person", "detectionConfidence": 0.9, "bboxXYXY": [1.0, 2.0, 30.0, 40.0]}],
            evidence_id="a7c2e801-d3a9-42e3-ad2c-ac0cc8c20778",
            source_sha256="sha256:" + "c" * 64,
            frame_pts_ms=2750,
            image_size=(1280, 720),
        )
        r = recs[0]
        self.assertEqual(r["coordinateFrame"], "image")
        self.assertEqual(r["status"], "observed")
        self.assertIsNone(r["depthType"])
        self.assertNotIn("worldPosition", r)
        self.assertEqual(r["framePtsMs"], 2750)


if __name__ == "__main__":
    unittest.main()
