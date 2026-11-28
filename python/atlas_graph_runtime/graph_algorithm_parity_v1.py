"""NetworkX parity oracle & SHA-256 receipt builder for knn, bfs, dijkstra, astar."""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import networkx as nx
import numpy as np


def _sha256_json(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return "sha256:" + hashlib.sha256(payload.encode("ascii")).hexdigest()


def verify_knn_tie_aware_recall(
    candidate_neighbors: Mapping[str, Sequence[str]],
    exact_vectors: Mapping[str, Sequence[float]],
    k: int = 3,
    min_recall: float = 0.95,
) -> dict[str, Any]:
    """Compare candidate KNN lists against exact cosine KNN with tie-tolerance."""
    ids = sorted(exact_vectors.keys())
    mat = np.asarray([exact_vectors[i] for i in ids], dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    mat_norm = mat / np.maximum(norms, 1e-12)
    recalls: list[float] = []

    for idx, src_id in enumerate(ids):
        sims = mat_norm @ mat_norm[idx]
        sims[idx] = -np.inf
        scored = sorted(
            [(float(sims[j]), ids[j]) for j in range(len(ids)) if j != idx],
            key=lambda x: (-round(x[0], 6), x[1]),
        )
        cutoff = round(scored[min(k - 1, len(scored) - 1)][0], 6)
        tie_allowed = {nid for s, nid in scored if round(s, 6) >= cutoff - 1e-6}
        got = list(candidate_neighbors.get(src_id, []))[:k]
        hits = sum(1 for nid in got if nid in tie_allowed)
        recalls.append(hits / min(k, len(scored)))

    mean_recall = float(np.mean(recalls)) if recalls else 0.0
    return {
        "algorithm": "knn",
        "k": k,
        "mean_tie_aware_recall": round(mean_recall, 6),
        "passed": mean_recall >= min_recall,
    }


def verify_bfs_parity(
    graph: nx.Graph,
    source: str,
    candidate_hops: Mapping[str, int],
    max_depth: int = 3,
) -> dict[str, Any]:
    """Compare candidate BFS hop map against NetworkX single_source_shortest_path_length."""
    oracle = nx.single_source_shortest_path_length(graph, source, cutoff=max_depth)
    mismatches = [
        {"node": n, "oracle": oracle.get(n), "candidate": candidate_hops.get(n)}
        for n in sorted(set(oracle.keys()) | set(candidate_hops.keys()))
        if oracle.get(n) != candidate_hops.get(n)
    ]
    return {
        "algorithm": "bfs",
        "source": source,
        "max_depth": max_depth,
        "oracle_node_count": len(oracle),
        "mismatch_count": len(mismatches),
        "passed": len(mismatches) == 0,
    }


def verify_shortest_path_parity(
    algorithm: str,
    graph: nx.Graph,
    source: str,
    target: str,
    candidate_path: Sequence[str],
    candidate_cost: float,
    coords: Mapping[str, tuple[float, float]] | None = None,
    tolerance: float = 1e-6,
) -> dict[str, Any]:
    """Compare Dijkstra or A* path and cost against NetworkX oracle."""
    if algorithm == "dijkstra":
        oracle_path = nx.dijkstra_path(graph, source, target, weight="weight")
        oracle_cost = float(nx.dijkstra_path_length(graph, source, target, weight="weight"))
    elif algorithm == "astar":
        def heuristic(u: str, v: str) -> float:
            if not coords or u not in coords or v not in coords:
                return 0.0
            ux, uy = coords[u]
            vx, vy = coords[v]
            return math.hypot(ux - vx, uy - vy)

        oracle_path = nx.astar_path(graph, source, target, heuristic=heuristic, weight="weight")
        oracle_cost = float(nx.astar_path_length(graph, source, target, heuristic=heuristic, weight="weight"))
    else:
        raise ValueError(f"Unsupported shortest-path algorithm: {algorithm}")

    cost_delta = abs(float(candidate_cost) - oracle_cost)
    return {
        "algorithm": algorithm,
        "source": source,
        "target": target,
        "oracle_cost": round(oracle_cost, 6),
        "candidate_cost": round(float(candidate_cost), 6),
        "cost_delta": round(cost_delta, 9),
        "oracle_path": list(oracle_path),
        "candidate_path": list(candidate_path),
        "passed": cost_delta <= tolerance and list(candidate_path) == list(oracle_path),
    }


def write_graph_pass_parity_receipt(
    algorithm: str,
    parity_result: Mapping[str, Any],
    out_dir: Path,
    date_tag: str | None = None,
) -> Path:
    """Write .tmp/review/graph-pass-<algo>-<date>.json with deterministic SHA-256."""
    tag = date_tag or datetime.now(timezone.utc).strftime("%Y%m%d")
    out_dir.mkdir(parents=True, exist_ok=True)
    body = {
        "schema": "atlas.graph-pass-parity-receipt.v1",
        "algorithm": algorithm,
        "canonical_authority": False,
        "writes_performed": False,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "parity": dict(parity_result),
    }
    body["receipt_sha256"] = _sha256_json(body["parity"])
    out_path = out_dir / f"graph-pass-{algorithm}-{tag}.json"
    out_path.write_text(json.dumps(body, indent=2), encoding="utf-8")
    return out_path
