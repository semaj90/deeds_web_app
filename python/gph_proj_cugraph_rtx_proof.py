#!/usr/bin/env python3
"""RTX/cuGraph proof for GPH-PROJ-03/04.

Consumes an IncidenceProjectionV1 JSON artifact, builds the exact same directed
projection in NetworkX and cuGraph, runs PageRank, and emits a revision-qualified
machine-readable receipt. This is a proof harness, not a production graph owner.

Exit codes:
  0 PASS
  2 RAPIDS/CUDA unavailable
  3 contract/parity failure
"""
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

try:
    import cudf
    import cugraph
    import cupy as cp
except ImportError as error:
    print(json.dumps({"status": "UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)

try:
    import networkx as nx
except ImportError as error:
    print(json.dumps({"status": "UNAVAILABLE", "reason": f"networkx: {error}"}))
    raise SystemExit(2)


def _device_name() -> str:
    props = cp.cuda.runtime.getDeviceProperties(cp.cuda.Device().id)
    name = props.get("name", "unknown")
    return name.decode("utf-8") if isinstance(name, bytes) else str(name)


def _validate_projection(projection: dict) -> None:
    if projection.get("schema") != "atlas.incidence-projection.v1":
        raise ValueError("SCHEMA_MISMATCH")
    nodes = projection.get("nodes", [])
    edges = projection.get("edges", [])
    ids = [int(node["gpuNodeId"]) for node in nodes]
    if ids != list(range(len(nodes))):
        raise ValueError("GPU_ORDINALS_NOT_DENSE_OR_ORDERED")
    known = set(ids)
    for edge in edges:
        if int(edge["srcGpuNodeId"]) not in known or int(edge["dstGpuNodeId"]) not in known:
            raise ValueError("UNRESOLVED_GPU_ENDPOINT")
        if edge.get("edgeType") != "INCIDENT_TO":
            raise ValueError("NON_INCIDENCE_EDGE")


def _networkx_pagerank(projection: dict) -> dict[int, float]:
    graph = nx.DiGraph()
    graph.add_nodes_from(int(node["gpuNodeId"]) for node in projection["nodes"])
    graph.add_weighted_edges_from(
        (int(edge["srcGpuNodeId"]), int(edge["dstGpuNodeId"]), float(edge.get("weight", 1.0)))
        for edge in projection["edges"]
    )
    return nx.pagerank(graph, alpha=0.85, max_iter=500, tol=1.0e-10, weight="weight")


def _cugraph_pagerank(projection: dict) -> tuple[dict[int, float], float, float]:
    nodes = cudf.DataFrame({"vertex": [int(node["gpuNodeId"]) for node in projection["nodes"]]})
    edges = cudf.DataFrame({
        "src": [int(edge["srcGpuNodeId"]) for edge in projection["edges"]],
        "dst": [int(edge["dstGpuNodeId"]) for edge in projection["edges"]],
        "weight": [float(edge.get("weight", 1.0)) for edge in projection["edges"]],
    })

    build_started = time.perf_counter()
    graph = cugraph.Graph(directed=True)
    if len(edges) > 0:
        graph.from_cudf_edgelist(
            edges,
            source="src",
            destination="dst",
            edge_attr="weight",
            vertices=nodes["vertex"],
            renumber=False,
            store_transposed=True,
        )
    build_ms = (time.perf_counter() - build_started) * 1000.0

    kernel_started = time.perf_counter()
    result = cugraph.pagerank(graph, alpha=0.85, max_iter=500, tol=1.0e-10)
    cp.cuda.Stream.null.synchronize()
    kernel_ms = (time.perf_counter() - kernel_started) * 1000.0

    pdf = result.to_pandas()
    values = {int(row.vertex): float(row.pagerank) for row in pdf.itertuples(index=False)}
    return values, build_ms, kernel_ms


def run(path: Path, tolerance: float) -> dict:
    projection = json.loads(path.read_text(encoding="utf-8"))
    _validate_projection(projection)

    cpu = _networkx_pagerank(projection)
    gpu, graph_build_ms, pagerank_kernel_ms = _cugraph_pagerank(projection)

    all_ids = sorted(set(cpu) | set(gpu))
    diffs = {vertex: abs(cpu.get(vertex, math.nan) - gpu.get(vertex, math.nan)) for vertex in all_ids}
    finite_diffs = [value for value in diffs.values() if math.isfinite(value)]
    max_abs_diff = max(finite_diffs, default=math.inf)
    same_vertices = set(cpu) == set(gpu)
    pagerank_sum_gpu = sum(gpu.values())

    gates = {
        "GPH_PROJ_03_DENSE_ORDINALS": True,
        "GPH_PROJ_04_VERTEX_SET_PARITY": same_vertices,
        "GPH_PROJ_04_PAGERANK_PARITY": same_vertices and max_abs_diff <= tolerance,
        "RTX_CUGRAPH_EXECUTED": True,
    }
    status = "PASS" if all(gates.values()) else "FAIL"

    return {
        "schema": "atlas.gph-proj-rtx-proof.v1",
        "status": status,
        "executor": "cugraph",
        "cpuOracle": "networkx",
        "gpu": {
            "deviceName": _device_name(),
            "deviceId": int(cp.cuda.Device().id),
            "cugraphVersion": getattr(cugraph, "__version__", "unknown"),
            "cudfVersion": getattr(cudf, "__version__", "unknown"),
        },
        "workspaceRevision": projection["workspaceRevision"],
        "projectionRevision": projection["projectionRevision"],
        "projectionHash": projection["projectionHash"],
        "nodeCount": len(projection["nodes"]),
        "edgeCount": len(projection["edges"]),
        "pagerank": {
            "tolerance": tolerance,
            "maxAbsDiff": max_abs_diff,
            "gpuL1Sum": pagerank_sum_gpu,
        },
        "timingsMs": {
            "graphBuild": graph_build_ms,
            "pagerankKernel": pagerank_kernel_ms,
        },
        "gates": gates,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--projection", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1.0e-6)
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()

    if not args.projection.exists():
        print(json.dumps({"status": "UNAVAILABLE", "reason": "projection artifact not found"}))
        return 2

    try:
        receipt = run(args.projection, args.tolerance)
    except Exception as error:
        print(json.dumps({"status": "FAIL", "reason": f"{type(error).__name__}: {error}"}))
        return 3

    encoded = json.dumps(receipt, indent=2, sort_keys=True)
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0 if receipt["status"] == "PASS" else 3


if __name__ == "__main__":
    raise SystemExit(main())
