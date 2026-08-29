#!/usr/bin/env python3
"""Build a bounded, non-authoritative graph artifact from the validated edge plan."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "docs" / "reports" / "current-structural-edge-artifact-plan-v1.json"
OUT = ROOT / "sveltekit-frontend" / "docs" / "reports" / "current-structural-graph-artifact-v1"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> None:
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    if plan.get("mode") != "READ_ONLY_PLAN" or plan.get("canonicalAuthority") is not False:
        raise ValueError("CURRENT_GRAPH_PLAN_NOT_READ_ONLY")
    if any(bool(value) for value in plan.get("writes", {}).values()):
        raise ValueError("CURRENT_GRAPH_PLAN_HAS_WRITES")

    node_keys = sorted(node["graphNodeKey"] for node in plan.get("nodes", []))
    if len(node_keys) != len(set(node_keys)):
        raise ValueError("GRAPH_ARTIFACT_DUPLICATE_NODE_KEY")
    ordinal_by_key = {key: ordinal for ordinal, key in enumerate(node_keys)}

    node_metadata = {node["graphNodeKey"]: node for node in plan.get("nodes", [])}
    nodes = [{
        "gpu_node_id": ordinal_by_key[key],
        "graph_node_key": key,
        "packet_key": node_metadata[key].get("packetKey"),
    } for key in node_keys]
    edges = []
    for edge in plan.get("edges", []):
        source = edge["sourceNodeKey"]
        target = edge["targetNodeKey"]
        if source not in ordinal_by_key or target not in ordinal_by_key:
            raise ValueError("GRAPH_ARTIFACT_EDGE_ENDPOINT_MISSING")
        edges.append({
            "src_gpu_node_id": ordinal_by_key[source],
            "dst_gpu_node_id": ordinal_by_key[target],
            "edge_type": edge["edgeType"],
            "weight": 1.0,
        })
    edges.sort(key=lambda row: (row["src_gpu_node_id"], row["dst_gpu_node_id"], row["edge_type"]))

    node_text = "\n".join(f"{row['gpu_node_id']}|{row['graph_node_key']}|{row['packet_key'] or ''}" for row in nodes)
    edge_text = "\n".join(f"{row['src_gpu_node_id']}|{row['dst_gpu_node_id']}|{row['edge_type']}|{row['weight']}" for row in edges)
    node_checksum = f"sha256:{digest(node_text)}"
    edge_checksum = f"sha256:{digest(edge_text)}"
    graph_revision = f"sha256:{digest('|'.join([plan['workspaceRevision'], node_checksum, edge_checksum]))}"

    OUT.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(nodes).to_parquet(OUT / "nodes.parquet", index=False)
    pd.DataFrame(edges).to_parquet(OUT / "edges.parquet", index=False)
    (OUT / "nodes.json").write_text(json.dumps({"schema": "atlas.graph-node-table-v1", "rows": nodes}, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "schema": "atlas.current-structural-graph-artifact-v1",
        "mode": "NON_PRODUCTION_DERIVED_ARTIFACT",
        "workspaceRevision": plan["workspaceRevision"],
        "candidateSnapshotRevision": plan.get("candidateSnapshotRevision"),
        "ordinalMapChecksum": plan.get("ordinalMapChecksum"),
        "graphRevision": graph_revision,
        "projectionRevision": f"sha256:{digest('|'.join([graph_revision, 'projection-v1']))}",
        "producerRevision": "build-current-structural-graph-artifact-v1",
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "nodeChecksum": node_checksum,
        "edgeChecksum": edge_checksum,
        "nodeTableHash": node_checksum,
        "edgeTableHash": edge_checksum,
        "nodes": "nodes.parquet",
        "edges": "edges.parquet",
        "sourcePlan": "docs/reports/current-structural-edge-artifact-plan-v1.json",
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "CURRENT_STRUCTURAL_GRAPH_ARTIFACT_BUILT_NON_PRODUCTION", "nodeCount": len(nodes), "edgeCount": len(edges), "graphRevision": graph_revision, "artifactDir": str(OUT)}, indent=2))


if __name__ == "__main__":
    main()
