"""Parent Atlas frozen-tensor compute proof runner.

NPZ input contract:
  corpus: float32 [N,D]              semantic/feature tensor
  queries: float32 [Q,D]
  canonical_ids: unicode/bytes [N]
  association_matrix: optional float32 [A,B]
      Required only for --low-rank. This must be a real association matrix such
      as query-profile×candidate, feature×evidence, or task×candidate. A
      candidate×embedding-coordinate semantic matrix is NOT a recommendation
      interaction matrix.

Optional GPU comparisons run only when requested. This script writes receipts to
stdout and never mutates PostgreSQL/Qdrant/Neo4j/canonical relationships.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, is_dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

from atlas_compute.ann_compare import compare_cuvs_exact_and_cagra
from atlas_compute.exact_semantic import exact_semantic_search
from atlas_compute.low_rank import compare_low_rank_recommendations
from atlas_compute.rapids_matrix import run_cuvs_kmeans, run_cuvs_pca


def encode(value: Any) -> Any:
    if is_dataclass(value):
        return {key: encode(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {str(key): encode(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode(item) for item in value]
    if isinstance(value, np.generic):
        return value.item()
    return value


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--metric", choices=["cosine", "inner_product", "sqeuclidean"], default="cosine")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--run-cagra", action="store_true")
    parser.add_argument("--pca-components", type=int, default=0)
    parser.add_argument("--kmeans-clusters", type=int, default=0)
    parser.add_argument("--low-rank", type=int, default=0)
    parser.add_argument("--low-rank-row", type=int, default=0)
    args = parser.parse_args()

    association_matrix: np.ndarray | None = None
    with np.load(args.snapshot, allow_pickle=False) as data:
        corpus = np.asarray(data["corpus"], dtype=np.float32)
        queries = np.asarray(data["queries"], dtype=np.float32)
        raw_ids = np.asarray(data["canonical_ids"])
        if "association_matrix" in data.files:
            association_matrix = np.asarray(data["association_matrix"], dtype=np.float32)
    canonical_ids = [
        value.decode("utf-8") if isinstance(value, (bytes, np.bytes_)) else str(value)
        for value in raw_ids.tolist()
    ]

    source_checksum = sha256_bytes(np.ascontiguousarray(corpus).tobytes())
    query_checksum = sha256_bytes(np.ascontiguousarray(queries).tobytes())
    proof: dict[str, Any] = {
        "schema": "atlas.compute-proof-bundle.v1",
        "snapshot": str(args.snapshot),
        "source_checksum": source_checksum,
        "query_checksum": query_checksum,
        "metric": args.metric,
        "canonical_authority": False,
        "receipts": {},
    }

    exact = exact_semantic_search(
        corpus,
        queries,
        canonical_ids,
        metric=args.metric,
        top_k=args.top_k,
        device=args.device,
    )
    proof["receipts"]["pytorch_exact"] = encode(exact)

    if args.low_rank > 0:
        if association_matrix is None:
            raise ValueError("--low-rank requires NPZ field association_matrix; semantic embedding coordinates are not recommendation items")
        proof["receipts"]["low_rank"] = encode(compare_low_rank_recommendations(
            association_matrix,
            query_row=args.low_rank_row,
            target_rank=min(args.low_rank, min(association_matrix.shape)),
            top_k=min(args.top_k, association_matrix.shape[1]),
            device=args.device,
        ))
        proof["association_checksum"] = sha256_bytes(np.ascontiguousarray(association_matrix).tobytes())

    if args.run_cagra:
        proof["receipts"]["cuvs_ann"] = encode(compare_cuvs_exact_and_cagra(
            corpus,
            queries,
            metric=args.metric,
            k=args.top_k,
        ))

    if args.pca_components > 0:
        proof["receipts"]["pca"] = encode(run_cuvs_pca(
            corpus,
            n_components=min(args.pca_components, min(corpus.shape)),
        ))

    if args.kmeans_clusters > 0:
        proof["receipts"]["kmeans"] = encode(run_cuvs_kmeans(
            corpus,
            n_clusters=min(args.kmeans_clusters, corpus.shape[0]),
        ))

    serialized = json.dumps(proof, sort_keys=True, separators=(",", ":"), allow_nan=False)
    proof["bundle_checksum"] = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    print(json.dumps(proof, indent=2, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    main()
