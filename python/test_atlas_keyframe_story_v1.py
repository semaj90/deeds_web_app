"""Tests for atlas_keyframe_story_v1 (synthetic receipts). Run from repo root:
python -m unittest python/test_atlas_keyframe_story_v1.py
"""
import unittest

import atlas_keyframe_story_v1 as ks


def frame(pts, boxes, text="", roles=None):
    return {"framePtsMs": pts, "imageSize": [1000, 500],
            "boxes": boxes,
            "fullFrameOcr": {"enhanced": [{"text": t} for t in text.split()], "raw": []},
            "roleEvidence": {"proposals": roles or []}}


def person(bbox):
    return {"classLabel": "person", "bboxXYXY": bbox, "detectionConfidence": 0.9}


class FactTests(unittest.TestCase):
    def test_counts_and_largest_share_are_computed(self):
        f = ks.frame_facts(frame(0, [person([0, 0, 500, 250]), person([600, 0, 650, 50])]))
        self.assertIn("2 person", f["facts"][0]["statement"])
        self.assertIn("25.0%", f["facts"][1]["statement"])  # 500*250 / (1000*500) = 25%

    def test_no_text_and_no_roles_go_to_open_questions(self):
        f = ks.frame_facts(frame(0, [person([0, 0, 10, 10])]))
        self.assertTrue(any("No readable on-screen text" in q for q in f["openQuestions"]))
        self.assertTrue(any("No textual role evidence" in q for q in f["openQuestions"]))

    def test_role_proposal_is_cited_not_asserted_as_identity(self):
        roles = [{"role": "officer", "name": "Smith", "basis": "title_before_name", "evidence": []}]
        f = ks.frame_facts(frame(0, [], text="Officer Smith", roles=roles))
        stmts = [x["statement"] for x in f["facts"]]
        self.assertTrue(any("proposal" in s and "officer" in s for s in stmts))
        self.assertFalse(any("No textual role" in q for q in f["openQuestions"]))


class TransitionTests(unittest.TestCase):
    def test_person_count_change_is_a_measured_delta(self):
        r = {"frames": [frame(0, [person([0, 0, 100, 100])]), frame(2000, [person([0, 0, 100, 100]), person([500, 0, 600, 100])])]}
        s = ks.build_story(r)
        self.assertTrue(any("1 -> 2" in t["statement"] for t in s["transitions"]))

    def test_text_change_detected(self):
        r = {"frames": [frame(0, [], text="Hello"), frame(2000, [], text="Goodbye")]}
        s = ks.build_story(r)
        self.assertTrue(any("text changes" in t["statement"] for t in s["transitions"]))

    def test_entries_are_never_marked_reviewed(self):
        s = ks.build_story({"frames": [frame(0, [])]})
        self.assertFalse(s["frames"][0]["review"]["reviewed"])
        self.assertIsNone(s["frames"][0]["review"]["label"])


if __name__ == "__main__":
    unittest.main()
