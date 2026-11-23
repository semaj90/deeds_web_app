"""Revision-bound source dependency expansion over the Atlas typed graph.

This module is a derived read path. PostgreSQL source identity remains the
caller-owned input; NetworkX performs bounded traversal and optional ranking.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

from .contracts import TypedGraphEdge
from .networkx_executor import run_bfs_neighborhood, run_pagerank_v2


DEPENDENCY_EDGE_TYPES = frozenset({"IMPORTS", "CALLS", "REFERENCES", "EXTENDS", "DEPENDS_ON"})
_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")


def _canonical_ref(value: Any) -> str:
    text = str(value or "").strip().replace("\\", "/")
    text = re.sub(r"^(?:.*?/)?deeds-web-app/", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^sveltekit-frontend/", "", text, flags=re.IGNORECASE)
    return re.sub(r"/+", "/", text).lstrip("/").casefold()


def resolve_dependencies_v1(
    *,
    target: str,
    source_identity: Mapping[str, Any],
    graph_revision: str,
    workspace_revision: str,
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    max_results: int = 500,
    direction: str = "outgoing",
) -> dict[str, Any]:
    """Resolve direct file dependencies (or dependents) from a verified graph projection.

    Edge evidence must be present in the admitted source plan. PageRank only
    orders neighbors discovered by BFS; it never creates dependency results.
    """
    canonical = _canonical_ref(target)
    if not canonical:
        return {"target": "", "dependencies": [], "failure": "EMPTY_TARGET"}
    if direction not in ("outgoing", "incoming"):
        return {"target": canonical, "dependencies": [], "failure": "INVALID_DIRECTION"}
    if not _SHA256.fullmatch(str(graph_revision)):
        return {"target": canonical, "dependencies": [], "failure": "GRAPH_REVISION_REQUIRED"}
    if not _SHA256.fullmatch(str(workspace_revision)):
        return {"target": canonical, "dependencies": [], "failure": "WORKSPACE_REVISION_REQUIRED"}

    source_ref = _canonical_ref(source_identity.get("sourceRef"))
    source_revision = source_identity.get("sourceRevision")
    source_workspace_revision = source_identity.get("workspaceRevision")
    if source_ref != canonical:
        return {"target": canonical, "dependencies": [], "failure": "SOURCE_INDEX_REF_MISMATCH"}
    if not isinstance(source_revision, str) or not _SHA256.fullmatch(source_revision):
        return {"target": canonical, "dependencies": [], "failure": "SOURCE_REVISION_UNAVAILABLE"}
    if source_workspace_revision != workspace_revision:
        return {"target": canonical, "dependencies": [], "failure": "WORKSPACE_REVISION_MISMATCH"}

    ordinal_to_node: dict[int, Mapping[str, Any]] = {}
    for node in nodes:
        ordinal = node.get("gpu_node_id")
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal in ordinal_to_node:
            return {"target": canonical, "dependencies": [], "failure": "GRAPH_NODE_ORDINAL_INVALID"}
        ordinal_to_node[ordinal] = node

    seeds = [
        ordinal for ordinal, node in sorted(ordinal_to_node.items())
        if _canonical_ref(node.get("source_ref")) == canonical
    ]
    if not seeds:
        return {"target": canonical, "dependencies": [], "failure": "GRAPH_NODE_MISSING"}
    if any(
        ordinal_to_node[ordinal].get("source_revision") != source_revision
        or ordinal_to_node[ordinal].get("workspace_revision") != workspace_revision
        for ordinal in seeds
    ):
        return {"target": canonical, "dependencies": [], "failure": "GRAPH_SOURCE_REVISION_MISMATCH"}

    typed_edges: list[TypedGraphEdge] = []
    evidence_by_edge: dict[tuple[int, int, str], Mapping[str, Any]] = {}
    for edge in edges:
        kind = str(edge.get("edge_type") or "").upper()
        if kind not in DEPENDENCY_EDGE_TYPES:
            continue
        src = edge.get("src_gpu_node_id")
        dst = edge.get("dst_gpu_node_id")
        if src not in ordinal_to_node or dst not in ordinal_to_node:
            return {"target": canonical, "dependencies": [], "failure": "GRAPH_EDGE_ENDPOINT_MISSING"}
        source_node = ordinal_to_node[src]
        target_node = ordinal_to_node[dst]
        evidence_refs = edge.get("evidenceRefs")
        if not isinstance(evidence_refs, list) or not evidence_refs or any(not isinstance(ref, str) or not ref.strip() for ref in evidence_refs):
            return {"target": canonical, "dependencies": [], "failure": "DEPENDENCY_EDGE_EVIDENCE_MISSING"}
        if (
            _canonical_ref(edge.get("sourceRef")) != _canonical_ref(source_node.get("source_ref"))
            or edge.get("sourceRevision") != source_node.get("source_revision")
            or edge.get("workspaceRevision") != workspace_revision
            or source_node.get("workspace_revision") != workspace_revision
            or target_node.get("workspace_revision") != workspace_revision
            or not isinstance(source_node.get("source_revision"), str)
            or not _SHA256.fullmatch(source_node["source_revision"])
            or not isinstance(target_node.get("source_revision"), str)
            or not _SHA256.fullmatch(target_node["source_revision"])
        ):
            return {"target": canonical, "dependencies": [], "failure": "DEPENDENCY_EDGE_REVISION_MISMATCH"}
        if kind in {"CALLS", "REFERENCES"}:
            target_symbol_rev = edge.get("targetSymbolRevision")
            if target_symbol_rev is not None and target_symbol_rev != target_node.get("symbol_revision"):
                return {"target": canonical, "dependencies": [], "failure": "CALL_TARGET_SYMBOL_REVISION_MISMATCH"}
            target_span_hash = edge.get("targetSpanHash")
            if target_span_hash is not None and target_span_hash != target_node.get("span_hash"):
                return {"target": canonical, "dependencies": [], "failure": "CALL_TARGET_SPAN_HASH_MISMATCH"}
        weight = edge.get("weight", 1.0)
        typed_edges.append(TypedGraphEdge(int(src), int(dst), kind, float(weight)))
        evidence_by_edge[(int(src), int(dst), kind)] = edge
    if not typed_edges:
        return {"target": canonical, "dependencies": [], "failure": "NO_TYPED_DEPENDENCY_EDGES"}

    bfs_edges = (
        [TypedGraphEdge(e.dst_ordinal, e.src_ordinal, e.kind, e.weight) for e in typed_edges]
        if direction == "incoming"
        else typed_edges
    )

    direct: dict[tuple[int, int, str], dict[str, Any]] = {}
    traversal_receipts = []
    for seed in seeds:
        rows, receipt = run_bfs_neighborhood(
            graph_revision=graph_revision,
            node_ordinals=sorted(ordinal_to_node),
            edges=bfs_edges,
            source_ordinal=seed,
            max_depth=1,
        )
        traversal_receipts.append(receipt)
        for ordinal, depth, parent in rows:
            if depth != 1:
                continue
            dep_node = ordinal_to_node[ordinal]
            dep_ref = dep_node.get("source_ref")
            if dep_ref and _canonical_ref(dep_ref) == canonical:
                continue
            if direction == "incoming":
                edge_candidates = [
                    (ordinal, parent, edge.kind)
                    for edge in typed_edges
                    if edge.dst_ordinal == parent and edge.src_ordinal == ordinal
                ]
            else:
                edge_candidates = [
                    (parent, ordinal, edge.kind)
                    for edge in typed_edges
                    if edge.src_ordinal == parent and edge.dst_ordinal == ordinal
                ]
            for edge_key in edge_candidates:
                direct[edge_key] = {
                    "dep": dep_ref or dep_node.get("graph_node_key"),
                    "depCanonical": _canonical_ref(dep_ref) if dep_ref else None,
                    "depKind": dep_node.get("node_kind"),
                    "depName": dep_node.get("qualified_name"),
                    "type": edge_key[2],
                    "evidenceRefs": list(evidence_by_edge[edge_key].get("evidenceRefs", [])),
                    "edgeId": evidence_by_edge[edge_key].get("edgeId"),
                    "sourceRevision": source_revision,
                    "workspaceRevision": workspace_revision,
                }

    if not direct:
        return {
            "target": canonical,
            "direction": direction,
            "dependencies": [],
            "failure": "NO_INCOMING_EDGES" if direction == "incoming" else "NO_OUTGOING_EDGES",
            "graphRevision": graph_revision,
            "sourceRevision": source_revision,
            "workspaceRevision": workspace_revision,
        }

    rank_scores, rank_receipt = run_pagerank_v2(
        graph_revision=graph_revision,
        node_ordinals=sorted(ordinal_to_node),
        edges=typed_edges,
    )
    result_rows = []
    for (src, dst, kind), dependency in direct.items():
        score_ordinal = src if direction == "incoming" else dst
        result_rows.append({**dependency, "pageRankPrior": float(rank_scores.get(score_ordinal, 0.0))})
    result_rows.sort(key=lambda row: (-row["pageRankPrior"], row["type"], str(row["dep"])))
    truncated = len(result_rows) > max_results
    result_rows = result_rows[:max_results]
    return {
        "target": canonical,
        "direction": direction,
        "dependencies": result_rows,
        "failure": None,
        "truncated": truncated,
        "rowCap": max_results,
        "graphRevision": graph_revision,
        "sourceRevision": source_revision,
        "workspaceRevision": workspace_revision,
        "nodesMatched": [
            {
                "graphNodeKey": ordinal_to_node[ordinal].get("graph_node_key"),
                "sourceRef": ordinal_to_node[ordinal].get("source_ref"),
                "sourceRevision": source_revision,
                "nodeKind": ordinal_to_node[ordinal].get("node_kind"),
            }
            for ordinal in seeds
        ],
        "pageRank": {"backend": "networkx", "receipt": rank_receipt.__dict__},
        "traversalReceipts": [receipt.__dict__ for receipt in traversal_receipts],
        "evidenceRefs": sorted({ref for row in result_rows for ref in row["evidenceRefs"]}),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def resolve_dependents_v1(
    *,
    target: str,
    source_identity: Mapping[str, Any],
    graph_revision: str,
    workspace_revision: str,
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    max_results: int = 500,
) -> dict[str, Any]:
    """Resolve direct incoming dependents (reverse IMPORTS/CALLS/etc.) from a verified graph projection."""
    result = resolve_dependencies_v1(
        target=target,
        source_identity=source_identity,
        graph_revision=graph_revision,
        workspace_revision=workspace_revision,
        nodes=nodes,
        edges=edges,
        max_results=max_results,
        direction="incoming",
    )
    result["dependents"] = result["dependencies"]
    return result
