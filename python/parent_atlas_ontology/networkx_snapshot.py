"""ONTO-PY-04A: deterministic NetworkX projection and replay snapshot.

NetworkX is a derived CPU oracle here. GraphOrdinal values are assigned from
canonical sorted node identities and are never treated as ontology identity.
N-ary relations remain reified relation nodes with role-bearing incidence
edges; no participant clique is created.
"""

from __future__ import annotations

import json
from itertools import combinations
from typing import Any, Sequence

from atlas_semantic_ontology_projection import (
    NarySemanticRelation,
    SemanticAssertion,
    build_networkx_projection,
    logical_checksum,
)


def _node_key(node: Any, attrs: dict[str, Any]) -> tuple[str, str]:
    return (str(attrs.get("node_kind", "")), str(node))


def _json_safe(value: Any) -> Any:
    """Normalize tuple/set-like attributes to the JSON interchange shape."""
    return json.loads(json.dumps(value, sort_keys=True, default=str))


def _canonical_graph_payload(graph: Any, graph_revision: str) -> dict[str, Any]:
    nodes = [
        {"graph_ordinal": ordinal, "node_id": str(node), "attributes": _json_safe(dict(graph.nodes[node]))}
        for ordinal, node in enumerate(sorted(graph.nodes, key=lambda n: _node_key(n, graph.nodes[n])))
    ]
    ordinal_by_node = {row["node_id"]: row["graph_ordinal"] for row in nodes}
    edges = []
    for source, target, key, attrs in graph.edges(keys=True, data=True):
        edges.append({
            "source_graph_ordinal": ordinal_by_node[str(source)],
            "target_graph_ordinal": ordinal_by_node[str(target)],
            "edge_key": str(key),
            "attributes": _json_safe(dict(attrs)),
        })
    edges.sort(key=lambda row: (
        row["source_graph_ordinal"], row["target_graph_ordinal"], row["edge_key"],
    ))
    ordinal_rows = [
        {"graph_ordinal": row["graph_ordinal"], "node_id": row["node_id"]}
        for row in nodes
    ]
    payload = {
        "schema": "atlas.ontology-networkx-projection.v1",
        "graph_revision": graph_revision,
        "nodes": nodes,
        "edges": edges,
        "graph_ordinal_map_checksum": logical_checksum(ordinal_rows),
        "node_set_checksum": logical_checksum(nodes),
        "edge_set_checksum": logical_checksum(edges),
        "canonical_authority": False,
        "writes_performed": False,
    }
    payload["projection_checksum"] = logical_checksum(payload)
    return payload


