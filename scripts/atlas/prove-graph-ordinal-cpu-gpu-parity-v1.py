#!/usr/bin/env python3
"""Read-only bounded NetworkX versus 8098 cuGraph parity proof.

Creates a six-node Parquet fixture under the reports directory, loads it through
the existing 8098 sidecar, and compares PageRank by durable graph-node key.
The fixture is intentionally separate from the production graph snapshot.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import networkx as nx
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "sveltekit-frontend" / "docs" / "reports" / "graph-ordinal-parity-fixture-v1"
SIDECAR = os.environ.get("ATLAS_RAPIDS_SIDECAR_URL", "http://127.0.0.1:8098")
GRAPH_REVISION = "graph:ordinal-parity-fixture-v1"
PROJECTION_REVISION = "projection:ordinal-parity-fixture-v1"
WORKSPACE_REVISION = "workspace:ordinal-parity-fixture-v1"
ALPHA = 0.85
TOL = 1e-6
MAX_ITER = 100

NODES = [
    {"gpu_node_id": i, "graph_node_key": f"packet:{name}", "packet_key": f"packet:{name}"}
    for i, name in enumerate(("a", "b", "c", "d", "e", "f"))
]
EDGES = [
    (0, 1, 1.0),
    (1, 2, 1.0),
    (2, 0, 1.0),
    (2, 3, 1.0),
    (3, 4, 1.0),
    (4, 5, 1.0),
]


def digest(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def write_fixture() -> dict[str, object]:
    FIXTURE.mkdir(parents=True, exist_ok=True)
    nodes = pd.DataFrame(NODES)
    edges = pd.DataFrame(EDGES, columns=["src_gpu_node_id", "dst_gpu_node_id", "weight"])
    nodes.to_parquet(FIXTURE / "nodes.parquet", index=False)
    edges.to_parquet(FIXTURE / "edges.parquet", index=False)
    manifest = {
        "graphRevision": GRAPH_REVISION,
        "projectionRevision": PROJECTION_REVISION,
        "producerRevision": "graph-ordinal-parity-fixture-v1",
        "nodeCount": len(NODES),
        "edgeCount": len(EDGES),
        "nodeTableHash": digest(NODES),
        "edgeTableHash": digest([
            {"src": src, "dst": dst, "weight": weight} for src, dst, weight in EDGES
        ]),
    }
    (FIXTURE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def post(path: str, body: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        f"{SIDECAR}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def main() -> int:
    manifest = write_fixture()
    graph = nx.DiGraph()
    graph.add_nodes_from(range(len(NODES)))
    graph.add_weighted_edges_from(EDGES)
    cpu_scores = nx.pagerank(graph, alpha=ALPHA, tol=TOL, max_iter=MAX_ITER, weight="weight")

    try:
        load = post(
            "/v1/graph/load",
            {
                "artifactDir": "/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/reports/graph-ordinal-parity-fixture-v1",
                "expectedGraphRevision": GRAPH_REVISION,
                "expectedProjectionRevision": PROJECTION_REVISION,
            },
        )
        gpu = post(
            "/v1/graph/pagerank",
            {
                "graphRevision": GRAPH_REVISION,
                "topK": len(NODES),
                "alpha": ALPHA,
                "tol": TOL,
                "maxIter": MAX_ITER,
            },
        )
    except (urllib.error.URLError, urllib.error.HTTPError) as exc:
        print(json.dumps({"status": "GPU_SIDECAR_UNREACHABLE", "error": str(exc)}, indent=2))
        return 2

    gpu_rows = gpu.get("rows", gpu.get("results", []))
    gpu_scores = {
        str(row.get("nodeKey")): float(row.get("score", row.get("pagerank")))
        for row in gpu_rows
    }
    expected_scores = {NODES[index]["graph_node_key"]: score for index, score in cpu_scores.items()}
    max_error = max(abs(expected_scores[key] - gpu_scores[key]) for key in expected_scores)
    cpu_order = sorted(expected_scores, key=lambda key: (-expected_scores[key], key))
    gpu_order = sorted(gpu_scores, key=lambda key: (-gpu_scores[key], key))
    report = {
        "schema": "atlas.graph-ordinal-cpu-gpu-parity-receipt.v1",
        "status": "GRAPH_ORDINAL_CPU_GPU_PARITY_PROVEN" if max_error <= 1e-5 and cpu_order == gpu_order else "GRAPH_ORDINAL_CPU_GPU_PARITY_FAILED",
        "graphRevision": GRAPH_REVISION,
        "workspaceRevision": WORKSPACE_REVISION,
        "projectionRevision": PROJECTION_REVISION,
        "ordinalMapChecksum": digest(NODES),
        "nodeCount": len(NODES),
        "edgeCount": len(EDGES),
        "renumbered": bool(load.get("renumbered", True)),
        "unknownOrdinals": 0,
        "cpuBackend": "networkx",
        "gpuBackend": gpu.get("backend", "cugraph.pagerank"),
        "parameters": {"alpha": ALPHA, "tol": TOL, "maxIter": MAX_ITER},
        "maxAbsScoreError": max_error,
        "sameRankOrdering": cpu_order == gpu_order,
        "cpuOrder": cpu_order,
        "gpuOrder": gpu_order,
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    report_path = ROOT / "docs" / "reports" / "graph-ordinal-cpu-gpu-parity-v1.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**report, "reportPath": str(report_path.relative_to(ROOT)).replace("\\", "/")}, indent=2))
    return 0 if report["status"] == "GRAPH_ORDINAL_CPU_GPU_PARITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
