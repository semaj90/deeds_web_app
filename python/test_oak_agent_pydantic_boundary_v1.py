"""Offline strict OaK proposal boundary tests (no agent, network or database)."""
import hashlib
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pydantic import ValidationError
from parent_atlas_ontology.oak_agent_pydantic_boundary_v1 import (
    OakAgentRequestV1, propose_read_only, proposal_json,
)


def fixture(text="Réseau"):
    raw = text.encode("utf-8")
    return {
        "schema": "atlas.oak-agent-proposal-request.v1",
        "request_id": "req-1",
        "ontology_revision": "ontology-v1",
        "grounded_fact": {
            "fact_id": "fact-1", "predicate": "uses",
            "source_ref": "docs/test.html",
            "source_revision": "sha256:" + "a" * 64,
            "workspace_revision": "sha256:" + "b" * 64,
            "producer_revision": "producer-v1",
            "evidence_start_byte": 0, "evidence_end_byte": len(raw),
            "evidence_text": text,
            "evidence_checksum": hashlib.sha256(raw).hexdigest(),
            "participants": [
                {"entity_id":"subject", "entity_kind":"concept", "role":"agent"},
                {"entity_id":"object", "entity_kind":"concept", "role":"tool"},
            ],
        },
    }


class OakPydanticBoundaryTest(unittest.TestCase):
    def test_deterministic_no_authority(self):
        a = propose_read_only(fixture())
        b = propose_read_only(fixture())
        self.assertEqual(a, b)
        self.assertEqual(proposal_json(fixture()), proposal_json(fixture()))
        self.assertEqual(a["proposal"]["graph_revision"], None)
        self.assertEqual(a["proposal"]["admission_state"], "PROPOSAL_ONLY")
        self.assertFalse(a["canonical_authority"])
        self.assertFalse(a["writes_performed"])

    def test_unknown_fields_and_authority_rejected(self):
        for mutation in (
            lambda r: r.update({"surprise": 1}),
            lambda r: r.update({"canonical_authority": True}),
            lambda r: r["grounded_fact"].update({"canonical_authority": True}),
            lambda r: r["grounded_fact"].update({"unknown": "extra"}),
        ):
            x = fixture()
            mutation(x)
            with self.assertRaises(ValidationError):
                OakAgentRequestV1.model_validate(x)

    def test_span_and_digest_rejected(self):
        for field, bad in (
            ("evidence_end_byte", 6), # Unicode UTF-8 evidence is 7 bytes
            ("evidence_checksum", "0"*64),
            ("source_revision", "latest"),
        ):
            x = fixture()
            x["grounded_fact"][field] = bad
            with self.assertRaises(ValidationError):
                OakAgentRequestV1.model_validate(x)

    def test_strict_types_and_minimum_participants(self):
        x = fixture()
        x["grounded_fact"]["evidence_start_byte"] = "0"
        with self.assertRaises(ValidationError):
            OakAgentRequestV1.model_validate(x)
        x = fixture()
        x["grounded_fact"]["participants"].pop()
        with self.assertRaises(ValidationError):
            OakAgentRequestV1.model_validate(x)


if __name__ == "__main__":
    unittest.main()
