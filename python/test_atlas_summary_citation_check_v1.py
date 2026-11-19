"""Tests for atlas_summary_citation_check_v1. Run from repo root: python -m unittest python/test_atlas_summary_citation_check_v1.py"""
import unittest

import atlas_summary_citation_check_v1 as cc

FACTS = {"f1": "5 detections: 4 person, 1 tie", "f2": "Person count changes 1 -> 2"}


class CitationTests(unittest.TestCase):
    def test_cited_sentence_with_known_fact_is_supported(self):
        r = cc.check_summary(FACTS, [{"text": "Four people are detected.", "citations": ["f1"]}])
        self.assertEqual(r["results"][0]["verdict"], "SUPPORTED")
        self.assertEqual(r["supported"], 1)

    def test_uncited_sentence_is_rejected_and_kept(self):
        r = cc.check_summary(FACTS, [{"text": "The judge is speaking.", "citations": []}])
        self.assertEqual((r["results"][0]["verdict"], r["results"][0]["reason"]), ("REJECTED", "NO_CITATION"))
        self.assertEqual(r["rejected"], 1)
        self.assertEqual(len(r["results"]), 1)  # rejected text is kept in the receipt

    def test_unknown_fact_id_is_rejected(self):
        r = cc.check_summary(FACTS, [{"text": "x", "citations": ["f1", "f9"]}])
        self.assertEqual(r["results"][0]["reason"], "UNKNOWN_FACT_ID:f9")

    def test_status_is_always_draft(self):
        self.assertEqual(cc.check_summary(FACTS, [])["status"], "DRAFT_NOT_REVIEWED")


if __name__ == "__main__":
    unittest.main()
