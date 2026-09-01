#!/usr/bin/env python
"""GPU-GRAPH-ANN-03 -- CAGRA on the real semantic_768 distribution.

Frozen, read-only export of codebase_chunk_index.content_embedding (see
export_semantic_768_fixture.py) -- 55,169 real rows (all currently populated;
NOT padded/truncated to an arbitrary round number like 65,536). Compares
cuVS brute-force exact oracle vs CAGRA default (itopk_size=64) vs the
GPU-GRAPH-ANN-02 winning config (itopk_size=512) on this real corpus, to
check whether the Gaussian-64 fixture's recall crossover behavior
(GPU-GRAPH-ANN-01/02) generalizes to Parent Atlas's actual embedding
distribution or was specific to unstructured synthetic noise.

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.graph_ann_03_semantic_768
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import cupy as cp
import numpy as np
import torch
from cuvs.neighbors import cagra

from atlas_compute.cuvs_analytics import run_cuvs_exact_knn

FIXTURE_DIR = Path("/mnt/c/Users/james/Videos/deeds-web-app/python/atlas_compute/gpu_mini_fabric/fixtures")
VECTORS_PATH = FIXTURE_DIR / "semantic-768-real-frozen.f32.bin"
NODE_KEYS_PATH = FIXTURE_DIR / "semantic-768-real-frozen-node-keys.json"
MANIFEST_PATH = FIXTURE_DIR / "semantic-768-real-frozen-manifest.json"

OUT_PATH = Path(
    "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-graph-ann-03-semantic-768.json"
)

NUM_QUERIES = 256
K = 16
QUERY_SEED = 20260901


def _exact_oracle_pytorch(vectors: np.ndarray, queries: np.ndarray, k: int) -> np.ndarray:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    corpus_t = torch.nn.functional.normalize(torch.from_numpy(vectors).to(device), p=2, dim=1)
    queries_t = torch.nn.functional.normalize(torch.from_numpy(queries).to(device), p=2, dim=1)
    scores = torch.mm(queries_t, corpus_t.t())
    _s, topk_idx = torch.topk(scores, k=k, dim=1)
    if device == "cuda":
        torch.cuda.synchronize()
    return topk_idx.cpu().numpy()


def _cagra_search(vectors_gpu: cp.ndarray, queries_gpu: cp.ndarray, k: int, itopk_size: int) -> tuple[np.ndarray, float, float]:
    build_params = cagra.IndexParams(metric="cosine")
    t0 = time.perf_counter()
    index = cagra.build(build_params, vectors_gpu)
    cp.cuda.Stream.null.synchronize()
    build_ms = (time.perf_counter() - t0) * 1000

    search_params = cagra.SearchParams(itopk_size=itopk_size)
    t0 = time.perf_counter()
    distances, neighbors = cagra.search(search_params, index, queries_gpu, k)
    cp.cuda.Stream.null.synchronize()
    search_ms = (time.perf_counter() - t0) * 1000

    return cp.asnumpy(neighbors).astype(np.int64, copy=False), build_ms, search_ms


def _recall_metrics(oracle_idx: np.ndarray, candidate_idx: np.ndarray, num_queries: int) -> dict:
    recalls_1, recalls_8, recalls_16 = [], [], []
    for qi in range(num_queries):
        o1, o8, o16 = set(oracle_idx[qi][:1]), set(oracle_idx[qi][:8]), set(oracle_idx[qi][:16])
        c1, c8, c16 = set(candidate_idx[qi][:1]), set(candidate_idx[qi][:8]), set(candidate_idx[qi][:16])
        recalls_1.append(len(o1 & c1) / 1)
        recalls_8.append(len(o8 & c8) / 8)
        recalls_16.append(len(o16 & c16) / 16)
    return {
        "recall_at_1": round(float(np.mean(recalls_1)), 6),
        "recall_at_8": round(float(np.mean(recalls_8)), 6),
        "recall_at_16": round(float(np.mean(recalls_16)), 6),
        "worst_query_recall_at_16": round(float(np.min(recalls_16)), 6),
    }


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text())
    n = manifest["num_rows"]
    dim = manifest["dim"]
    node_keys = json.loads(NODE_KEYS_PATH.read_text())
    vectors = np.fromfile(VECTORS_PATH, dtype=np.float32).reshape(n, dim)

    rng = np.random.default_rng(QUERY_SEED)
    query_indices = rng.choice(n, size=NUM_QUERIES, replace=False)
    queries = vectors[query_indices]

    # cuVS brute-force is the exact oracle here (reused canonical wrapper,
    # not a second implementation) -- cross-checked against the PyTorch
    # exact oracle for agreement, same as Phase A's pattern.
    cuvs_oracle_idx, cuvs_oracle_dist, cuvs_receipt = run_cuvs_exact_knn(vectors, queries, top_k=K, metric="cosine")
    pytorch_oracle_idx = _exact_oracle_pytorch(vectors, queries, K)
    oracle_agreement = float(np.mean([
        len(set(cuvs_oracle_idx[qi]) & set(pytorch_oracle_idx[qi])) / K for qi in range(NUM_QUERIES)
    ]))

    vectors_gpu = cp.asarray(vectors)
    queries_gpu = cp.asarray(queries)

    cagra_default_idx, build_ms_default, search_ms_default = _cagra_search(vectors_gpu, queries_gpu, K, itopk_size=64)
    cagra_tuned_idx, build_ms_tuned, search_ms_tuned = _cagra_search(vectors_gpu, queries_gpu, K, itopk_size=512)

    default_metrics = _recall_metrics(cuvs_oracle_idx, cagra_default_idx, NUM_QUERIES)
    tuned_metrics = _recall_metrics(cuvs_oracle_idx, cagra_tuned_idx, NUM_QUERIES)

    report = {
        "schema": "atlas.gpu-mini-fabric.graph-ann-03-semantic-768-result.v1",
        "test": "GPU-GRAPH-ANN-03",
        "phase": "B3",
        "read_only": True,
        "canonical_production_data_touched": True,
        "canonical_production_data_mutated": False,
        "source_manifest": manifest,
        "n": n,
        "dim": dim,
        "num_queries": NUM_QUERIES,
        "k": K,
        "oracle_cross_check": {
            "cuvs_vs_pytorch_agreement": round(oracle_agreement, 6),
            "cuvs_receipt": cuvs_receipt.to_dict(),
        },
        "cagra_itopk_64_default": {
            **default_metrics,
            "build_ms": round(build_ms_default, 3),
            "search_ms_total": round(search_ms_default, 3),
        },
        "cagra_itopk_512_tuned": {
            **tuned_metrics,
            "build_ms": round(build_ms_tuned, 3),
            "search_ms_total": round(search_ms_tuned, 3),
        },
        "gate": {
            "oracle_cross_check_ge_0_999": oracle_agreement >= 0.999,
            "default_recall_at_16_ge_0_95": default_metrics["recall_at_16"] >= 0.95,
            "tuned_recall_at_16_ge_0_95": tuned_metrics["recall_at_16"] >= 0.95,
        },
    }
    report["gate"]["RESULT"] = "PASS" if all(report["gate"].values()) else "PARTIAL"

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
