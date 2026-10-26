#!/usr/bin/env python3
"""Bounded advisory cuGraph parity check for a frozen containment graph."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time
from pathlib import Path

import cudf
import cugraph
import cupy as cp
import pyarrow as pa
import pyarrow.ipc as ipc

from atlas_graph_runtime.contracts import TypedGraphEdge
from atlas_graph_runtime.networkx_executor import run_bfs_neighborhood, run_pagerank_v2


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_arrow(path: Path) -> pa.Table:
    with ipc.open_file(path) as reader:
        return reader.read_all()


def compare_outputs(cpu_scores, gpu_scores, cpu_depth, cpu_parent, gpu_depth, gpu_parent,
                    max_abs_error_threshold, top_k=10, minimum_top_k_overlap=0.8):
    expected_ordinals = set(cpu_scores)
    if not expected_ordinals or set(gpu_scores) != expected_ordinals:
        raise ValueError("PAGERANK_ORDINAL_COVERAGE_MISMATCH")
    if any(not math.isfinite(score) or score < 0 for score in (*cpu_scores.values(), *gpu_scores.values())):
        raise ValueError("PAGERANK_SCORE_INVALID")
    if abs(sum(cpu_scores.values()) - 1.0) > 1e-6 or abs(sum(gpu_scores.values()) - 1.0) > 1e-6:
        raise ValueError("PAGERANK_MASS_INVALID")
    cpu_order = sorted(cpu_scores, key=lambda node: (-cpu_scores[node], node))
    gpu_order = sorted(gpu_scores, key=lambda node: (-gpu_scores[node], node))
    overlap = len(set(cpu_order[:top_k]) & set(gpu_order[:top_k])) / min(top_k, len(cpu_order))
    max_error = max(abs(cpu_scores[node] - gpu_scores[node]) for node in expected_ordinals)
    if set(gpu_depth) != set(cpu_depth):
        raise ValueError("BFS_REACHABILITY_MISMATCH")
    depth_match = cpu_depth == gpu_depth
    parent_match = cpu_parent == gpu_parent
    parity = max_error <= max_abs_error_threshold and overlap >= minimum_top_k_overlap and depth_match and parent_match
    return {"maxAbsPageRankError": max_error, "sameTotalOrder": cpu_order == gpu_order,
            "topK": min(top_k, len(cpu_order)), "topKOverlap": overlap,
            "bfsDepthsMatch": depth_match, "bfsParentsMatch": parent_match, "parity": parity}


def run(args: argparse.Namespace) -> dict:
    repo = Path(args.repo_root).resolve()
    cpu_receipt_path = (repo / args.cpu_receipt).resolve()
    if repo not in cpu_receipt_path.parents:
        raise ValueError("CPU_RECEIPT_OUTSIDE_REPOSITORY")
    cpu_receipt_bytes = cpu_receipt_path.read_bytes()
    cpu_receipt = json.loads(cpu_receipt_bytes)
    cpu_body = dict(cpu_receipt)
    expected_receipt_hash = cpu_body.pop("receiptSha256", None)
    if sha256(canonical_json(cpu_body)) != expected_receipt_hash:
        raise ValueError("CPU_RECEIPT_CHECKSUM_INVALID")
    if cpu_receipt.get("canonicalAuthority") is not False or cpu_receipt.get("productionAdmission") is not False:
        raise ValueError("CPU_RECEIPT_AUTHORITY_FLAGS_INVALID")
    edge_path = cpu_receipt_path.parent / "directory-containment-edges.arrow"
    edge_bytes = edge_path.read_bytes()
    expected_edge_hash = cpu_receipt["outputs"]["directory-containment-edges.arrow"]["sha256"]
    if sha256(edge_bytes) != expected_edge_hash:
        raise ValueError("EDGE_ARTIFACT_CHECKSUM_INVALID")
    edge_table = read_arrow(edge_path)
    if edge_table.num_rows != cpu_receipt["input"]["exactParentEdgeCount"]:
        raise ValueError("EDGE_ROW_COUNT_INVALID")
    src = edge_table["srcOrdinal"].to_pylist()
    dst = edge_table["dstOrdinal"].to_pylist()
    if len(src) != len(set(dst)) or any(kind != "DIRECTORY_CONTAINS" for kind in edge_table["edgeType"].to_pylist()):
        raise ValueError("CONTAINMENT_EDGE_SHAPE_INVALID")
    node_count = cpu_receipt["input"]["nodeCount"]
    if node_count < 1 or len(src) != node_count - 1 or min(src + dst) < 0 or max(src + dst) >= node_count:
        raise ValueError("GRAPH_BOUNDS_INVALID")
    source_ordinal = cpu_receipt["operations"]["bfs"]["sourceOrdinal"]
    if not 0 <= source_ordinal < node_count or args.root_ordinal not in (None, source_ordinal):
        raise ValueError("BFS_ROOT_ORDINAL_MISMATCH")
    alpha, tol, max_iter = args.alpha, args.tolerance, args.max_iter

    graph_revision = cpu_receipt["input"]["graphRevision"]
    edges = [TypedGraphEdge(src_ordinal=source, dst_ordinal=target, kind="DIRECTORY_CONTAINS", weight=1.0)
             for source, target in zip(src, dst)]
    start = time.perf_counter()
    cpu_scores, _ = run_pagerank_v2(graph_revision=graph_revision, node_ordinals=range(node_count), edges=edges,
                                    alpha=alpha, tol=tol, max_iter=max_iter)
    cpu_seconds = time.perf_counter() - start
    bfs_rows, _ = run_bfs_neighborhood(graph_revision=graph_revision, node_ordinals=range(node_count), edges=edges,
                                       source_ordinal=source_ordinal, max_depth=args.bfs_depth)
    cpu_depth = {ordinal: depth for ordinal, depth, _ in bfs_rows}
    cpu_parent = {ordinal: parent for ordinal, _, parent in bfs_rows}

    device_before = cp.cuda.runtime.memGetInfo()
    gpu_start = time.perf_counter()
    gpu_graph = cugraph.Graph(directed=True)
    edge_frame = cudf.DataFrame({"srcOrdinal": cudf.Series(src, dtype="int32"), "dstOrdinal": cudf.Series(dst, dtype="int32"),
                                 "weight": cudf.Series([1.0] * len(src), dtype="float32")})
    gpu_graph.from_cudf_edgelist(edge_frame, source="srcOrdinal", destination="dstOrdinal", edge_attr="weight", renumber=False,
                                 store_transposed=True, vertices=cudf.Series(range(node_count), dtype="int32"))
    gpu_pr = cugraph.pagerank(gpu_graph, alpha=alpha, tol=tol, max_iter=max_iter)
    gpu_bfs = cugraph.bfs(gpu_graph, start=source_ordinal, depth_limit=args.bfs_depth, return_predecessors=True)
    gpu_pr = gpu_pr.to_pandas()
    gpu_bfs = gpu_bfs.to_pandas()
    cp.cuda.Stream.null.synchronize()
    gpu_seconds = time.perf_counter() - gpu_start
    device_after = cp.cuda.runtime.memGetInfo()
    gpu_scores = {int(row.vertex): float(row.pagerank) for row in gpu_pr.itertuples(index=False)}
    gpu_depth = {int(row.vertex): int(row.distance) for row in gpu_bfs.itertuples(index=False) if int(row.distance) >= 0}
    gpu_parent = {int(row.vertex): int(row.predecessor) for row in gpu_bfs.itertuples(index=False) if int(row.distance) >= 0}
    if set(gpu_scores) != set(range(node_count)) or set(gpu_depth) != set(cpu_depth):
        raise ValueError("GPU_OUTPUT_COVERAGE_MISMATCH")
    cpu_order = sorted(cpu_scores, key=lambda node: (-cpu_scores[node], node))
    gpu_order = sorted(gpu_scores, key=lambda node: (-gpu_scores[node], node))
    comparison = compare_outputs(cpu_scores, gpu_scores, cpu_depth, cpu_parent, gpu_depth, gpu_parent,
                                 args.max_abs_error, args.top_k, args.minimum_top_k_overlap)
    output_dir = (repo / ".tmp" / "atlas" / "directory-intelligence" / "directory-containment-graph" / args.run_id).resolve()
    if repo not in output_dir.parents:
        raise ValueError("OUTPUT_OUTSIDE_REPOSITORY")
    output_dir.mkdir(parents=True, exist_ok=False)
    output = {
        "schema": "atlas.directory-containment-cugraph-parity.v1",
        "runId": args.run_id,
        "status": "CU_GRAPH_PAGERANK_BFS_PARITY_PASS" if comparison["parity"] else "CU_GRAPH_PAGERANK_BFS_PARITY_FAIL",
        "canonicalAuthority": False,
        "productionAdmission": False,
        "scratchArtifactsWritten": True,
        "persistentWritesPerformed": False,
        "input": {"cpuReceiptSha256": expected_receipt_hash, "edgeArtifactSha256": expected_edge_hash,
                  "graphRevision": cpu_receipt["input"]["graphRevision"], "nodeCount": node_count, "edgeCount": len(src),
                  "edgeKind": "DIRECTORY_CONTAINS", "ordinalKind": "directoryOrdinal-not-CandidateOrdinal"},
        "parameters": {"alpha": alpha, "tolerance": tol, "maxIter": max_iter, "bfsDepth": args.bfs_depth,
                       "maxAbsErrorThreshold": args.max_abs_error,
                       "topK": args.top_k, "minimumTopKOverlap": args.minimum_top_k_overlap},
        "comparison": {**comparison,
                       "bfsReachedCpu": len(cpu_depth), "bfsReachedGpu": len(gpu_depth),
                       "bfsReachedCountMatch": len(cpu_depth) == len(gpu_depth)},
        "timingSeconds": {"cpuNetworkX": cpu_seconds, "gpuCuGraphIncludingTransfer": gpu_seconds},
        "gpuMemoryBytes": {"freeBefore": int(device_before[0]), "totalBefore": int(device_before[1]),
                           "freeAfter": int(device_after[0]), "totalAfter": int(device_after[1])},
        "outputs": {"cpuTop10": cpu_order[:10], "gpuTop10": gpu_order[:10]},
        "limitations": ["Exact directory containment topology only; no semantic relevance or authority.",
                        "Advisory parity only; directory ordinals are not canonical source identities or candidate ordinals."],
    }
    output["receiptSha256"] = sha256(canonical_json(output))
    with (output_dir / "receipt.json").open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(output, indent=2) + "\n")
    output["receiptPath"] = str((output_dir / "receipt.json").relative_to(repo)).replace(os.sep, "/")
    print(json.dumps(output, indent=2))
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--cpu-receipt", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--root-ordinal", type=int)
    parser.add_argument("--bfs-depth", type=int, default=3)
    parser.add_argument("--alpha", type=float, default=0.85)
    parser.add_argument("--tolerance", type=float, default=1e-8)
    parser.add_argument("--max-iter", type=int, default=100)
    parser.add_argument("--max-abs-error", type=float, default=1e-5)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--minimum-top-k-overlap", type=float, default=0.8)
    args = parser.parse_args()
    if not args.run_id or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789-" for char in args.run_id):
        parser.error("invalid run-id")
    if args.bfs_depth < 0 or (args.root_ordinal is not None and args.root_ordinal < 0) or not 0.0 < args.alpha < 1.0 or args.tolerance <= 0 or args.max_iter < 1 or args.max_abs_error <= 0 or args.top_k < 1 or not 0.0 <= args.minimum_top_k_overlap <= 1.0:
        parser.error("invalid algorithm bounds")
    result = run(args)
    return 0 if result["status"] == "CU_GRAPH_PAGERANK_BFS_PARITY_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
