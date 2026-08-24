#!/usr/bin/env python3
"""Read-only cuGraph Leiden resolution/determinism diagnostic.

Companion to spectral_diagnostic_receipt_v2.py. Investigates the observed
degeneracy in the live-graph fixture Leiden run recorded in
spectral-live-fixture-receipt-500.json (500 singleton clusters on 500 nodes,
reported_modularity -0.2198): sweeps `resolution` at a fixed seed to see
whether the fragmentation is a resolution/edge-weight-scale interaction
rather than a determinism or wrapper bug. Consumes the same frozen
nodes.parquet/edges.parquet fixture and the same candidate_size filtering as
spectral_diagnostic_receipt_v2.py so results are directly comparable. Does
not write graph facts, projections, or retrieval state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_labels(frame: Any, vertex_column: str = "vertex", cluster_column: str = "partition") -> list[int]:
    rows = frame[[vertex_column, cluster_column]].sort_values(vertex_column)
    remap: dict[Any, int] = {}
    result: list[int] = []
    values = rows[cluster_column].to_pandas().tolist() if hasattr(rows[cluster_column], "to_pandas") else rows[cluster_column].tolist()
    for value in values:
        if value not in remap:
            remap[value] = len(remap)
        result.append(remap[value])
    return result


def ari(left: list[int], right: list[int]) -> float:
    if len(left) != len(right):
        raise ValueError("ARI inputs must have equal length")
    if len(left) < 2:
        return 1.0
    _, li = np.unique(np.asarray(left), return_inverse=True)
    _, ri = np.unique(np.asarray(right), return_inverse=True)
    table = np.zeros((int(li.max()) + 1, int(ri.max()) + 1), dtype=np.int64)
    np.add.at(table, (li, ri), 1)
    comb2 = lambda values: values * (values - 1) / 2.0
    cells = float(np.sum(comb2(table)))
    rows = float(np.sum(comb2(table.sum(axis=1))))
    cols = float(np.sum(comb2(table.sum(axis=0))))
    total = comb2(len(left))
    expected = rows * cols / total
    maximum = 0.5 * (rows + cols)
    return 1.0 if maximum == expected else float((cells - expected) / (maximum - expected))


def run(args: argparse.Namespace) -> dict[str, Any]:
    import cudf  # type: ignore
    import cugraph  # type: ignore

    nodes = pd.read_parquet(args.nodes)
    edges = pd.read_parquet(args.edges)
    nodes = nodes.sort_values("gpu_node_id").reset_index(drop=True)
    if args.candidate_size:
        nodes = nodes.head(args.candidate_size).copy()
    edges = edges[["src_gpu_node_id", "dst_gpu_node_id", "weight"]].copy()
    allowed_nodes = set(nodes["gpu_node_id"].astype(int).tolist())
    edges = edges[
        edges["src_gpu_node_id"].astype(int).isin(allowed_nodes)
        & edges["dst_gpu_node_id"].astype(int).isin(allowed_nodes)
    ].copy()
    edges["src_gpu_node_id"] = edges["src_gpu_node_id"].astype(np.int32)
    edges["dst_gpu_node_id"] = edges["dst_gpu_node_id"].astype(np.int32)
    edges["weight"] = edges["weight"].astype(float)

    weight_stats = {
        "count": int(len(edges)),
        "min": float(edges["weight"].min()),
        "max": float(edges["weight"].max()),
        "mean": float(edges["weight"].mean()),
        "median": float(edges["weight"].median()),
    }

    graph_checksum = digest(nodes[["gpu_node_id", "packet_key"]].astype(str).to_dict("records"))
    ordinal_checksum = digest(nodes["gpu_node_id"].astype(int).tolist())

    gpu_edges = cudf.DataFrame(edges)
    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(
        gpu_edges,
        source="src_gpu_node_id",
        destination="dst_gpu_node_id",
        edge_attr="weight",
    )

    unweighted_gpu_edges = cudf.DataFrame(edges.assign(weight=1.0))
    unweighted_graph = cugraph.Graph(directed=False)
    unweighted_graph.from_cudf_edgelist(
        unweighted_gpu_edges,
        source="src_gpu_node_id",
        destination="dst_gpu_node_id",
        edge_attr="weight",
    )

    resolutions = [float(value) for value in args.resolutions.split(",") if value.strip()]
    resolution_runs: list[dict[str, Any]] = []
    for resolution in resolutions:
        for label, g in (("fixture_weighted", graph), ("unweighted", unweighted_graph)):
            partitions = []
            timings = []
            reported_modularities = []
            for _ in range(3):
                started = time.perf_counter()
                partition, modularity = cugraph.leiden(
                    g,
                    max_iter=args.max_iter,
                    resolution=resolution,
                    random_state=args.random_seed,
                    theta=args.theta,
                )
                timings.append((time.perf_counter() - started) * 1000.0)
                labels = canonical_labels(partition)
                partitions.append(labels)
                reported_modularities.append(float(modularity))
            checksums = [digest(labels) for labels in partitions]
            cluster_count = len(set(partitions[0]))
            resolution_runs.append(
                {
                    "resolution": resolution,
                    "graphWeighting": label,
                    "runs": 3,
                    "assignmentChecksums": checksums,
                    "gpuGpuARI": [ari(partitions[0], partitions[index]) for index in (1, 2)],
                    "gpuRepeatDeterministic": len(set(checksums)) == 1,
                    "clusterCount": cluster_count,
                    "reportedModularity": reported_modularities[0],
                    "reportedModularitySpread": max(reported_modularities) - min(reported_modularities),
                    "elapsedMs": timings,
                }
            )

    return {
        "schema": "atlas.leiden-diagnostic-receipt.v1",
        "producer": "scripts/atlas/leiden_diagnostic_receipt_v1.py",
        "readOnly": True,
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "cugraphVersion": getattr(cugraph, "__version__", "UNKNOWN"),
            "cudfVersion": getattr(cudf, "__version__", "UNKNOWN"),
        },
        "frozenConfiguration": {
            "maxIter": args.max_iter,
            "theta": args.theta,
            "randomSeed": args.random_seed,
            "resolutionsSwept": resolutions,
        },
        "fixture": {
            "nodes": str(Path(args.nodes).resolve()),
            "edges": str(Path(args.edges).resolve()),
            "nodeCount": len(nodes),
            "graphChecksum": graph_checksum,
            "ordinalMapChecksum": ordinal_checksum,
            "edgeWeightStats": weight_stats,
        },
        "diagnostics": {
            "resolutionSweep": resolution_runs,
            "priorAnomaly": {
                "source": "docs/reports/spectral-live-fixture-receipt-500.json",
                "resolution": 1.0,
                "clusterCount": 500,
                "reportedModularity": -0.21979308161852879,
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", required=True)
    parser.add_argument("--edges", required=True)
    parser.add_argument("--receipt-out", required=True)
    parser.add_argument("--candidate-size", type=int)
    parser.add_argument("--random-seed", type=int, required=True)
    parser.add_argument("--max-iter", type=int, default=100)
    parser.add_argument("--theta", type=float, default=1.0)
    parser.add_argument("--resolutions", default="0.001,0.01,0.05,0.1,0.5,1.0")
    args = parser.parse_args()
    receipt = run(args)
    output = Path(args.receipt_out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(output), "schema": receipt["schema"]}, indent=2))


if __name__ == "__main__":
    main()
