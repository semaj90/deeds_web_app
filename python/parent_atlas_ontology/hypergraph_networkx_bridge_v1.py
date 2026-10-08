"""Request-local HyperGraphRAG proposal projection through the existing NetworkX owner."""

from __future__ import annotations

from typing import Any, Sequence

from atlas_external_doc_hypergraph import HypergraphFactProposalV1
from atlas_semantic_ontology_projection import (
    NarySemanticRelation,
    RelationParticipant,
    build_networkx_projection,
    logical_checksum,
    networkx_pagerank,
)
from parent_atlas_ontology.networkx_snapshot import build_request_local_networkx_projection_v1


def build_hypergraph_networkx_fixture_receipt_v1(
    proposals: Sequence[HypergraphFactProposalV1],
) -> dict[str, Any]:
    """Project non-authoritative proposals into reified n-ary incidence and bind a deterministic receipt."""
    if not proposals:
        raise ValueError("HYPERGRAPH_PROPOSALS_REQUIRED")

    proposal_ids = [item.proposal_id for item in proposals]
    if len(set(proposal_ids)) != len(proposal_ids):
        raise ValueError("DUPLICATE_PROPOSAL_ID")

    ordered = tuple(sorted(proposals, key=lambda item: item.proposal_id))
    relations: list[NarySemanticRelation] = []
    participant_rows: list[dict[str, Any]] = []
    for proposal in ordered:
        if (
            proposal.graph_revision is not None
            or proposal.admission_state != "PROPOSAL_ONLY"
            or proposal.canonical_authority
            or proposal.writes_performed
        ):
            raise ValueError("PROPOSAL_AUTHORITY_OR_GRAPH_REVISION_INVALID")
        if not all((proposal.source_revision, proposal.workspace_revision, proposal.producer_revision)):
            raise ValueError("PROPOSAL_LINEAGE_REQUIRED")

        participants = tuple(
            RelationParticipant(
                canonical_id=participant.entity_id,
                role=participant.role,
                ordinal=ordinal,
                source_ref=proposal.source_ref,
            )
            for ordinal, participant in enumerate(proposal.participants)
        )
        relations.append(
            NarySemanticRelation(
                relation_id=proposal.proposal_id,
                relation_type=proposal.predicate,
                source_ref=proposal.source_ref,
                source_revision=proposal.source_revision,
                participants=participants,
                evidence_refs=(proposal.evidence_checksum,),
                producer_revision=proposal.producer_revision,
                canonical_authority=False,
            )
        )
        participant_rows.extend(
            {
                "proposal_id": proposal.proposal_id,
                "participant_ordinal": ordinal,
                "participant_id": participant.entity_id,
                "participant_role": participant.role,
                "source_revision": proposal.source_revision,
                "workspace_revision": proposal.workspace_revision,
                "producer_revision": proposal.producer_revision,
                "proposal_checksum": proposal.proposal_checksum,
            }
            for ordinal, participant in enumerate(proposal.participants)
        )

    participant_rows.sort(key=lambda row: (row["proposal_id"], row["participant_ordinal"]))
    input_payload = [item.to_dict() for item in ordered]
    projection = build_request_local_networkx_projection_v1((), relations)
    pagerank = networkx_pagerank(build_networkx_projection((), relations), alpha=0.85)
    expected_edges = len(participant_rows)
    relation_nodes = sum(row["attributes"].get("node_kind") == "NARY_RELATION" for row in projection["nodes"])
    participant_edges = sum(row["attributes"].get("edge_kind") == "PARTICIPANT" for row in projection["edges"])
    entity_to_entity_edges = sum(
        projection["nodes"][row["source_graph_ordinal"]]["attributes"].get("node_kind") == "ENTITY"
        and projection["nodes"][row["target_graph_ordinal"]]["attributes"].get("node_kind") == "ENTITY"
        for row in projection["edges"]
    )
    if relation_nodes != len(ordered) or participant_edges != expected_edges or entity_to_entity_edges:
        raise ValueError("NARY_INCIDENCE_SHAPE_INVALID")

    body = {
        "schema": "atlas.hypergraph-networkx-fixture-receipt.v1",
        "status": "FIXTURE_PROVEN",
        "proposalCount": len(ordered),
        "proposalIds": [item.proposal_id for item in ordered],
        "inputChecksum": logical_checksum(input_payload),
        "participantOrdinalMap": participant_rows,
        "participantOrdinalMapChecksum": logical_checksum(participant_rows),
        "projection": projection,
        "projectionChecksum": projection["projection_checksum"],
        "graphAlgorithm": {
            "name": "NETWORKX_PAGERANK",
            "alpha": 0.85,
            "weightField": "weight",
            "implementation": "atlas_semantic_ontology_projection.networkx_pagerank",
            "result": pagerank,
        },
        "relationNodeCount": relation_nodes,
        "participantIncidenceEdgeCount": participant_edges,
        "entityToEntityEdgeCount": entity_to_entity_edges,
        "graphRevision": None,
        "graphRevisionAvailable": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    body["receiptChecksum"] = logical_checksum(body)
    return body


def revalidate_hypergraph_networkx_fixture_receipt_v1(receipt: dict[str, Any]) -> bool:
    """Independently validate the serialized receipt's key checksums and blocked authority state."""
    if receipt.get("graphRevision") is not None or receipt.get("graphRevisionAvailable") is not False:
        return False
    if receipt.get("canonicalAuthority") is not False or receipt.get("writesPerformed") is not False:
        return False
    projection = receipt.get("projection", {})
    if projection.get("projection_checksum") != receipt.get("projectionChecksum"):
        return False
    projection_body = dict(projection)
    projection_checksum = projection_body.pop("projection_checksum", None)
    if projection_checksum != logical_checksum(projection_body):
        return False
    ordinal_rows = [
        {"graph_ordinal": row["graph_ordinal"], "node_id": row["node_id"]}
        for row in projection.get("nodes", [])
    ]
    if logical_checksum(ordinal_rows) != projection.get("graph_ordinal_map_checksum"):
        return False
    pagerank = receipt.get("graphAlgorithm", {}).get("result", {})
    if pagerank.get("score_checksum") != logical_checksum(pagerank.get("scores")):
        return False
    if logical_checksum(receipt.get("participantOrdinalMap")) != receipt.get("participantOrdinalMapChecksum"):
        return False
    expected = dict(receipt)
    checksum = expected.pop("receiptChecksum", None)
    return checksum == logical_checksum(expected)
