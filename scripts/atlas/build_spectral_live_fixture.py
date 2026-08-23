#!/usr/bin/env python3
"""Build one packet-level Parent Atlas graph fixture from frozen artifacts.

Inputs:
- GRAPH_SNAPSHOT_PARITY nodes.parquet + edges.parquet (structural graph truth)
- deterministic semantic_768 5k packet snapshot parquet (semantic geometry)

The semantic snapshot defines candidate packets. Existing typed graph edges are
projected through each endpoint's real packet_key onto packet-level vertices;
this is a benchmark projection, not a new canonical relationship. Exact cuVS
all-neighbors adds SEMANTIC_KNN edges as derived similarity evidence.

Outputs are another frozen nodes.parquet / edges.parquet pair suitable for
`scripts/atlas/run_fabric_benchmark.py --mode spectral_live_fixture`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from importlib.metadata import PackageNotFoundError, version as package_version

import numpy as np
import pandas as pd
import pyarrow.parquet as pq


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_version_or_unknown(name: str) -> str:
    try:
        return package_version(name)
    except PackageNotFoundError:
        return "UNKNOWN"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Parent Atlas spectral live fixture")
    parser.add_argument("--graph-nodes", required=True)
    parser.add_argument("--graph-edges", required=True)
    parser.add_argument("--semantic-vectors", required=True, help="vector-snapshot-5k-768.parquet")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--limit", type=int, default=5000)
    parser.add_argument("--semantic-top-k", type=int, default=10)
    parser.add_argument("--semantic-weight", type=float, default=1.0)
    parser.add_argument("--edge-type", action="append", default=[], help="Optional structural edge allowlist")
    parser.add_argument(
        "--collapse-undirected-pairs",
        action="store_true",
        help="Derived diagnostic mode: sum all edge families into one undirected pair",
    )
    args = parser.parse_args()
    if args.limit < 500:
        raise ValueError("fixture limit must be >= 500")
    if args.semantic_top_k <= 0:
        raise ValueError("semantic-top-k must be positive")
    if not np.isfinite(args.semantic_weight) or args.semantic_weight < 0:
        raise ValueError("semantic-weight must be finite and nonnegative")
    return args


def load_semantic_snapshot(path: str, limit: int):
    table = pq.read_table(path, columns=["packet_key", "source_ref", "semantic_embedding_768", "representation_id"])
    frame = table.to_pandas()
    frame = frame.sort_values("packet_key").drop_duplicates("packet_key", keep="first").head(limit).reset_index(drop=True)
    if len(frame) < 500:
        raise ValueError(f"semantic snapshot has only {len(frame)} unique packet keys")
    if not (frame["representation_id"].fillna("semantic_768") == "semantic_768").all():
        raise ValueError("semantic vector snapshot contains a non-semantic_768 representation")

    vectors = np.stack([
        np.asarray(value, dtype=np.float32)
        for value in frame["semantic_embedding_768"].tolist()
    ])
    if vectors.ndim != 2 or vectors.shape[1] != 768:
        raise ValueError(f"expected semantic matrix [N,768], got {vectors.shape}")
    if not np.isfinite(vectors).all():
        raise ValueError("semantic matrix contains non-finite values")
    norms = np.linalg.norm(vectors, axis=1)
    if np.any(norms <= 0):
        raise ValueError("semantic matrix contains zero-norm rows")
    # Canonical snapshot is expected to be normalized, but normalize again only
    # for this derived cosine graph and record that operation in the manifest.
    vectors = vectors / norms[:, None]
    return frame, vectors


def project_structural_edges(graph_nodes_path: str, graph_edges_path: str, packet_to_fixture: dict[str, int], edge_allowlist: list[str]):
    nodes = pd.read_parquet(graph_nodes_path, columns=["gpu_node_id", "packet_key"])
    nodes = nodes[nodes["packet_key"].notna()].copy()
    nodes["packet_key"] = nodes["packet_key"].astype(str)
    nodes = nodes[nodes["packet_key"].isin(packet_to_fixture.keys())]
    id_to_packet = nodes.drop_duplicates("gpu_node_id").set_index("gpu_node_id")["packet_key"]

    edges = pd.read_parquet(graph_edges_path, columns=["src_gpu_node_id", "dst_gpu_node_id", "edge_type", "weight"])
    if edge_allowlist:
        edges = edges[edges["edge_type"].isin(edge_allowlist)]
    edges = edges[edges["src_gpu_node_id"].isin(id_to_packet.index) & edges["dst_gpu_node_id"].isin(id_to_packet.index)].copy()
    edges["src_packet_key"] = edges["src_gpu_node_id"].map(id_to_packet)
    edges["dst_packet_key"] = edges["dst_gpu_node_id"].map(id_to_packet)
    edges = edges[edges["src_packet_key"] != edges["dst_packet_key"]]
    edges["src_gpu_node_id"] = edges["src_packet_key"].map(packet_to_fixture).astype(np.int64)
    edges["dst_gpu_node_id"] = edges["dst_packet_key"].map(packet_to_fixture).astype(np.int64)
    edges["weight"] = edges["weight"].astype(float)
    edges = edges[np.isfinite(edges["weight"]) & (edges["weight"] >= 0)]

    grouped = (
        edges.groupby(["src_gpu_node_id", "dst_gpu_node_id", "edge_type"], as_index=False)["weight"]
        .sum()
        .sort_values(["src_gpu_node_id", "dst_gpu_node_id", "edge_type"])
    )
    return grouped


def build_semantic_knn(vectors: np.ndarray, top_k: int, weight_multiplier: float):
    try:
        import cupy as cp
        from cuvs.neighbors import all_neighbors
    except ImportError as error:
        raise RuntimeError(f"cuVS semantic KNN requires CuPy + cuVS: {error}") from error

    n = vectors.shape[0]
    k_with_self = min(top_k + 1, n)
    dataset = cp.asarray(vectors, dtype=cp.float32)
    indices = cp.empty((n, k_with_self), dtype=cp.int64)
    distances = cp.empty((n, k_with_self), dtype=cp.float32)
    params = all_neighbors.AllNeighborsParams(algo="brute_force", metric="cosine")
    started = time.perf_counter()
    all_neighbors.build(
        dataset,
        k_with_self,
        params,
        indices=indices,
        distances=distances,
    )
    cp.cuda.runtime.deviceSynchronize()
    latency_ms = (time.perf_counter() - started) * 1000.0
    indices_h = cp.asnumpy(indices)
    distances_h = cp.asnumpy(distances)

    rows = []
    for src in range(n):
        emitted = 0
        for neighbor, distance in zip(indices_h[src], distances_h[src]):
            dst = int(neighbor)
            if dst == src:
                continue
            similarity = max(0.0, 1.0 - float(distance))
            rows.append({
                "src_gpu_node_id": src,
                "dst_gpu_node_id": dst,
                "edge_type": "SEMANTIC_KNN",
                "weight": similarity * weight_multiplier,
            })
            emitted += 1
            if emitted >= top_k:
                break
    return pd.DataFrame(rows), latency_ms


def main() -> None:
    args = parse_args()
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    os.makedirs(args.out_dir, exist_ok=True)

    semantic, vectors = load_semantic_snapshot(args.semantic_vectors, args.limit)
    semantic = semantic.reset_index(drop=True)
    semantic["gpu_node_id"] = np.arange(len(semantic), dtype=np.int64)
    packet_to_fixture = {str(row.packet_key): int(row.gpu_node_id) for row in semantic.itertuples(index=False)}

    structural_edges = project_structural_edges(
        args.graph_nodes,
        args.graph_edges,
        packet_to_fixture,
        args.edge_type,
    )
    semantic_edges, semantic_knn_latency_ms = build_semantic_knn(vectors, args.semantic_top_k, args.semantic_weight)

    all_edges = pd.concat([structural_edges, semantic_edges], ignore_index=True)
    all_edges = (
        all_edges.groupby(["src_gpu_node_id", "dst_gpu_node_id", "edge_type"], as_index=False)["weight"]
        .sum()
        .sort_values(["src_gpu_node_id", "dst_gpu_node_id", "edge_type"])
        .reset_index(drop=True)
    )
    if args.collapse_undirected_pairs:
        all_edges["src_gpu_node_id"], all_edges["dst_gpu_node_id"] = (
            np.minimum(all_edges["src_gpu_node_id"], all_edges["dst_gpu_node_id"]),
            np.maximum(all_edges["src_gpu_node_id"], all_edges["dst_gpu_node_id"]),
        )
        all_edges = (
            all_edges.groupby(["src_gpu_node_id", "dst_gpu_node_id"], as_index=False)["weight"]
            .sum()
            .assign(edge_type="COALESCED_UNDIRECTED")
            .sort_values(["src_gpu_node_id", "dst_gpu_node_id"])
            .reset_index(drop=True)
        )

    nodes_out = pd.DataFrame({
        "gpu_node_id": semantic["gpu_node_id"].astype(np.int64),
        "graph_node_key": [f"packet:{value}" for value in semantic["packet_key"].astype(str)],
        "node_kind": "PACKET_SPECTRAL_FIXTURE",
        "source_ref": semantic["source_ref"].where(semantic["source_ref"].notna(), None),
        "source_revision": None,
        "packet_key": semantic["packet_key"].astype(str),
        "symbol_id": None,
        "symbol_version_id": None,
    })

    nodes_path = os.path.join(args.out_dir, "nodes.parquet")
    edges_path = os.path.join(args.out_dir, "edges.parquet")
    manifest_path = os.path.join(args.out_dir, "fixture-manifest.json")
    nodes_out.to_parquet(nodes_path, index=False, compression="zstd")
    all_edges.to_parquet(edges_path, index=False, compression="zstd")

    edge_counts = {str(k): int(v) for k, v in all_edges.groupby("edge_type").size().to_dict().items()}
    input_hashes = {
        "graph_nodes_sha256": sha256_file(args.graph_nodes),
        "graph_edges_sha256": sha256_file(args.graph_edges),
        "semantic_vectors_sha256": sha256_file(args.semantic_vectors),
    }
    completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    manifest = {
        "schema": "atlas.spectral-live-fixture-input.v1",
        "status": "BUILT_UNPROVEN",
        "started_at": started_at,
        "completed_at": completed_at,
        "candidate_count": len(nodes_out),
        "structural_edge_count": int(len(structural_edges)),
        "semantic_knn_edge_count": int(len(semantic_edges)),
        "edge_count": int(len(all_edges)),
        "edge_family_counts": edge_counts,
        "semantic": {
            "representation_id": "semantic_768",
            "dimension": 768,
            "top_k": args.semantic_top_k,
            "algorithm": "CUVS_ALL_NEIGHBORS_BRUTE_FORCE",
            "metric": "cosine",
            "weight": args.semantic_weight,
            "derived_similarity": True,
            "canonical_fact": False,
            "l2_renormalized_for_fixture": True,
            "latency_ms": semantic_knn_latency_ms,
        },
        "structural_projection": {
            "method": "GRAPH_ENDPOINT_PACKET_KEY_PROJECTION",
            "canonical_authority": False,
            "preserves_source_edge_type": True,
            "edge_type_allowlist": sorted(args.edge_type),
        },
        "duplicate_policy": {
            "collapse_undirected_pairs": bool(args.collapse_undirected_pairs),
            "reduction": "SUM_BY_UNDIRECTED_PAIR" if args.collapse_undirected_pairs else "BY_EDGE_FAMILY",
        },
        "input_hashes": input_hashes,
        "runtime": {
            "cuvs": package_version_or_unknown("cuvs-cu13"),
            "cupy": package_version_or_unknown("cupy-cuda13x"),
            "pandas": package_version_or_unknown("pandas"),
            "pyarrow": package_version_or_unknown("pyarrow"),
        },
        "outputs": {
            "nodes": os.path.abspath(nodes_path),
            "edges": os.path.abspath(edges_path),
        },
    }
    manifest["fixture_hash"] = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)

    print(json.dumps({
        "status": manifest["status"],
        "candidate_count": manifest["candidate_count"],
        "edge_count": manifest["edge_count"],
        "semantic_knn_edge_count": manifest["semantic_knn_edge_count"],
        "fixture_hash": manifest["fixture_hash"],
        "manifest": os.path.abspath(manifest_path),
    }, indent=2))


if __name__ == "__main__":
    main()
