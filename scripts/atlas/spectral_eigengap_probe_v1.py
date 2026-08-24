#!/usr/bin/env python3
"""Read-only eigengap probe: is K=8 a natural cluster count for the fixture?

Follow-up to leiden_diagnostic_receipt_v1.py's finding that Leiden only ever
finds K=2 on this 500-node fixture at every resolution where it doesn't
collapse. Computes a broad top-of-spectrum eigenvalue set for both the
modularity matrix (largest eigenvalues) and normalized Laplacian (smallest
eigenvalues) and reports consecutive eigengaps. The classic eigengap
heuristic says the natural cluster count is where the gap between
eigenvalue[k-1] and eigenvalue[k] is largest. Pure CPU/numpy; no GPU, no
writes.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def normalized_laplacian(vertex_count: int, edges: np.ndarray) -> np.ndarray:
    adjacency = np.zeros((vertex_count, vertex_count), dtype=np.float64)
    for source, target, weight in edges:
        source, target = int(source), int(target)
        adjacency[source, target] += weight
        adjacency[target, source] += weight
    degree = adjacency.sum(axis=1)
    inv_sqrt = 1.0 / np.sqrt(np.maximum(degree, 1e-15))
    return np.eye(vertex_count) - (inv_sqrt[:, None] * adjacency * inv_sqrt[None, :])


def modularity_matrix(vertex_count: int, edges: np.ndarray) -> np.ndarray:
    adjacency = np.zeros((vertex_count, vertex_count), dtype=np.float64)
    for source, target, weight in edges:
        source, target = int(source), int(target)
        adjacency[source, target] += weight
        adjacency[target, source] += weight
    degrees = adjacency.sum(axis=1)
    total = float(degrees.sum())
    return adjacency - np.outer(degrees, degrees) / total


def eigengaps(values: list[float], ascending: bool) -> list[dict[str, Any]]:
    """Gap magnitude between consecutive eigenvalues, oriented so a larger
    gap always means 'stronger separation here'. `values` is sorted in the
    given direction (ascending for the Laplacian's smallest eigenvalues,
    descending for the modularity matrix's largest eigenvalues); the gap at
    index k is always computed as the positive drop across that boundary."""
    gaps = []
    for k in range(1, len(values)):
        drop = (values[k] - values[k - 1]) if ascending else (values[k - 1] - values[k])
        gaps.append({"afterIndex": k, "gap": float(drop)})
    return gaps


def run(args: argparse.Namespace) -> dict[str, Any]:
    nodes = pd.read_parquet(args.nodes).sort_values("gpu_node_id").reset_index(drop=True)
    if args.candidate_size:
        nodes = nodes.head(args.candidate_size).copy()
    edges = pd.read_parquet(args.edges)[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].copy()
    allowed = set(nodes["gpu_node_id"].astype(int).tolist())
    edges = edges[
        edges["src_gpu_node_id"].astype(int).isin(allowed)
        & edges["dst_gpu_node_id"].astype(int).isin(allowed)
    ]
    vertex_count = len(nodes)
    edge_array = edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].to_numpy(dtype=np.float64)

    laplacian = normalized_laplacian(vertex_count, edge_array)
    lap_eigenvalues = np.sort(np.linalg.eigvalsh(laplacian))
    lap_top = lap_eigenvalues[: args.top_k].tolist()

    modularity = modularity_matrix(vertex_count, edge_array)
    mod_eigenvalues = np.sort(np.linalg.eigvalsh(modularity))[::-1]
    mod_top = mod_eigenvalues[: args.top_k].tolist()

    lap_gaps = eigengaps(lap_top, ascending=True)
    mod_gaps = eigengaps(mod_top, ascending=False)
    lap_best = max(lap_gaps, key=lambda item: item["gap"]) if lap_gaps else None
    mod_best = max(mod_gaps, key=lambda item: item["gap"]) if mod_gaps else None

    return {
        "schema": "atlas.spectral-eigengap-probe.v1",
        "producer": "scripts/atlas/spectral_eigengap_probe_v1.py",
        "readOnly": True,
        "vertexCount": vertex_count,
        "edgeCount": int(len(edges)),
        "normalizedLaplacian": {
            "smallestEigenvalues": lap_top,
            "eigengaps": lap_gaps,
            "largestGap": lap_best,
            "suggestedK": lap_best["afterIndex"] if lap_best else None,
            "note": "K = index where gap is largest (eigengap heuristic); eigenvalue[0] should be ~0 for a connected graph",
        },
        "modularityMatrix": {
            "largestEigenvalues": mod_top,
            "eigengaps": mod_gaps,
            "largestGap": mod_best,
            "suggestedK": mod_best["afterIndex"] if mod_best else None,
        },
        "frozenK": args.frozen_k,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", required=True)
    parser.add_argument("--edges", required=True)
    parser.add_argument("--receipt-out", required=True)
    parser.add_argument("--candidate-size", type=int)
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--frozen-k", type=int, default=8)
    args = parser.parse_args()
    receipt = run(args)
    output = Path(args.receipt_out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "receipt": str(output),
        "laplacianSuggestedK": receipt["normalizedLaplacian"]["suggestedK"],
        "modularitySuggestedK": receipt["modularityMatrix"]["suggestedK"],
        "frozenK": receipt["frozenK"],
    }, indent=2))


if __name__ == "__main__":
    main()
