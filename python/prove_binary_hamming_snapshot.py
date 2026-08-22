#!/usr/bin/env python3
"""Prove binary-Hamming retrieval quality on one FrozenSemanticSnapshotV2.

This is a bounded challenger-stage proof. It reuses the frozen semantic tensor,
the existing PyTorch exact semantic oracle, and the existing cuVS binary
quantizer. It performs no database, Qdrant, Neo4j, or Valkey writes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.binary_hamming import evaluate_binary_hamming_retrieval, spread_query_ordinals
from atlas_compute.cuvs_analytics import run_cuvs_binary_quantization
from atlas_compute.exact_semantic import exact_semantic_search
from atlas_compute.semantic_snapshot_freeze import load_and_verify_frozen_snapshot


def stable_checksum(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--semantic-manifest", required=True)
    parser.add_argument("--output", default="reports/binary-hamming-snapshot-proof.json")
    parser.add_argument("--metric", choices=["cosine", "inner_product", "sqeuclidean"], default="cosine")
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--query-count", type=int, default=32)
    parser.add_argument("--benchmark-repeats", type=int, default=3)
    parser.add_argument("--torch-device", default="cpu")
    args = parser.parse_args()

    semantic, manifest = load_and_verify_frozen_snapshot(Path(args.semantic_manifest).resolve())
    canonical_ids = [str(row["canonical_id"]) for row in manifest["rows"]]
    if not canonical_ids:
        raise ValueError("frozen semantic snapshot has no canonical rows")
    if not 1 <= args.k < len(canonical_ids):
        raise ValueError("k must be >=1 and smaller than frozen row count")
    query_count = min(max(1, args.query_count), len(canonical_ids))
    query_ordinals = spread_query_ordinals(len(canonical_ids), query_count)
    query_selection_checksum = stable_checksum(query_ordinals)
    queries = semantic[query_ordinals]

    exact = exact_semantic_search(
        semantic,
        queries,
        canonical_ids,
        metric=args.metric,
        top_k=min(args.k + 1, len(canonical_ids)),
        device=args.torch_device,
    )
    reference_ordinals: list[list[int]] = []
    for query_index, hits in enumerate(exact.hits):
        self_ordinal = query_ordinals[query_index]
        ranking = [int(hit.ordinal) for hit in hits if int(hit.ordinal) != self_ordinal][: args.k]
        if len(ranking) != args.k:
            raise RuntimeError("semantic exact oracle did not produce enough non-self hits")
        reference_ordinals.append(ranking)

    encoded, quantization = run_cuvs_binary_quantization(semantic)
    hamming = evaluate_binary_hamming_retrieval(
        encoded,
        query_ordinals,
        reference_ordinals,
        top_k=args.k,
        benchmark_repeats=args.benchmark_repeats,
    )

    payload = {
        "schema": "atlas.binary-hamming-snapshot-proof.v1",
        "semantic_snapshot_revision": str(manifest["snapshot_revision"]),
        "representation_revision": str(manifest["representation_revision"]),
        "semantic_tensor_checksum": str(manifest["tensor_checksum"]),
        "semantic_row_identity_checksum": str(manifest["row_identity_checksum"]),
        "semantic_canonical_order_checksum": str(manifest.get("canonical_order_checksum") or ""),
        "metric": args.metric,
        "k": args.k,
        "query_selection": "DETERMINISTIC_CORPUS_SPREAD_V1",
        "query_selection_checksum": query_selection_checksum,
        "query_ordinals": query_ordinals,
        "query_canonical_ids": [canonical_ids[value] for value in query_ordinals],
        "semantic_exact_result_checksum": exact.result_checksum,
        "binary_quantization": quantization.to_dict(),
        "binary_hamming_retrieval": hamming.to_dict(),
        "databaseWritesAttempted": False,
        "qdrantWritesAttempted": False,
        "neo4jWritesAttempted": False,
        "valkeyWritesAttempted": False,
        "canonicalWritesAllowed": False,
        "canonical_authority": False,
    }
    result = {
        **payload,
        "proof_checksum": stable_checksum(payload),
        "status": "BINARY_HAMMING_SNAPSHOT_MEASURED",
    }
    target = Path(args.output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