def node_link_roundtrip_receipt(
    assertions: Sequence[SemanticAssertion],
    relations: Sequence[NarySemanticRelation] = tuple(),
    *,
    graph_revision: str,
) -> dict[str, Any]:
    """Prove JSON node-link interchange without changing graph ownership."""
    if not graph_revision.strip():
        raise ValueError("graph_revision is required")
    import networkx as nx

    original = build_networkx_projection(assertions, relations)
    before = _canonical_graph_payload(original, graph_revision)
    node_link = _json_safe(nx.node_link_data(original))
    restored = nx.node_link_graph(node_link, directed=True, multigraph=True)
    after = _canonical_graph_payload(restored, graph_revision)
    checks = {
        "nodeCount": len(before["nodes"]) == len(after["nodes"]),
        "edgeCount": len(before["edges"]) == len(after["edges"]),
        "ordinalMapChecksum": before["graph_ordinal_map_checksum"] == after["graph_ordinal_map_checksum"],
        "nodeSetChecksum": before["node_set_checksum"] == after["node_set_checksum"],
        "edgeSetChecksum": before["edge_set_checksum"] == after["edge_set_checksum"],
    }
    return {
        "schema": "atlas.ontology-networkx-node-link-roundtrip.v1",
        "status": "NETWORKX_NODE_LINK_ROUNDTRIP_PROVEN" if all(checks.values()) else "ROUNDTRIP_FAILED",
        "graphRevision": graph_revision,
        "format": "networkx.node_link_data",
        "checks": checks,
        "beforeProjectionChecksum": before["projection_checksum"],
        "afterProjectionChecksum": after["projection_checksum"],
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def bounded_incidence_jaccard(
    graph: Any,
    *,
    graph_revision: str,
    max_pairs: int = 1024,
) -> dict[str, Any]:
    """Score bounded participant pairs by shared relation-node neighborhoods.

    This deliberately does not materialize participant cliques. Relation nodes
    remain the topology intermediary, so the result is a derived feature only.
    """
    if max_pairs <= 0:
        raise ValueError("max_pairs must be positive")
    if not graph_revision.strip():
        raise ValueError("graph_revision is required")
    projection = _canonical_graph_payload(graph, graph_revision)
    participants = sorted(
        str(node) for node, attrs in graph.nodes(data=True)
        if attrs.get("node_kind") == "ENTITY"
    )
    relation_neighbors: dict[str, frozenset[str]] = {}
    for participant in participants:
        relation_neighbors[participant] = frozenset(
            str(neighbor)
            for neighbor in set(graph.predecessors(participant)) | set(graph.successors(participant))
            if graph.nodes[neighbor].get("node_kind") == "NARY_RELATION"
        )

    rows: list[dict[str, Any]] = []
    for left, right in combinations(participants, 2):
        left_neighbors = relation_neighbors[left]
        right_neighbors = relation_neighbors[right]
        union = left_neighbors | right_neighbors
        if not union:
            continue
        intersection = left_neighbors & right_neighbors
        rows.append({
            "leftNodeKey": left,
            "rightNodeKey": right,
            "intersectionCount": len(intersection),
            "unionCount": len(union),
            "jaccard": len(intersection) / len(union),
        })
        if len(rows) >= max_pairs:
            break
    pair_rows = [
        {"leftNodeKey": row["leftNodeKey"], "rightNodeKey": row["rightNodeKey"]}
        for row in rows
    ]
    return {
        "schema": "atlas.ontology-incidence-jaccard.v1",
        "algorithm": "bounded_shared_relation_neighborhood_jaccard",
        "graphRevision": graph_revision,
        "projectionChecksum": projection["projection_checksum"],
        "ordinalMapChecksum": projection["graph_ordinal_map_checksum"],
        "maxPairs": max_pairs,
        "candidatePairCount": len(rows),
        "candidatePairChecksum": logical_checksum(pair_rows),
        "scoresChecksum": logical_checksum(rows),
        "results": rows,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def build_networkx_snapshot(
    assertions: Sequence[SemanticAssertion],
    relations: Sequence[NarySemanticRelation] = tuple(),
    *,
    graph_revision: str,
) -> dict[str, Any]:
    """Build a checksum-sealed, JSON-safe snapshot from the derived graph."""
    if not graph_revision.strip():
        raise ValueError("graph_revision is required")
    graph = build_networkx_projection(assertions, relations)
    return _canonical_graph_payload(graph, graph_revision)


def replay_networkx_snapshot(
    assertions: Sequence[SemanticAssertion],
    relations: Sequence[NarySemanticRelation] = tuple(),
    *,
    graph_revision: str,
) -> dict[str, Any]:
    first = build_networkx_snapshot(assertions, relations, graph_revision=graph_revision)
    second = build_networkx_snapshot(assertions, relations, graph_revision=graph_revision)
    return {
        "schema": "atlas.oak-python-networkx-replay.v1",
        "status": "NETWORKX_PROJECTION_PROVEN" if first == second else "REPLAY_FAILED",
        "graph_revision": graph_revision,
        "node_count": len(first["nodes"]),
        "edge_count": len(first["edges"]),
        "graph_ordinal_map_checksum": first["graph_ordinal_map_checksum"],
        "projection_checksum": first["projection_checksum"],
        "replay_identical": first == second,
        "formal_reasoning_status": "UNAVAILABLE_NO_JVM",
        "canonical_authority": False,
        "writes_performed": False,
    }


def bounded_bfs_receipt(
    assertions: Sequence[SemanticAssertion],
    relations: Sequence[NarySemanticRelation] = tuple(),
    *,
    graph_revision: str,
    source_node_id: str,
    depth_limit: int = 2,
) -> dict[str, Any]:
    """Run deterministic bounded directed BFS over the derived graph."""
    if depth_limit < 0:
        raise ValueError("depth_limit must be non-negative")
    graph = build_networkx_projection(assertions, relations)
    if source_node_id not in graph:
        raise ValueError(f"source_node_id is not present: {source_node_id}")
    snapshot = _canonical_graph_payload(graph, graph_revision)
    ordinal_by_node = {row["node_id"]: row["graph_ordinal"] for row in snapshot["nodes"]}
    distances: dict[str, int] = {source_node_id: 0}
    predecessors: dict[str, str | None] = {source_node_id: None}
    queue = [source_node_id]
    while queue:
        current = queue.pop(0)
        distance = distances[current]
        if distance >= depth_limit:
            continue
        for neighbor in sorted({str(target) for target in graph.successors(current)}):
            if neighbor in distances:
                continue
            distances[neighbor] = distance + 1
            predecessors[neighbor] = current
            queue.append(neighbor)
    ordered_distances = {str(ordinal_by_node[node]): distance for node, distance in sorted(distances.items(), key=lambda item: ordinal_by_node[item[0]])}
    ordered_predecessors = {str(ordinal_by_node[node]): (None if parent is None else ordinal_by_node[parent]) for node, parent in sorted(predecessors.items(), key=lambda item: ordinal_by_node[item[0]])}
    payload = {
        "schema": "atlas.ontology-networkx-bfs-receipt.v1",
        "graph_revision": graph_revision,
        "graph_ordinal_map_checksum": snapshot["graph_ordinal_map_checksum"],
        "source_graph_ordinal": ordinal_by_node[source_node_id],
        "depth_limit": depth_limit,
        "distances": ordered_distances,
        "predecessors": ordered_predecessors,
        "reachable_ordinals": sorted(int(value) for value in ordered_distances),
        "canonical_authority": False,
        "writes_performed": False,
    }
    payload["traversal_checksum"] = logical_checksum(payload)
    return payload
