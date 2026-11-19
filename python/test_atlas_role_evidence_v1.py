"""Tests for atlas_role_evidence_v1. Pure tests need no service; one live test calls :8095 if up.

Run from repo root: python -m unittest python/test_atlas_role_evidence_v1.py
"""
import unittest
import urllib.request
from unittest.mock import patch
import json
import io

import atlas_role_evidence_v1 as rv

SAMPLE = "Judge: the court will now hear from the victim. Officer Smith, please step forward."


class MentionTests(unittest.TestCase):
    def test_finds_role_words_with_spans(self):
        ms = rv.find_role_mentions(SAMPLE)
        roles = [m["role"] for m in ms]
        self.assertIn("judge", roles)
        self.assertIn("victim", roles)
        self.assertIn("officer", roles)
        for m in ms:
            self.assertEqual(SAMPLE[m["start"]:m["end"]].lower(), m["phrase"])

    def test_whole_word_only(self):
        # "guardrail" must not match "guard"; "witnessed" must not match "witness".
        self.assertEqual(rv.find_role_mentions("a guardrail and witnessed"), [])


class ProposalTests(unittest.TestCase):
    def test_role_word_next_to_person_entity_is_proposed_with_evidence(self):
        text = "The victim was Anna Brown."
        start = text.index("Anna")
        ent = {"text": "Anna Brown", "label": "PERSON", "start": start, "end": start + len("Anna Brown"), "source": "spacy"}
        props = rv.propose_roles(text, [ent])
        self.assertEqual(len(props), 1)
        p = props[0]
        self.assertEqual((p["role"], p["name"], p["status"], p["basis"]), ("victim", "Anna Brown", "proposed", "role_word_near_person_entity"))
        self.assertEqual({e["kind"] for e in p["evidence"]}, {"role_word", "person_entity"})

    def test_far_person_is_not_paired(self):
        text = "victim" + " " * 200 + "Anna Brown"
        start = text.index("Anna")
        ent = {"text": "Anna Brown", "label": "PERSON", "start": start, "end": start + 10}
        self.assertEqual(rv.propose_roles(text, [ent], max_gap_chars=40), [])

    def test_role_in_previous_sentence_is_not_paired_with_next_name(self):
        text = "The victim was found. Officer Smith, please step forward."
        start = text.index("Smith")
        ent = {"text": "Smith", "label": "PERSON", "start": start, "end": start + 5}
        props = rv.propose_roles(text, [ent])
        self.assertNotIn(("victim", "Smith"), [(p["role"], p["name"]) for p in props])
        self.assertIn(("officer", "Smith"), [(p["role"], p["name"]) for p in props])

    def test_duplicate_role_name_pairs_are_merged(self):
        text = "Officer Smith spoke."
        start = text.index("Smith")
        ent = {"text": "Smith", "label": "PERSON", "start": start, "end": start + 5}
        props = rv.propose_roles(text, [ent])
        self.assertEqual(len([p for p in props if p["name"] == "Smith" and p["role"] == "officer"]), 1)

    def test_title_before_name_pattern(self):
        props = rv.propose_roles("Officer Smith, please step forward.", [])
        self.assertEqual(len(props), 1)
        self.assertEqual((props[0]["role"], props[0]["name"], props[0]["basis"]), ("officer", "Smith", "title_before_name"))

    def test_no_proposal_without_any_role_word(self):
        self.assertEqual(rv.propose_roles("Anna Brown went home.", []), [])


class OakTaxonomyTests(unittest.TestCase):
    def test_oak_matches_are_advisory_and_never_canonical(self):
        payload = {"matches": [{"entityId": "EX:officer", "label": "police officer"}],
                   "canonicalAuthority": True}
        response = io.BytesIO(json.dumps(payload).encode())
        with patch.object(rv.urllib.request, "urlopen", return_value=response) as urlopen:
            out = rv.oak_taxonomy_suggestions("officer", "http://oak.test")
        self.assertEqual(out["state"], "SUGGESTIONS_AVAILABLE")
        self.assertEqual(out["matches"], [{"entityId": "EX:officer", "label": "police officer"}])
        self.assertFalse(out["canonicalAuthority"])
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/oak/search"))
        self.assertEqual(json.loads(request.data), {"query": "officer", "limit": 5})

    def test_oak_failure_is_bounded_and_does_not_raise(self):
        with patch.object(rv.urllib.request, "urlopen", side_effect=TimeoutError):
            out = rv.oak_taxonomy_suggestions("victim", "http://oak.test")
        self.assertEqual(out["state"], "OAK_UNAVAILABLE")
        self.assertFalse(out["canonicalAuthority"])
        self.assertEqual(out["matches"], [])

    def test_unknown_label_never_queries_oak(self):
        with patch.object(rv.urllib.request, "urlopen") as urlopen:
            out = rv.oak_taxonomy_suggestions("main_character", "http://oak.test")
        urlopen.assert_not_called()
        self.assertEqual(out["state"], "ROLE_NOT_IN_LEXICON")
        self.assertFalse(out["canonicalAuthority"])


def sidecar_up() -> bool:
    try:
        with urllib.request.urlopen(f"{rv.SIDECAR_URL}/health", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


@unittest.skipUnless(sidecar_up(), ":8095 sidecar not reachable")
class LiveSidecarTests(unittest.TestCase):
    def test_live_extract_returns_person_and_title_proposal(self):
        out = rv.extract_role_proposals(SAMPLE)
        self.assertEqual(out["status"], "PROPOSALS_ONLY__NOT_IDENTITY")
        self.assertTrue(out["sidecarRevision"])
        names = {p["name"] for p in out["proposals"]}
        self.assertIn("Smith", names)


if __name__ == "__main__":
    unittest.main()
