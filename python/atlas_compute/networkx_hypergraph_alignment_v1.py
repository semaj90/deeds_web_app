"""Read-only composition check for Atlas directed and N-ary graph mirrors."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

from atlas_compute.nary_networkx_alignment_v1 import GraphSnapshot, build_role_incidence_csr_v1


def _digest(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_networkx_hypergraph_alignment_receipt_v1(
    directed_graph: Any,
    mirror_receipt: Mapping[str, Any],
    incidence_snapshot: GraphSnapshot,
) -> dict[str, Any]:
    """Bind two non-authoritative NetworkX projections without merging their edges."""
    if mirror_receipt.get("schema") != "atlas.networkx-graph-mirror-receipt.v1":
        raise ValueError("GRAPH_MIRROR_RECEIPT_SCHEMA_INVALID")
    if mirror_receipt.get("status") != "PARITY_PROVEN" or mirror_receipt.get("graphRevisionQualified") is not True:
        raise ValueError("GRAPH_MIRROR_REVISION_NOT_QUALIFIED")

    expected_receipt_checksum = mirror_receipt.get("receiptChecksum")
    receipt_payload = {key: value for key, value in mirror_receipt.items() if key != "receiptChecksum"}
    if not isinstance(expected_receipt_checksum, str) or _digest(receipt_payload) != expected_receipt_checksum:
        raise ValueError("GRAPH_MIRROR_RECEIPT_CHECKSUM_MISMATCH")

    matrix = build_role_incidence_csr_v1(incidence_snapshot)
    graph_revision = mirror_receipt.get("graphRevision")
    if not isinstance(graph_revision, str) or incidence_snapshot.graph_revision != graph_revision:
        raise ValueError("GRAPH_REVISION_ALIGNMENT_MISMATCH")
    graph_metadata = getattr(directed_graph, "graph", {})
    if graph_metadata.get("graph_revision") != graph_revision:
        raise ValueError("NETWORKX_GRAPH_REVISION_MISMATCH")
    if graph_metadata.get("mirror_receipt_checksum") != expected_receipt_checksum:
        raise ValueError("NETWORKX_GRAPH_RECEIPT_BINDING_MISMATCH")

    entity_ordinals = matrix["entityOrdinals"]
    graph_nodes = set(directed_graph.nodes)
    matched = sorted(set(entity_ordinals).intersection(graph_nodes))
    missing = sorted(set(entity_ordinals).difference(graph_nodes))
    receipt = {
        "schema": "atlas.networkx-hypergraph-alignment-receipt.v1",
        "status": "ALIGNED" if not missing else "PARTIAL_NODE_COVERAGE",
        "graphRevision": graph_revision,
        "directedMirrorReceiptChecksum": expected_receipt_checksum,
        "incidenceSnapshotChecksum": incidence_snapshot.checksum,
        "incidenceMatrixChecksum": matrix["matrixChecksum"],
        "participantNodeCount": len(entity_ordinals),
        "matchedParticipantNodeCount": len(matched),
        "matchedParticipantNodes": matched,
        "unmatchedParticipantNodes": missing,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    receipt["receiptChecksum"] = _digest(receipt)
    return receipt
