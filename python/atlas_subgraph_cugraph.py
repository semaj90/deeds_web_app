#!/usr/bin/env python3
"""Read-only cuGraph induced-subgraph proof for a frozen graph snapshot.

The input graph is loaded once, then ``cugraph.induced_subgraph`` extracts all
weighted edges whose two endpoints are in the explicit vertex list. This is a
derived graph artifact; it never connects to or writes any Atlas store.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path


def load_vertices(path: Path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    values = payload.get("vertices", payload) if isinstance(payload, dict) else payload
    if not isinstance(values, list) or not all(isinstance(value, int) for value in values):
        raise ValueError("vertices JSON must be an array of integer graph vertex IDs")
    return values


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--vertices", type=Path, required=True)
    parser.add_argument("--graph-revision", default="unrevisioned-fixture")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    report = {
        "schema": "atlas.cugraph-induced-subgraph-proof.v1",
        "backend": "cugraph",
        "read_only": True,
        "canonical_authority": False,
        "graph_revision": args.graph_revision,
        "status": "UNKNOWN",
        "writes_performed": False,
    }

    try:
        import cudf
        import cugraph
    except ImportError as error:
        report.update({"status": "UNAVAILABLE", "reason": str(error)})
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 2

    started = time.perf_counter()
    vertices = load_vertices(args.vertices)
    nodes = cudf.read_parquet(args.nodes, columns=["gpu_node_id"])
    edges = cudf.read_parquet(
        args.edges,
        columns=["src_gpu_node_id", "dst_gpu_node_id", "weight"],
    )
    graph = cugraph.Graph(directed=True)
    graph.from_cudf_edgelist(
        edges,
        source="src_gpu_node_id",
        destination="dst_gpu_node_id",
        edge_attr="weight",
        vertices=nodes["gpu_node_id"],
        renumber=False,
    )

    known_vertices = set(nodes["gpu_node_id"].to_pandas().tolist())
    selected_values = sorted(set(vertices).intersection(known_vertices))
    selected = cudf.Series(selected_values, dtype="int64")
    subgraph, offsets = cugraph.induced_subgraph(graph, selected)
    if subgraph is None:
        report.update({
            "status": "EXECUTED_EMPTY",
            "requested_vertex_count": len(vertices),
            "selected_vertex_count": len(selected_values),
            "missing_requested_vertices": len(set(vertices) - known_vertices),
            "extracted_vertex_count": 0,
            "extracted_edge_count": 0,
            "offset_count": 0,
            "elapsed_ms": (time.perf_counter() - started) * 1000,
            "semantics": "no edge has both endpoints in the selected vertex set",
        })
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 0

    edge_list = subgraph.view_edge_list()
    report.update({
        "status": "EXECUTED",
        "input_node_count": int(len(nodes)),
        "input_edge_count": int(len(edges)),
        "requested_vertex_count": len(vertices),
        "selected_vertex_count": len(selected_values),
        "missing_requested_vertices": len(set(vertices) - known_vertices),
        "extracted_vertex_count": int(len(selected_values)),
        "extracted_edge_count": int(len(edge_list)),
        "offset_count": int(len(offsets)),
        "elapsed_ms": (time.perf_counter() - started) * 1000,
        "semantics": "induced weighted graph; both edge endpoints must be selected",
    })
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
