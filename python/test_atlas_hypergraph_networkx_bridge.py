from __future__ import annotations

import json
import unittest

from atlas_external_doc_hypergraph import (
    GroundedFactBridgeV1,
    GroundedFactParticipantV1,
    build_hypergraph_fact_proposal_v1,
)
from parent_atlas_ontology.hypergraph_networkx_bridge_v1 import (
    build_hypergraph_networkx_fixture_receipt_v1,
    revalidate_hypergraph_networkx_fixture_receipt_v1,
)


class HypergraphNetworkXBridgeTests(unittest.TestCase):
    def _proposals(self):
        facts = (
            GroundedFactBridgeV1(
                fact_id="fact:a",
                predicate="SUPPORTS",
                source_ref="https://example.test/atlas",
                source_revision="sha256:source-v1",
                workspace_revision="sha256:workspace-v1",
                producer_revision="fixture-grounder-v1",
                evidence_start_byte=0,
                evidence_end_byte=1,
                evidence_text="A",
                evidence_checksum="sha256:evidence-a",
                participants=(
                    GroundedFactParticipantV1("concept:a", "concept", "subject"),
                    GroundedFactParticipantV1("concept:b", "concept", "object"),
                    GroundedFactParticipantV1("source:a", "source_ref", "evidence"),
                ),
            ),
            GroundedFactBridgeV1(
                fact_id="fact:b",
                predicate="REFINES",
                source_ref="https://example.test/atlas",
                source_revision="sha256:source-v1",
                workspace_revision="sha256:workspace-v1",
                producer_revision="fixture-grounder-v1",
                evidence_start_byte=1,
                evidence_end_byte=2,
                evidence_text="B",
                evidence_checksum="sha256:evidence-b",
                participants=(
                    GroundedFactParticipantV1("concept:b", "concept", "subject"),
                    GroundedFactParticipantV1("concept:c", "concept", "object"),
                    GroundedFactParticipantV1("source:a", "source_ref", "evidence"),
                ),
            ),
        )
        return tuple(build_hypergraph_fact_proposal_v1(fact) for fact in facts)

    def test_replay_and_serialized_readback_are_deterministic(self):
        proposals = self._proposals()
        first = build_hypergraph_networkx_fixture_receipt_v1(proposals)
        second = build_hypergraph_networkx_fixture_receipt_v1(tuple(reversed(proposals)))
        self.assertEqual(first, second)
        loaded = json.loads(json.dumps(first, sort_keys=True))
        self.assertTrue(revalidate_hypergraph_networkx_fixture_receipt_v1(loaded))

    def test_readback_rejects_tampered_projection_even_if_outer_receipt_is_unchanged(self):
        proposals = self._proposals()
        value = build_hypergraph_networkx_fixture_receipt_v1(proposals)
        value["projection"]["edges"][0]["attributes"]["role"] = "tampered"
        self.assertFalse(revalidate_hypergraph_networkx_fixture_receipt_v1(value))

    def test_projection_preserves_nary_incidence_without_cliques_or_graph_revision(self):
        receipt = build_hypergraph_networkx_fixture_receipt_v1(self._proposals())
        self.assertEqual(receipt["status"], "FIXTURE_PROVEN")
        self.assertEqual(receipt["relationNodeCount"], 2)
        self.assertEqual(receipt["participantIncidenceEdgeCount"], 6)
        self.assertEqual(receipt["entityToEntityEdgeCount"], 0)
        self.assertIsNone(receipt["graphRevision"])
        self.assertFalse(receipt["graphRevisionAvailable"])
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])
        self.assertEqual(receipt["graphAlgorithm"]["name"], "NETWORKX_PAGERANK")
        scores = receipt["graphAlgorithm"]["result"]["scores"]
        self.assertAlmostEqual(sum(scores.values()), 1.0, places=8)
        self.assertTrue(all(score >= 0 for score in scores.values()))

    def test_rejects_proposal_with_graph_revision_or_authority(self):
        proposal = self._proposals()[0]
        invalid = proposal.__class__(**{**proposal.to_dict(), "graph_revision": "invented"})
        with self.assertRaisesRegex(ValueError, "PROPOSAL_AUTHORITY_OR_GRAPH_REVISION_INVALID"):
            build_hypergraph_networkx_fixture_receipt_v1((invalid,))


if __name__ == "__main__":
    unittest.main()
