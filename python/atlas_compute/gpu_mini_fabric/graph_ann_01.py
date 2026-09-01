#!/usr/bin/env python
"""GPU-GRAPH-ANN-01 -- Phase B of GPU-MINI-FABRIC-01.

CAGRA (cuVS's GPU-native graph ANN) vs the PyTorch exact-GEMM oracle, at
16K -> 64K -> 256K -> 1M nodes, advancing to the next tier only after the
current tier passes (or halting on a real GPU OOM, which is recorded as a
distinct honest status, not silently downgraded to a correctness FAIL).

Deliberately uses CAGRA's default build_algo ("ivf_pq"), never NVIDIA's own
"ace" build_algo option (Augmented Core Extraction, for datasets too large
for GPU memory) -- unrelated to this repo's Atlas ACE context system, and
irrelevant at these fixture sizes anyway. See root CLAUDE.md's ACE naming
collision note.

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.graph_ann_01
"""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import cupy as cp
import numpy as np
import torch
from cuvs.neighbors import cagra

from atlas_compute.gpu_mini_fabric.graph_ann_fixture import (
    TIER_SIZES,
    generate_graph_ann_fixture_v1,
)

OUT_PATH = Path(
    "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-graph-ann-01.json"
)

RECALL_AT_16_THRESHOLD = 0.95
RECALL_AT_1_THRESHOLD = 0.90


def _free_vram_mib() -> dict:
    """Query the driver directly (not just cupy's pool) for real headroom."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        used, total, free = (int(x.strip()) for x in out.stdout.strip().split(","))
        return {"used_mib": used, "total_mib": total, "free_mib": free}
    except Exception as exc:  # pragma: no cover -- diagnostic only
        return {"error": str(exc)}


def _exact_oracle(vectors: np.ndarray, queries: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    corpus_t = torch.nn.functional.normalize(torch.from_numpy(vectors).to(device), p=2, dim=1)
    queries_t = torch.nn.functional.normalize(torch.from_numpy(queries).to(device), p=2, dim=1)
    scores = torch.mm(queries_t, corpus_t.t())
    topk_scores, topk_idx = torch.topk(scores, k=k, dim=1)
    if device == "cuda":
        torch.cuda.synchronize()
    return topk_idx.cpu().numpy(), topk_scores.cpu().numpy()


def _run_tier(n: int) -> dict:
    pre_vram = _free_vram_mib()
    fixture = generate_graph_ann_fixture_v1(n)
    vectors = fixture.vectors
    queries = vectors[fixture.query_indices]

    try:
        oracle_idx, _oracle_scores = _exact_oracle(vectors, queries, fixture.k)

        vectors_gpu = cp.asarray(vectors)
        queries_gpu = cp.asarray(queries)

        build_params = cagra.IndexParams(metric="cosine")  # default build_algo="ivf_pq", never NVIDIA's "ace"
        t0 = time.perf_counter()
        index = cagra.build(build_params, vectors_gpu)
        cp.cuda.Stream.null.synchronize()
        build_ms = (time.perf_counter() - t0) * 1000

        search_params = cagra.SearchParams()
        t0 = time.perf_counter()
        cagra_distances, cagra_neighbors = cagra.search(search_params, index, queries_gpu, fixture.k)
        cp.cuda.Stream.null.synchronize()
        search_ms = (time.perf_counter() - t0) * 1000

        cagra_neighbors_np = cp.asnumpy(cagra_neighbors).astype(np.int64, copy=False)
    except cp.cuda.memory.OutOfMemoryError as exc:
        return {
            "n": n,
            "status": "OOM_BLOCKED",
            "pre_run_free_vram": pre_vram,
            "error": str(exc),
        }

    post_vram = _free_vram_mib()

    recalls_1, recalls_8, recalls_16 = [], [], []
    for qi in range(fixture.num_queries):
        oracle_set_1 = set(oracle_idx[qi][:1].tolist())
        oracle_set_8 = set(oracle_idx[qi][:8].tolist())
        oracle_set_16 = set(oracle_idx[qi][:16].tolist())
        cagra_set_1 = set(cagra_neighbors_np[qi][:1].tolist())
        cagra_set_8 = set(cagra_neighbors_np[qi][:8].tolist())
        cagra_set_16 = set(cagra_neighbors_np[qi][:16].tolist())

        recalls_1.append(len(oracle_set_1 & cagra_set_1) / 1)
        recalls_8.append(len(oracle_set_8 & cagra_set_8) / 8)
        recalls_16.append(len(oracle_set_16 & cagra_set_16) / 16)

    result = {
        "n": n,
        "status": "COMPLETED",
        "pre_run_free_vram": pre_vram,
        "post_run_free_vram": post_vram,
        "vram_delta_mib": pre_vram.get("free_mib", 0) - post_vram.get("free_mib", 0)
        if "free_mib" in pre_vram and "free_mib" in post_vram
        else None,
        "build_ms": round(build_ms, 3),
        "search_ms_total": round(search_ms, 3),
        "search_ms_per_query": round(search_ms / fixture.num_queries, 5),
        "recall_at_1": round(float(np.mean(recalls_1)), 6),
        "recall_at_8": round(float(np.mean(recalls_8)), 6),
        "recall_at_16": round(float(np.mean(recalls_16)), 6),
        "min_recall_at_16": round(float(np.min(recalls_16)), 6),
        "gate": {
            "recall_at_16_ge_threshold": float(np.mean(recalls_16)) >= RECALL_AT_16_THRESHOLD,
            "recall_at_1_ge_threshold": float(np.mean(recalls_1)) >= RECALL_AT_1_THRESHOLD,
        },
    }
    result["gate"]["RESULT"] = (
        "PASS" if result["gate"]["recall_at_16_ge_threshold"] and result["gate"]["recall_at_1_ge_threshold"] else "FAIL"
    )
    return result


def main() -> None:
    tier_results = []
    crossover_boundary_n = None

    for n in TIER_SIZES:
        tier = _run_tier(n)
        tier_results.append(tier)

        if tier["status"] == "OOM_BLOCKED":
            crossover_boundary_n = n
            print(f"N={n}: OOM_BLOCKED -- halting sequence (real GPU memory limit reached on this 8GB card)")
            break
        if tier["gate"]["RESULT"] != "PASS":
            crossover_boundary_n = n
            print(f"N={n}: FAIL (recall_at_16={tier['recall_at_16']}, recall_at_1={tier['recall_at_1']}) -- halting sequence")
            break
        print(f"N={n}: PASS (recall_at_16={tier['recall_at_16']}, recall_at_1={tier['recall_at_1']}, build_ms={tier['build_ms']}, search_ms_total={tier['search_ms_total']})")

    all_passed = all(t.get("gate", {}).get("RESULT") == "PASS" for t in tier_results)

    report = {
        "schema": "atlas.gpu-mini-fabric.graph-ann-01-result.v1",
        "test": "GPU-GRAPH-ANN-01",
        "phase": "B",
        "read_only": True,
        "canonical_production_data_touched": False,
        "oracle": "SEMANTIC-EXACT-PARITY-01 pattern (PyTorch exact GEMM+topk, CUDA)",
        "cagra_build_algo": "ivf_pq (default; NVIDIA's own 'ace' build_algo deliberately not used)",
        "tiers_attempted": [t["n"] for t in tier_results],
        "tiers": tier_results,
        "crossover_boundary_n": crossover_boundary_n,
        "overall_verdict": "DRY_RUN_PROVEN" if all_passed and len(tier_results) == len(TIER_SIZES) else "PARTIAL_PROVEN" if tier_results else "NOT_PROVEN",
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
