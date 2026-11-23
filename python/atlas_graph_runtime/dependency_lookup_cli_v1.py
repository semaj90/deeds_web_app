"""Read-only CLI for MCP dependency expansion using the current Atlas graph artifact."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_graph_runtime.dependency_lookup_v1 import resolve_dependencies_v1
from atlas_graph_runtime.graph_projection_manifest import (
    graph_ordinal_map_checksum_v1,
    validate_graph_projection_artifact_v1,
)


def _json_sha256(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _load_verified_snapshot(artifact_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    manifest = json.loads((artifact_dir / "manifest.json").read_text(encoding="utf-8"))
    node_payload = json.loads((artifact_dir / "nodes.json").read_text(encoding="utf-8"))
    if node_payload.get("schema") != "atlas.graph-node-table-v1" or not isinstance(node_payload.get("rows"), list):
        raise ValueError("GRAPH_NODE_TABLE_INVALID")
    nodes = node_payload["rows"]
    frame = pd.read_parquet(artifact_dir / manifest.get("edges", "edges.parquet"))
    edges = [
        {
            "src_gpu_node_id": int(row.src_gpu_node_id),
            "dst_gpu_node_id": int(row.dst_gpu_node_id),
            "edge_type": str(row.edge_type),
            "weight": float(row.weight),
        }
        for row in frame.itertuples(index=False)
    ]
    if manifest.get("schema") != "atlas.current-structural-graph-artifact-v1":
        raise ValueError("GRAPH_PROJECTION_SCHEMA_UNSUPPORTED")
    ordinal_rows = [
        {"graphOrdinal": row.get("gpu_node_id"), "graphNodeKey": row.get("graph_node_key")}
        for row in nodes
    ]
    graph_ordinal_checksum = graph_ordinal_map_checksum_v1(
        str(manifest.get("graphRevision") or ""),
        str(manifest.get("workspaceRevision") or ""),
        ordinal_rows,
    )
    adapted_manifest = {
        **manifest,
        "schema": "atlas.graph-projection-artifact.v1",
        "mode": "NON_PRODUCTION_DERIVED_ARTIFACT",
        "graphOrdinalMapChecksum": graph_ordinal_checksum,
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    snapshot = validate_graph_projection_artifact_v1(adapted_manifest, nodes, edges)

    plan_path = (ROOT / str(manifest.get("sourcePlan") or "")).resolve()
    try:
        plan_path.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise ValueError("GRAPH_SOURCE_PLAN_OUTSIDE_WORKSPACE") from exc
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    supplied_checksum = plan.get("reportChecksum")
    body = {key: value for key, value in plan.items() if key != "reportChecksum"}
    if not isinstance(supplied_checksum, str) or supplied_checksum != _json_sha256(body):
        raise ValueError("GRAPH_SOURCE_PLAN_CHECKSUM_MISMATCH")
    if (
        plan.get("mode") != "READ_ONLY_PLAN"
        or plan.get("canonicalAuthority") is not False
        or any(bool(value) for value in (plan.get("writes") or {}).values())
        or plan.get("status") != "CURRENT_STRUCTURAL_EDGE_PLAN_READY"
        or plan.get("workspaceRevision") != snapshot.workspace_revision
        or plan.get("nodeCount") != len(nodes)
        or plan.get("edgeCount") != len(edges)
    ):
        raise ValueError("SOURCE_GRAPH_PLAN_INCOMPLETE_OR_MISMATCHED")

    plan_nodes = {row.get("graphNodeKey"): row for row in plan.get("nodes", [])}
    node_by_key = {row.get("graph_node_key"): row for row in nodes}
    if len(plan_nodes) != len(node_by_key) or set(plan_nodes) != set(node_by_key):
        raise ValueError("SOURCE_GRAPH_PLAN_NODE_SET_MISMATCH")
    for key, row in plan_nodes.items():
        graph_row = node_by_key[key]
        if (
            row.get("sourceRef") != graph_row.get("source_ref")
            or row.get("sourceRevision") != graph_row.get("source_revision")
            or row.get("workspaceRevision") != graph_row.get("workspace_revision")
        ):
            raise ValueError("SOURCE_GRAPH_PLAN_NODE_REVISION_MISMATCH")

    ordinal_by_key = {row["graph_node_key"]: int(row["gpu_node_id"]) for row in nodes}
    evidence_by_identity = {}
    for row in plan.get("edges", []):
        source_key = row.get("sourceNodeKey")
        target_key = row.get("targetNodeKey")
        identity = (
            ordinal_by_key.get(source_key),
            ordinal_by_key.get(target_key),
            str(row.get("edgeType") or "").upper(),
        )
        if identity[0] is None or identity[1] is None:
            raise ValueError("SOURCE_GRAPH_PLAN_EDGE_ENDPOINT_MISSING")
        if not row.get("evidenceRefs") or not row.get("sourceRevision") or not row.get("workspaceRevision"):
            raise ValueError("SOURCE_GRAPH_PLAN_EDGE_PROVENANCE_MISSING")
        evidence_by_identity[identity] = row
    enriched_edges = []
    for edge in edges:
        identity = (edge["src_gpu_node_id"], edge["dst_gpu_node_id"], edge["edge_type"].upper())
        plan_edge = evidence_by_identity.get(identity)
        if plan_edge is None:
            raise ValueError("GRAPH_EDGE_NOT_BACKED_BY_SOURCE_PLAN")
        enriched_edges.append({
            **edge,
            "evidenceRefs": plan_edge["evidenceRefs"],
            "edgeId": plan_edge.get("edgeId"),
            "sourceRef": plan_edge.get("sourceRef"),
            "sourceRevision": plan_edge.get("sourceRevision"),
            "workspaceRevision": plan_edge.get("workspaceRevision"),
        })
    if len(enriched_edges) != len(evidence_by_identity):
        raise ValueError("SOURCE_GRAPH_PLAN_EDGE_SET_MISMATCH")

    plan_node_metadata = {key: row for key, row in plan_nodes.items()}
    enriched_nodes = []
    for row in nodes:
        metadata = plan_node_metadata[row["graph_node_key"]]
        enriched_nodes.append({
            **row,
            "node_kind": metadata.get("nodeKind"),
            "qualified_name": metadata.get("qualifiedName"),
        })
    return adapted_manifest, enriched_nodes, enriched_edges, plan


def resolve_request(request: dict[str, Any]) -> dict[str, Any]:
    target = str(request.get("target") or "")
    try:
        manifest, nodes, edges, _plan = _load_verified_snapshot(Path(request["artifactDir"]).resolve())
        return resolve_dependencies_v1(
            target=target,
            source_identity=request["sourceIdentity"],
            graph_revision=manifest["graphRevision"],
            workspace_revision=manifest["workspaceRevision"],
            nodes=nodes,
            edges=edges,
            max_results=min(500, max(1, int(request.get("maxResults", 500)))),
            direction=str(request.get("direction") or "outgoing"),
        )
    except (OSError, KeyError, TypeError, ValueError) as exc:
        code = str(exc) if isinstance(exc, ValueError) else "GRAPH_ARTIFACT_UNAVAILABLE"
        return {"target": target, "dependencies": [], "failure": code}


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        result = resolve_request(request)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as exc:  # MCP receives a stable error envelope.
        print(json.dumps({"target": "", "dependencies": [], "failure": f"DEPENDENCY_RESOLVER_FAILED:{type(exc).__name__}"}, separators=(",", ":")))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
