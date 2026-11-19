"""Tests for atlas_keyframe_review_v1. Run from repo root: python -m unittest python/test_atlas_keyframe_review_v1.py"""
import unittest

import atlas_keyframe_review_v1 as rq

STORY = {"sourceReceipt": "x", "frames": [{"framePtsMs": 0, "openQuestions": ["No text."]}],
         "transitions": [{"statement": "Count changes", "evidence": {"source": "yolox_counts"}}]}


class QueueTests(unittest.TestCase):
    def test_queue_starts_pending_with_no_reviewer_or_label(self):
        q = rq.build_queue(STORY)
        self.assertEqual(q["status"], "AWAITING_HUMAN_REVIEW")
        for it in q["items"]:
            self.assertEqual(it["review"]["status"], "PENDING")
            self.assertIsNone(it["review"]["reviewer"])

    def test_source_queue_is_not_mutated_by_apply(self):
        q = rq.build_queue(STORY)
        rq.apply_review(q, q["items"][0]["itemId"], "Alex", label="cannot_determine")
        self.assertEqual(q["items"][0]["review"]["status"], "PENDING")


class ApplyTests(unittest.TestCase):
    def test_label_review_records_reviewer(self):
        q = rq.build_queue(STORY)
        out = rq.apply_review(q, "f0-q0", "Alex", label="cannot_determine", note="no name shown")
        r = out["items"][0]["review"]
        self.assertEqual((r["status"], r["reviewer"], r["label"]), ("REVIEWED", "Alex", "cannot_determine"))

    def test_anonymous_review_refused(self):
        q = rq.build_queue(STORY)
        with self.assertRaises(ValueError):
            rq.apply_review(q, "f0-q0", "  ", label="cannot_determine")

    def test_label_outside_vocabulary_refused(self):
        q = rq.build_queue(STORY)
        with self.assertRaises(ValueError):
            rq.apply_review(q, "f0-q0", "Alex", label="hero")

    def test_transition_verdict_validated(self):
        q = rq.build_queue(STORY)
        out = rq.apply_review(q, "t0", "Alex", verdict="confirmed")
        self.assertEqual(out["items"][1]["review"]["verdict"], "confirmed")
        with self.assertRaises(ValueError):
            rq.apply_review(q, "t0", "Alex", verdict="maybe")

    def test_unknown_item_refused(self):
        with self.assertRaises(ValueError):
            rq.apply_review(rq.build_queue(STORY), "nope", "Alex", label="object")


if __name__ == "__main__":
    unittest.main()
