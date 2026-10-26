"""Read-only NetworkX consumer for the existing Atlas graph snapshot export."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping


def _digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _value(row: Mapping[str, Any], camel: str, snake: str) -> Any:
    return row.get(camel, row.get(snake))


def build_networkx_graph_mirror_v1(
    snapshot_export: Mapping[str, Any],
    expected_workspace_revision: str | None = None,
    expected_graph_revision: str | None = None,
):
    """Return a verified in-memory MultiDiGraph and its non-authoritative receipt."""
    import networkx as nx

    manifest = snapshot_export.get("manifest")
    proof = snapshot_export.get("proof")
    snapshot = snapshot_export.get("graphSnapshot") or snapshot_export.get("graph_snapshot")
    nodes = snapshot_export.get("nodes")
    edges = snapshot_export.get("edges")
    if not all(isinstance(part, Mapping) for part in (manifest, proof, snapshot)):
        raise ValueError("GRAPH_SNAPSHOT_ENVELOPE_INCOMPLETE")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("GRAPH_SNAPSHOT_ROWS_MISSING")
    snapshot_id = _value(snapshot, "snapshotId", "snapshot_id") or snapshot_export.get("snapshotId")
    workspace_revision = _value(manifest, "workspaceRevision", "workspace_revision")
    graph_revision = _value(snapshot, "graphRevision", "graph_revision")
    revision_checksum = _value(snapshot, "revisionChecksum", "revision_checksum")
    topology_hash = _value(manifest, "topologyHash", "topology_hash")
    if not snapshot_id or not workspace_revision or not topology_hash:
        raise ValueError("GRAPH_SNAPSHOT_REVISION_OR_ID_MISSING")
    if expected_workspace_revision is not None and workspace_revision != expected_workspace_revision:
        raise ValueError("GRAPH_WORKSPACE_REVISION_MISMATCH")
    if expected_graph_revision is not None and graph_revision != expected_graph_revision:
        raise ValueError("GRAPH_REVISION_EXPECTATION_MISMATCH")
    if _value(proof, "replayMatches", "replay_matches") is not True:
        raise ValueError("GRAPH_SNAPSHOT_REPLAY_NOT_PROVEN")
    if _value(proof, "topologyHash", "topology_hash") != topology_hash:
        raise ValueError("GRAPH_SNAPSHOT_TOPOLOGY_PROOF_MISMATCH")
    proof_graph_revision = _value(proof, "graphRevision", "graph_revision")
    if proof_graph_revision is not None and proof_graph_revision != graph_revision:
        raise ValueError("GRAPH_REVISION_BINDING_MISMATCH")
    proof_revision_checksum = _value(proof, "revisionChecksum", "revision_checksum")
    if proof_revision_checksum is not None and proof_revision_checksum != revision_checksum:
        raise ValueError("GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH")
    if _value(manifest, "status", "status") not in {"MATERIALIZED", "VALIDATED"}:
        raise ValueError("GRAPH_SNAPSHOT_NOT_MATERIALIZED")
    if len(nodes) != _value(manifest, "nodeCount", "node_count"):
        raise ValueError("GRAPH_SNAPSHOT_NODE_COUNT_MISMATCH")
    if len(edges) != _value(manifest, "edgeCount", "edge_count"):
        raise ValueError("GRAPH_SNAPSHOT_EDGE_COUNT_MISMATCH")
    if _value(proof, "unresolvedEndpointCount", "unresolved_endpoint_count") not in (0, None):
        raise ValueError("GRAPH_SNAPSHOT_HAS_UNRESOLVED_ENDPOINTS")

    graph = nx.MultiDiGraph(snapshot_id=snapshot_id, workspace_revision=workspace_revision,
                            graph_revision=graph_revision, topology_hash=topology_hash)
    canonical_nodes: list[dict[str, Any]] = []
    for row in nodes:
        if not isinstance(row, Mapping):
            raise ValueError("GRAPH_NODE_ROW_INVALID")
        node_key = _value(row, "nodeKey", "node_key")
        if not isinstance(node_key, str) or not node_key.strip() or node_key in graph:
            raise ValueError("GRAPH_NODE_KEY_MISSING_OR_DUPLICATE")
        if _value(row, "snapshotId", "snapshot_id") not in (None, snapshot_id):
            raise ValueError("GRAPH_NODE_SNAPSHOT_MISMATCH")
        graph.add_node(node_key, **dict(row))
        canonical_nodes.append(dict(row))

    canonical_edges: list[dict[str, Any]] = []
    edge_keys: set[str] = set()
    for row in edges:
        if not isinstance(row, Mapping):
            raise ValueError("GRAPH_EDGE_ROW_INVALID")
        source = _value(row, "sourceNodeKey", "source_node_key")
        target = _value(row, "targetNodeKey", "target_node_key")
        edge_key = _value(row, "edgeKey", "edge_key")
        edge_type = _value(row, "edgeType", "edge_type")
        if not all(isinstance(item, str) and item.strip() for item in (source, target, edge_key, edge_type)):
            raise ValueError("GRAPH_EDGE_IDENTITY_INCOMPLETE")
        if edge_key in edge_keys:
            raise ValueError("GRAPH_EDGE_KEY_DUPLICATE")
        if source not in graph or target not in graph:
            raise ValueError("GRAPH_EDGE_ENDPOINT_MISSING")
        if _value(row, "snapshotId", "snapshot_id") not in (None, snapshot_id):
            raise ValueError("GRAPH_EDGE_SNAPSHOT_MISMATCH")
        edge_keys.add(edge_key)
        graph.add_edge(source, target, key=edge_key, **dict(row))
        canonical_edges.append(dict(row))

    node_payload = sorted(canonical_nodes, key=lambda row: str(_value(row, "nodeKey", "node_key")))
    edge_payload = sorted(canonical_edges, key=lambda row: str(_value(row, "edgeKey", "edge_key")))
    normalized_nodes = [{key: row[key] for key in sorted(row)} for row in node_payload]
    normalized_edges = [{key: row[key] for key in sorted(row)} for row in edge_payload]
    source_digest = _digest({"nodes": normalized_nodes, "edges": normalized_edges})
    mirror_node_rows = [dict(data) for _, data in graph.nodes(data=True)]
    mirror_edge_rows = [dict(data) for _, _, _, data in graph.edges(keys=True, data=True)]
    canonical_json = lambda rows, key: [
        {field: row[field] for field in sorted(row)}
        for row in sorted(rows, key=lambda row: str(_value(row, key[0], key[1])))
    ]
    if (canonical_json(mirror_node_rows, ("nodeKey", "node_key")) != normalized_nodes
            or canonical_json(mirror_edge_rows, ("edgeKey", "edge_key")) != normalized_edges):
        raise ValueError("NETWORKX_DIRECTED_MULTIGRAPH_PARITY_FAILED")

    graph_revision_qualified = (
        expected_graph_revision is not None
        and graph_revision == expected_graph_revision
        and proof_graph_revision == graph_revision
        and isinstance(revision_checksum, str)
        and len(revision_checksum) == 64
        and all(character in "0123456789abcdef" for character in revision_checksum)
        and proof_revision_checksum == revision_checksum
    )
    workspace_revision_qualified = (
        expected_workspace_revision is not None
        and workspace_revision == expected_workspace_revision
    )
    fully_qualified = graph_revision_qualified and workspace_revision_qualified
    receipt = {
        "schema": "atlas.networkx-graph-mirror-receipt.v1",
        "status": "PARITY_PROVEN" if fully_qualified else "PARITY_PROVEN_REVISION_PARTIAL",
        "snapshotId": snapshot_id,
        "workspaceRevision": workspace_revision,
        "expectedWorkspaceRevision": expected_workspace_revision,
        "graphRevision": graph_revision,
        "expectedGraphRevision": expected_graph_revision,
        "revisionChecksum": revision_checksum,
        "topologyHash": topology_hash,
        "sourceRowsChecksum": source_digest,
        "nodeCount": graph.number_of_nodes(),
        "directedEdgeCount": graph.number_of_edges(),
        "relationshipTypes": sorted({_value(row, "edgeType", "edge_type") for row in canonical_edges}),
        "directedNodeAndEdgeParity": True,
        "parallelEdgesPreserved": True,
        "networkxGraphType": "MultiDiGraph",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "graphRevisionQualified": graph_revision_qualified,
        "workspaceRevisionQualified": workspace_revision_qualified,
    }
    receipt["receiptChecksum"] = _digest(receipt)
    graph.graph["mirror_receipt_checksum"] = receipt["receiptChecksum"]
    return graph, receipt


def build_networkx_mirror_receipt_v1(
    snapshot_export: Mapping[str, Any],
    expected_workspace_revision: str | None = None,
    expected_graph_revision: str | None = None,
) -> dict[str, Any]:
    """Receipt-only convenience API for callers that do not need the graph object."""
    _, receipt = build_networkx_graph_mirror_v1(
        snapshot_export, expected_workspace_revision, expected_graph_revision
    )
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-workspace-revision", required=True)
    parser.add_argument("--expected-graph-revision", required=True)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    receipt = build_networkx_mirror_receipt_v1(
        payload, args.expected_workspace_revision, args.expected_graph_revision
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": receipt["status"], "receiptChecksum": receipt["receiptChecksum"],
                      "nodes": receipt["nodeCount"], "edges": receipt["directedEdgeCount"],
                      "graphRevisionQualified": receipt["graphRevisionQualified"],
                      "workspaceRevisionQualified": receipt["workspaceRevisionQualified"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
