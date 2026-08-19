#!/usr/bin/env python3
"""Projection-qualified cuGraph PageRank challenger.

Consumes the existing GRAPH_SNAPSHOT_PARITY parquet artifact. This executor
never writes Postgres/Neo4j and never claims canonical authority. It filters
the frozen directed edge list by the PageRank plan's relationshipTypes, runs
cuGraph, writes gpu-node-ordinal raw scores as NDJSON, and reports execution
telemetry. Canonical identity promotion is owned by the TypeScript lineage and
cross-executor parity gates.

Personalized PageRank is intentionally rejected here: the legacy parquet
snapshot exposes graph_node_key/packet_key but does not yet prove a V3
canonicalId column, so resolving PPR seeds from it would invent identity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

try:
    import cudf
    import cugraph
except ImportError as error:
    print(json.dumps({"status": "UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--relationship-types-json", required=True)
    parser.add_argument("--damping", type=float, required=True)
    parser.add_argument("--max-iterations", type=int, required=True)
    parser.add_argument("--tolerance", type=float, required=True)
    parser.add_argument("--weighted", action="store_true")
    parser.add_argument("--scores-out", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.nodes.exists() or not args.edges.exists():
        print(json.dumps({"status": "UNAVAILABLE", "reason": "nodes or edges parquet artifact missing"}))
        return 2

    relationship_types = json.loads(args.relationship_types_json)
    if not isinstance(relationship_types, list) or not relationship_types or not all(isinstance(value, str) and value for value in relationship_types):
        raise ValueError("relationship-types-json must be a non-empty JSON string array")
    if not (0.0 < args.damping < 1.0):
        raise ValueError("cuGraph damping/alpha must be in (0,1)")
    if args.max_iterations <= 0 or args.tolerance <= 0:
        raise ValueError("max-iterations and tolerance must be positive")

    read_started = time.perf_counter()
    nodes = cudf.read_parquet(args.nodes, columns=["gpu_node_id"])
    edges = cudf.read_parquet(
        args.edges,
        columns=["src_gpu_node_id", "dst_gpu_node_id", "edge_type", "weight"],
    )
    edges = edges[edges["edge_type"].isin(relationship_types)]
    read_ms = (time.perf_counter() - read_started) * 1000.0

    node_count = len(nodes)
    edge_count = len(edges)
    if node_count == 0:
        raise ValueError("PageRank projection contains no nodes")

    ids = nodes["gpu_node_id"]
    unique_count = int(ids.nunique())
    min_id = int(ids.min())
    max_id = int(ids.max())
    dense_ids = unique_count == node_count and min_id == 0 and max_id == node_count - 1
    if not dense_ids:
        raise ValueError("gpu_node_id must be unique and dense [0,node_count-1]")
    if edge_count > 0:
        if int(edges["src_gpu_node_id"].min()) < 0 or int(edges["dst_gpu_node_id"].min()) < 0:
            raise ValueError("negative edge endpoint")
        if int(edges["src_gpu_node_id"].max()) >= node_count or int(edges["dst_gpu_node_id"].max()) >= node_count:
            raise ValueError("edge endpoint outside node range")

    build_started = time.perf_counter()
    graph = cugraph.Graph(directed=True)
    if edge_count > 0:
        graph.from_cudf_edgelist(
            edges,
            source="src_gpu_node_id",
            destination="dst_gpu_node_id",
            edge_attr="weight" if args.weighted else None,
            vertices=ids,
            renumber=False,
            store_transposed=True,
        )
    else:
        # cuGraph needs a graph object with the vertex population even when
        # there are no edges. This path is not useful for canonical authority,
        # but preserving the nodes makes the output contract deterministic.
        empty = cudf.DataFrame({
            "src_gpu_node_id": cudf.Series([], dtype="int64"),
            "dst_gpu_node_id": cudf.Series([], dtype="int64"),
        })
        graph.from_cudf_edgelist(
            empty,
            source="src_gpu_node_id",
            destination="dst_gpu_node_id",
            vertices=ids,
            renumber=False,
            store_transposed=True,
        )
    graph_build_ms = (time.perf_counter() - build_started) * 1000.0

    compute_started = time.perf_counter()
    result = cugraph.pagerank(
        graph,
        alpha=args.damping,
        max_iter=args.max_iterations,
        tol=args.tolerance,
        fail_on_nonconvergence=False,
    )
    if isinstance(result, tuple):
        scores_df, converged = result
        convergence_status = "CONVERGED" if bool(converged) else "NON_CONVERGED"
    else:
        # Defensive compatibility with older cuGraph versions that returned
        # only the score frame. Absence of the flag is UNKNOWN, never assumed.
        scores_df = result
        convergence_status = "UNKNOWN"
    compute_ms = (time.perf_counter() - compute_started) * 1000.0

    scores_pdf = scores_df.to_pandas().sort_values("vertex")
    output_hash = hashlib.sha256()
    with args.scores_out.open("w", encoding="utf-8") as handle:
        for row in scores_pdf.itertuples(index=False):
            score = float(row.pagerank)
            if score < 0.0:
                raise ValueError(f"negative PageRank score for vertex {row.vertex}")
            encoded = json.dumps(
                {"nodeOrdinal": int(row.vertex), "score": score},
                sort_keys=True,
                separators=(",", ":"),
            )
            output_hash.update(encoded.encode("utf-8"))
            output_hash.update(b"\n")
            handle.write(encoded + "\n")

    print(json.dumps({
        "status": "EXECUTED",
        "executorId": "CUGRAPH",
        "nodeCount": node_count,
        "relationshipCount": edge_count,
        "convergenceStatus": convergence_status,
        "ranIterations": None,
        "failOnNonconvergence": False,
        "readMillis": read_ms,
        "graphBuildMillis": graph_build_ms,
        "computeMillis": compute_ms,
        "rawOutputHash": output_hash.hexdigest(),
        "relationshipTypes": relationship_types,
        "weighted": bool(args.weighted),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
