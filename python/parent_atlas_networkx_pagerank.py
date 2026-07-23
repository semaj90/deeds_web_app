#!/usr/bin/env python3
"""NetworkX reference oracle for the Parent Atlas fixture-only authority gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from pathlib import Path

try:
    import networkx as nx
    import yaml
except ImportError as error:  # Keep infrastructure status explicit for the caller.
    print(json.dumps({"status": "NETWORKX_UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "sveltekit-frontend/src/lib/server/atlas/graph/fixtures/pagerank-parity-graph.json"
DEFAULT_MANIFEST = ROOT / ".okf/manifest.yaml"


def stable_json(value: object) -> str:
    def normalize_numbers(item: object) -> object:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, list):
            return [normalize_numbers(child) for child in item]
        if isinstance(item, dict):
            return {key: normalize_numbers(child) for key, child in item.items()}
        return item

    return json.dumps(normalize_numbers(value), sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def topology_hash(nodes: list[dict], edges: list[dict]) -> str:
    normalized = {
        "nodes": sorted(
            [{key: value for key, value in node.items() if key != "snapshotId"} for node in nodes],
            key=lambda node: node["nodeKey"],
        ),
        "edges": sorted(
            [{key: value for key, value in edge.items() if key != "snapshotId"} for edge in edges],
            key=lambda edge: edge["edgeKey"],
        ),
    }
    return hashlib.sha256(stable_json(normalized).encode("utf-8")).hexdigest()


def run(fixture_path: Path, manifest_path: Path) -> dict:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    projection = manifest["graph_projection"]
    included = {edge.upper() for edge in projection["pagerank_edges"]}
    excluded = {edge.upper() for edge in projection["excluded_edges"]}
    if "SEMANTIC_SIMILAR" not in excluded:
        raise ValueError("semantic_similar must be excluded from the PageRank projection")
    if included & excluded:
        raise ValueError("PageRank edge types cannot also be excluded")

    snapshot_id = fixture["snapshotId"]
    nodes = [{**node, "snapshotId": snapshot_id} for node in fixture["nodes"]]
    edges = [{**edge, "snapshotId": snapshot_id} for edge in fixture["edges"]]
    graph = nx.DiGraph()
    graph.add_nodes_from(node["nodeKey"] for node in nodes)
    for edge in edges:
        if edge["edgeType"] in included and edge["confidence"] >= projection["minimum_confidence"]:
            graph.add_edge(edge["sourceNodeKey"], edge["targetNodeKey"], weight=edge["weight"])

    scores = nx.pagerank(graph, alpha=0.85, max_iter=100, tol=1e-8, weight="weight")
    top_hash = topology_hash(nodes, edges)
    score_rows = [{"nodeKey": node_key, "pagerankRaw": scores[node_key]} for node_key in sorted(scores)]
    result_hash = hashlib.sha256(stable_json(score_rows).encode("utf-8")).hexdigest()
    run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"atlas-networkx:{snapshot_id}:{top_hash}"))

    return {
        "status": "NETWORKX_REFERENCE_PROVEN",
        "snapshot_id": snapshot_id,
        "authority_contract": "fixture-authority-v1",
        "run_id": run_id,
        "topology_hash": top_hash,
        "engine": "networkx",
        "normalization_applied_by": "none",
        "config": {"alpha": 0.85, "max_iter": 100, "tol": 1e-8, "weight": "weight"},
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "included_edge_types": sorted(included),
        "excluded_edge_types": sorted(excluded),
        "scores": score_rows,
        "result_hash": result_hash,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    print(json.dumps(run(args.fixture, args.manifest), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
