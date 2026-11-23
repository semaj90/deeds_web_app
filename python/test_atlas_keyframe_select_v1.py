"""Tests for atlas_keyframe_select_v1. Encodes small synthetic videos with PyAV (mpeg4, always available).

Run: python -m unittest python/test_atlas_keyframe_select_v1.py   (from the repo root)
"""
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

import numpy as np

import atlas_keyframe_select_v1 as ks


def encode(path: Path, colours: list[tuple[int, int, int]], seconds_each: float, fps: int = 10, size=(128, 96)):
    import av

    w, h = size
    out = av.open(str(path), "w")
    stream = out.add_stream("mpeg4", rate=fps)
    stream.width = w
    stream.height = h
    stream.pix_fmt = "yuv420p"
    frames_per_colour = int(round(seconds_each * fps))
    pts = 0
    for colour in colours:
        arr = np.zeros((h, w, 3), dtype=np.uint8)
        arr[:, :] = colour
        for _ in range(frames_per_colour):
            f = av.VideoFrame.from_ndarray(arr, format="rgb24")
            f.pts = pts
            f.time_base = Fraction(1, fps)
            pts += 1
            for packet in stream.encode(f):
                out.mux(packet)
    for packet in stream.encode(None):
        out.mux(packet)
    out.close()


class KeyframeSelectorTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_scene_changes_are_selected_with_pts(self):
        video = self.dir / "cuts.mp4"
        encode(video, [(200, 20, 20), (20, 200, 20), (20, 20, 200)], seconds_each=2.0)
        samples, meta = ks.sample_video(video, sample_fps=10.0)
        keyframes = ks.select_keyframes(samples, change_threshold=0.05, min_gap_ms=500)
        reasons = [k.reason for k in keyframes]
        self.assertEqual(reasons[0], "first_frame")
        changes = [k for k in keyframes if k.reason == "visual_change"]
        self.assertGreaterEqual(len(changes), 2)
        pts = [k.pts_ms for k in changes]
        # The two cuts are at about 2000 ms and 4000 ms; allow codec and sampling slack.
        self.assertTrue(any(1500 <= p <= 2600 for p in pts), pts)
        self.assertTrue(any(3500 <= p <= 4600 for p in pts), pts)
        # PTS is monotonic and derived from the stream, not from sample order alone.
        all_pts = [k.pts_ms for k in keyframes]
        self.assertEqual(all_pts, sorted(all_pts))
        self.assertIn("timeBase", meta)

    def test_static_video_gets_only_periodic_fallback(self):
        video = self.dir / "static.mp4"
        encode(video, [(90, 90, 90)], seconds_each=25.0)
        samples, _ = ks.sample_video(video, sample_fps=1.0)
        keyframes = ks.select_keyframes(samples, change_threshold=0.08, max_gap_ms=10_000)
        reasons = [k.reason for k in keyframes]
        self.assertEqual(reasons.count("visual_change"), 0)
        self.assertEqual(reasons[0], "first_frame")
        self.assertGreaterEqual(reasons.count("periodic_fallback"), 1)

    def test_receipt_hashes_source_and_records_params(self):
        video = self.dir / "small.mp4"
        encode(video, [(10, 10, 10), (240, 240, 240)], seconds_each=1.0)
        samples, meta = ks.sample_video(video, sample_fps=10.0)
        keyframes = ks.select_keyframes(samples)
        receipt = ks.build_receipt(video, meta, samples, keyframes, {"sampleFps": 10.0})
        self.assertEqual(receipt["schema"], ks.SELECTOR_SCHEMA)
        self.assertEqual(receipt["source"]["sha256"], ks.sha256_file(video))
        self.assertEqual(receipt["params"]["sampleFps"], 10.0)
        self.assertTrue(any("not evidence" in s for s in receipt["limits"]))

    def test_near_duplicates_are_dropped_within_min_gap(self):
        # Same visual content repeated: a change within the window but identical dhash is suppressed.
        base = ks.Sample(index=0, pts_ms=0, gray64=np.zeros((64, 64), np.uint8), sharp=1.0, dhash=0b1010)
        samples = [base]
        for i in range(1, 6):
            gray = np.full((64, 64), 255 if i % 2 else 0, np.uint8)
            samples.append(ks.Sample(index=i, pts_ms=i * 200, gray64=gray, sharp=1.0, dhash=0b1010))
        keyframes = ks.select_keyframes(samples, change_threshold=0.05, min_gap_ms=2000, dedupe_hamming=6)
        self.assertEqual([k.reason for k in keyframes], ["first_frame"])

    def test_cap_is_deterministic_and_keeps_endpoints(self):
        samples = [
            ks.Sample(index=i, pts_ms=i * 3000, gray64=np.full((64, 64), (i * 37) % 256, np.uint8), sharp=1.0, dhash=i)
            for i in range(50)
        ]
        a = ks.select_keyframes(samples, change_threshold=0.0, min_gap_ms=0, dedupe_hamming=-1, max_keyframes=10)
        b = ks.select_keyframes(samples, change_threshold=0.0, min_gap_ms=0, dedupe_hamming=-1, max_keyframes=10)
        self.assertEqual(a, b)
        self.assertLessEqual(len(a), 10)
        self.assertEqual(a[0].sample_index, 0)

    def test_rejects_bad_sample_rate_and_no_video(self):
        with self.assertRaises(ValueError):
            ks.sample_video(Path(__file__), sample_fps=0)


class HashTests(unittest.TestCase):
    def test_dhash_is_64_bits_and_hamming_counts_differences(self):
        g = np.arange(72, dtype=np.uint8).reshape(8, 9)
        h = ks.dhash(g)
        self.assertLess(h, 2**64)
        self.assertEqual(ks.hamming(0b1011, 0b0010), 2)


if __name__ == "__main__":
    unittest.main()
