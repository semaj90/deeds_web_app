#!/usr/bin/env python3
"""NetworkX CPU reference and optional cuGraph parity for Stage 5 PageRank."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import networkx as nx


CONFIGURATION = {
    "algorithm": "networkx.pagerank",
    "alpha": 0.85,
    "max_iter": 100,
    "tol": 1e-8,
    "weight": None,
    "dangling": "uniform",
    "graphKind": "directed-unweighted-simple",
    "nodeOrder": "unicode-codepoint",
    "edgeOrder": "source-target-unicode-codepoint",
}


def _stable_json(value: Any) -> str:
    def normalize(item: Any) -> Any:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        return item

    return json.dumps(normalize(value), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _topology_hash(snapshot: dict[str, Any]) -> str:
    normalized = {
        "edges": sorted(
            [{key: value for key, value in edge.items() if key != "snapshotId"}
             for edge in snapshot["edges"]],
            key=lambda edge: edge["edgeKey"],
        ),
        "nodes": sorted(
            [{key: value for key, value in node.items() if key != "snapshotId"}
             for node in snapshot["nodes"]],
            key=lambda node: node["nodeKey"],
        ),
    }
    relation_events = snapshot.get("relationEvents", [])
    relation_participants = snapshot.get("relationParticipants", [])
    if relation_events or relation_participants:
        normalized["relationEvents"] = sorted(
            [{key: value for key, value in relation.items() if key not in {"snapshotId", "topologyHash"}}
             for relation in relation_events],
            key=lambda relation: relation["relationId"],
        )
        normalized["relationParticipants"] = sorted(
            [{key: value for key, value in participant.items() if key != "snapshotId"}
             for participant in relation_participants],
            key=lambda participant: (
                participant["relationId"], participant["ordinal"],
                participant["role"], participant["nodeKey"],
            ),
        )
    return hashlib.sha256(_stable_json(normalized).encode("utf-8")).hexdigest()


def run(snapshot_path: Path) -> dict[str, Any]:
    raw = snapshot_path.read_bytes()
    snapshot = json.loads(raw.decode("utf-8"))
    nodes_raw = snapshot.get("nodes")
    edges_raw = snapshot.get("edges")
    snapshot_id = snapshot.get("snapshotId")
    graph_snapshot = snapshot.get("graphSnapshot")
    topology_hash = graph_snapshot.get("topologyHash") if isinstance(graph_snapshot, dict) else None
    if not isinstance(snapshot_id, str) or not snapshot_id:
        raise ValueError("PAGERANK_SNAPSHOT_ID_REQUIRED")
    if not isinstance(nodes_raw, list) or not isinstance(edges_raw, list) or not nodes_raw:
        raise ValueError("PAGERANK_GRAPH_INPUT_INVALID")
    if not isinstance(topology_hash, str) or len(topology_hash) != 64:
        raise ValueError("PAGERANK_TOPOLOGY_HASH_REQUIRED")
    if _topology_hash(snapshot) != topology_hash:
        raise ValueError("PAGERANK_TOPOLOGY_HASH_MISMATCH")

    nodes = sorted({node.get("nodeKey") for node in nodes_raw if isinstance(node, dict)})
    if len(nodes) != len(nodes_raw) or any(not isinstance(node, str) or not node for node in nodes):
        raise ValueError("PAGERANK_NODE_SET_INVALID")
    node_set = set(nodes)
    edges = []
    for edge in edges_raw:
        if not isinstance(edge, dict):
            raise ValueError("PAGERANK_EDGE_INVALID")
        source = edge.get("sourceNodeKey")
        target = edge.get("targetNodeKey")
        if source not in node_set or target not in node_set:
            raise ValueError("PAGERANK_EDGE_ENDPOINT_UNKNOWN")
        edges.append((source, target))

    graph = nx.DiGraph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from(sorted(set(edges)))
    scores = nx.pagerank(
        graph,
        alpha=CONFIGURATION["alpha"],
        max_iter=CONFIGURATION["max_iter"],
        tol=CONFIGURATION["tol"],
        weight=CONFIGURATION["weight"],
    )
    score_rows = [{"nodeKey": node, "pagerankRaw": scores[node]} for node in nodes]
    scores_digest = hashlib.sha256(_stable_json(score_rows).encode("utf-8")).hexdigest()
    return {
        "status": "NETWORKX_REFERENCE_PROVEN",
        "engine": "networkx",
        "engine_version": nx.__version__,
        "execution_lane": "atlas-gpu-8098-cpu",
        "gpu_used": False,
        "snapshot_id": snapshot_id,
        "topology_hash": topology_hash,
        "canonical_authority": False,
        "workspace_revision": graph_snapshot.get("workspaceRevision") if isinstance(graph_snapshot, dict) else None,
        "graph_revision": graph_snapshot.get("graphRevision") if isinstance(graph_snapshot, dict) else None,
        "configuration": CONFIGURATION,
        "node_count": len(nodes),
        "edge_count": graph.number_of_edges(),
        "input_sha256": f"sha256:{hashlib.sha256(raw).hexdigest()}",
        "scores_sha256": f"sha256:{scores_digest}",
        "scores": score_rows,
    }


def run_cugraph(snapshot_path: Path, networkx_receipt: dict[str, Any], tolerance: float) -> dict[str, Any]:
    import cudf
    import cugraph
    import cupy as cp

    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    nodes = sorted(node["nodeKey"] for node in snapshot["nodes"])
    node_ids = {node: index for index, node in enumerate(nodes)}
    edge_pairs = sorted({
        (node_ids[edge["sourceNodeKey"]], node_ids[edge["targetNodeKey"]])
        for edge in snapshot["edges"]
    })
    if not edge_pairs:
        raise ValueError("CUGRAPH_EDGE_SET_EMPTY")

    edge_frame = cudf.DataFrame({
        "src": [source for source, _ in edge_pairs],
        "dst": [target for _, target in edge_pairs],
    })
    vertices = cudf.Series(list(range(len(nodes))), name="vertex")
    build_started = time.perf_counter()
    graph = cugraph.Graph(directed=True)
    graph.from_cudf_edgelist(
        edge_frame,
        source="src",
        destination="dst",
        vertices=vertices,
        renumber=False,
        store_transposed=True,
    )
    graph_build_ms = (time.perf_counter() - build_started) * 1000.0

    execution_started = time.perf_counter()
    result = cugraph.pagerank(
        graph,
        alpha=CONFIGURATION["alpha"],
        max_iter=CONFIGURATION["max_iter"],
        tol=CONFIGURATION["tol"],
    )
    cp.cuda.Stream.null.synchronize()
    pagerank_ms = (time.perf_counter() - execution_started) * 1000.0
    gpu_scores = {int(row.vertex): float(row.pagerank) for row in result.to_pandas().itertuples(index=False)}
    cpu_scores = {node_ids[row["nodeKey"]]: row["pagerankRaw"] for row in networkx_receipt["scores"]}
    same_vertices = set(cpu_scores) == set(gpu_scores)
    max_delta = max(
        (abs(cpu_scores[node] - gpu_scores[node]) for node in cpu_scores if node in gpu_scores),
        default=float("inf"),
    )
    gpu_rows = [{"nodeKey": nodes[node], "pagerankRaw": gpu_scores[node]} for node in sorted(gpu_scores)]
    gpu_sum = sum(gpu_scores.values())
    finite_scores = all(math.isfinite(score) for score in gpu_scores.values())
    device_name = cp.cuda.runtime.getDeviceProperties(cp.cuda.Device().id)["name"]
    if isinstance(device_name, bytes):
        device_name = device_name.decode("utf-8")
    return {
        "status": "PASS" if same_vertices and finite_scores and max_delta <= tolerance and abs(gpu_sum - 1.0) <= tolerance else "FAIL",
        "executor": "cugraph.pagerank",
        "cugraph_version": getattr(cugraph, "__version__", "unknown"),
        "cudf_version": cudf.__version__,
        "device_name": str(device_name),
        "device_id": int(cp.cuda.Device().id),
        "node_count": len(gpu_scores),
        "edge_count": len(edge_pairs),
        "max_absolute_delta": max_delta,
        "tolerance": tolerance,
        "gpu_score_sum": gpu_sum,
        "gpu_score_sum_delta": abs(gpu_sum - 1.0),
        "gpu_scores_finite": finite_scores,
        "gpu_scores_sha256": f"sha256:{hashlib.sha256(_stable_json(gpu_rows).encode('utf-8')).hexdigest()}",
        "timings_ms": {"graph_build": graph_build_ms, "pagerank_and_sync": pagerank_ms},
        "gpu_used": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--cugraph", action="store_true")
    parser.add_argument("--cuda-tolerance", type=float, default=1e-6)
    args = parser.parse_args()
    try:
        receipt = run(args.snapshot)
        if args.cugraph:
            if args.cuda_tolerance <= 0:
                raise ValueError("CUGRAPH_TOLERANCE_INVALID")
            receipt["cuda_parity"] = run_cugraph(args.snapshot, receipt, args.cuda_tolerance)
        print(_stable_json(receipt))
        return 0 if receipt.get("cuda_parity", {}).get("status", "PASS") == "PASS" else 3
    except Exception as error:
        print(_stable_json({"status": "NETWORKX_REFERENCE_REJECTED", "reason": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
