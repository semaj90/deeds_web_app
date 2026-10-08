from __future__ import annotations

import unittest

from atlas_external_doc_hypergraph import (
    GroundedFactBridgeV1,
    GroundedFactParticipantV1,
    build_hypergraph_fact_proposal_v1,
    build_grounded_fact_bridge_from_external_doc_chunk_v1,
    build_request_local_incidence_v1,
    validate_evidence_slice_v1,
)


class ExternalDocHypergraphTests(unittest.TestCase):
    def _fact(self) -> GroundedFactBridgeV1:
        text = "BeautifulSoup feeds grounded facts into HyperGraphRAG proposals."
        evidence = "grounded facts"
        start = text.encode("utf-8").index(evidence.encode("utf-8"))
        end = start + len(evidence.encode("utf-8"))
        import hashlib

        return GroundedFactBridgeV1(
            fact_id="fact:1",
            predicate="SUPPORTS",
            source_ref="https://example.test/docs",
            source_revision="sha256:source",
            workspace_revision="workspace:v1",
            producer_revision="grounder:v1",
            evidence_start_byte=start,
            evidence_end_byte=end,
            evidence_text=evidence,
            evidence_checksum=hashlib.sha256(evidence.encode("utf-8")).hexdigest(),
            participants=(
                GroundedFactParticipantV1("concept:beautifulsoup", "concept", "tool"),
                GroundedFactParticipantV1("concept:hypergraphrag", "concept", "target"),
                GroundedFactParticipantV1("source:https://example.test/docs", "source_ref", "evidence"),
            ),
            ontology_ids=("TOOL", "GRAPH"),
            concept_ids=("BEAUTIFULSOUP", "HYPERGRAPH_RAG"),
            confidence=0.95,
        )

    def test_builds_proposal_only_without_graph_revision(self) -> None:
        proposal = build_hypergraph_fact_proposal_v1(self._fact())
        self.assertEqual(proposal.admission_state, "PROPOSAL_ONLY")
        self.assertIsNone(proposal.graph_revision)
        self.assertFalse(proposal.canonical_authority)
        self.assertFalse(proposal.writes_performed)
        self.assertEqual(len(proposal.participants), 3)

    def test_builds_request_local_incidence(self) -> None:
        proposal = build_hypergraph_fact_proposal_v1(self._fact())
        rows = build_request_local_incidence_v1((proposal,))
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(row["canonical_authority"] is False for row in rows))

    def test_exact_utf8_evidence_span(self) -> None:
        text = "BeautifulSoup feeds grounded facts into HyperGraphRAG proposals."
        validate_evidence_slice_v1(normalized_text=text, fact=self._fact())

    def test_bridges_external_doc_chunk_with_absolute_byte_span(self) -> None:
        chunk_text = "Prefix → grounded facts suffix"
        evidence = "grounded facts"
        encoded = chunk_text.encode("utf-8")
        start = encoded.index(evidence.encode("utf-8"))
        end = start + len(evidence.encode("utf-8"))
        chunk = {
            "source_id": "doc:1",
            "source_revision": "sha256:source",
            "source_url": "https://example.test/docs",
            "text": chunk_text,
            "start_byte": 100,
            "end_byte": 100 + len(encoded),
        }
        fact = build_grounded_fact_bridge_from_external_doc_chunk_v1(
            chunk=chunk,
            workspace_revision="workspace:v1",
            producer_revision="grounder:v1",
            fact_id="fact:chunk",
            predicate="MENTIONS",
            evidence_start_byte_in_chunk=start,
            evidence_end_byte_in_chunk=end,
            evidence_text=evidence,
            participants=(
                GroundedFactParticipantV1("concept:grounded-facts", "concept", "target"),
                GroundedFactParticipantV1("source:doc:1", "source_ref", "evidence"),
            ),
        )
        self.assertEqual(fact.evidence_start_byte, 100 + start)
        self.assertEqual(fact.evidence_end_byte, 100 + end)

    def test_rejects_canonical_authority(self) -> None:
        with self.assertRaises(ValueError):
            fact = self._fact()
            GroundedFactBridgeV1(
                **{**fact.__dict__, "canonical_authority": True}
            )


if __name__ == "__main__":
    unittest.main()
