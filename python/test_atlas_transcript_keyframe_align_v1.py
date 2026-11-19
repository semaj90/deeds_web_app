"""Tests for atlas_transcript_keyframe_align_v1. Run from repo root: python -m unittest python/test_atlas_transcript_keyframe_align_v1.py"""
import unittest

import atlas_transcript_keyframe_align_v1 as al


def frame(pts, text="", classes=()):
    return {"framePtsMs": pts,
            "fullFrameOcr": {"enhanced": [{"text": t} for t in text.split()], "raw": []},
            "boxes": [{"classLabel": c} for c in classes]}


class AlignTests(unittest.TestCase):
    def test_keyframe_attaches_to_the_segment_that_contains_it(self):
        segs = [{"id": "s1", "start_ms": 0, "end_ms": 2000, "text": "first"},
                {"id": "s2", "start_ms": 2000, "end_ms": 5000, "text": "second"}]
        out = al.align(segs, [frame(2750, "Sorry", ("person",))])
        self.assertEqual(out[0]["keyframes"], [])
        self.assertEqual(out[1]["keyframes"][0]["framePtsMs"], 2750)
        self.assertEqual(out[1]["keyframes"][0]["onScreenText"], "Sorry")

    def test_boundary_frame_attaches_to_exactly_one_segment(self):
        segs = [{"id": "a", "start_ms": 0, "end_ms": 2000, "text": ""},
                {"id": "b", "start_ms": 2000, "end_ms": 4000, "text": ""}]
        out = al.align(segs, [frame(2000)])
        self.assertEqual([len(s["keyframes"]) for s in out], [0, 1])

    def test_segment_without_frames_is_flagged_not_filled(self):
        out = al.align([{"id": "x", "start_ms": 0, "end_ms": 100, "text": "hi"}], [])
        self.assertEqual(out[0]["status"], "NO_KEYFRAME_IN_WINDOW")
        self.assertEqual(out[0]["keyframes"], [])

    def test_no_words_are_invented(self):
        out = al.align([{"id": "x", "start_ms": 0, "end_ms": 5000, "text": "spoken line"}], [frame(1000, "Provide details")])
        self.assertEqual(out[0]["transcriptText"], "spoken line")
        self.assertEqual(out[0]["keyframes"][0]["onScreenText"], "Provide details")

    def test_rejects_non_positive_segment(self):
        with self.assertRaises(ValueError):
            al.align([{"id": "x", "start_ms": 5, "end_ms": 5, "text": ""}], [])

    def test_detected_classes_are_listed_per_keyframe(self):
        out = al.align([{"id": "x", "start_ms": 0, "end_ms": 5000, "text": ""}], [frame(10, "", ("person", "chair", "person"))])
        self.assertEqual(out[0]["keyframes"][0]["detectedClasses"], ["chair", "person"])


if __name__ == "__main__":
    unittest.main()
