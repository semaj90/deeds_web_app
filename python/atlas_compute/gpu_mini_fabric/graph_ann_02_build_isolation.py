#!/usr/bin/env python
"""GPU-GRAPH-ANN-02A / 02B -- controlled build-algorithm isolation.

Correction from an earlier session's shortcut: the itopk_size sweep
(graph_ann_02_itopk_sweep.py) held build_algo="ivf_pq" fixed throughout and
never isolated build quality from search-budget quality. This script does
the controlled comparison that should have come first, per NVIDIA's own
CAGRA guidance (tune itopk_size, THEN graph_degree, THEN
intermediate_graph_degree -- and build_algo is a build-side knob, evaluated
here before any of the search-side sweeping):

  02A: build_algo="ivf_pq"      (CAGRA's default), itopk_size=64 (CAGRA's default)
  02B: build_algo="nn_descent"  (alternate initial graph builder), itopk_size=64

Same frozen N=65536 fixture, same exact oracle, same search params, same
seed as GPU-GRAPH-ANN-01's original N=65536 tier -- the only variable that
changes between 02A and 02B is build_algo, and both are captured with a
CagraBuildReceiptV1 (freeVramBefore, peakVram, buildAlgo,
internalBatchReductionObserved, graphDegree, intermediateGraphDegree,
buildTime, graphChecksum) so the original 0.829 recall result becomes
attributable to a concrete, reproducible execution condition instead of
being explained away as "Gaussian fixture difficulty".

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.graph_ann_02_build_isolation
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import cupy as cp
import numpy as np
import torch
from cuvs.neighbors import cagra

from atlas_compute.gpu_mini_fabric.graph_ann_fixture import generate_graph_ann_fixture_v1

N = 65536

OUT_PATH = Path(
    "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-graph-ann-02-build-isolation.json"
)


def _vram_mib() -> dict:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        used, total, free = (int(x.strip()) for x in out.stdout.strip().split(","))
        return {"used_mib": used, "total_mib": total, "free_mib": free}
    except Exception as exc:  # pragma: no cover
        return {"error": str(exc)}


def _exact_oracle(vectors: np.ndarray, queries: np.ndarray, k: int) -> np.ndarray:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    corpus_t = torch.nn.functional.normalize(torch.from_numpy(vectors).to(device), p=2, dim=1)
    queries_t = torch.nn.functional.normalize(torch.from_numpy(queries).to(device), p=2, dim=1)
    scores = torch.mm(queries_t, corpus_t.t())
    _s, topk_idx = torch.topk(scores, k=k, dim=1)
    if device == "cuda":
        torch.cuda.synchronize()
    return topk_idx.cpu().numpy()


def _run_build_config(build_algo: str, vectors_gpu: cp.ndarray, queries_gpu: cp.ndarray, oracle_idx: np.ndarray, k: int, num_queries: int) -> dict:
    free_vram_before = _vram_mib()

    build_kwargs = {"metric": "cosine", "build_algo": build_algo}
    build_params = cagra.IndexParams(**build_kwargs)

    # Capture cuVS's own native log line about internal batch size reduction --
    # this is the concrete signal the original hypothesis was based on. cuVS's
    # C++ logger writes directly to the OS-level fd 2, bypassing Python's
    # sys.stderr object, so this redirects the real file descriptor, not just
    # contextlib.redirect_stderr (which would silently capture nothing here).
    log_fd_path = tempfile.mktemp(suffix=".cagra-build.log")
    stderr_fd = os.dup(2)
    log_fd = os.open(log_fd_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
    os.dup2(log_fd, 2)
    try:
        t0 = time.perf_counter()
        index = cagra.build(build_params, vectors_gpu)
        cp.cuda.Stream.null.synchronize()
        build_ms = (time.perf_counter() - t0) * 1000
    finally:
        os.dup2(stderr_fd, 2)
        os.close(stderr_fd)
        os.close(log_fd)

    build_log = Path(log_fd_path).read_text(errors="ignore")
    os.remove(log_fd_path)
    internal_batch_reduction_observed = "reducing IVF-PQ search max_internal_batch_size" in build_log

    peak_vram_during_build = _vram_mib()

    graph_cp = index.graph
    graph_np = cp.asnumpy(graph_cp)
    graph_checksum = hashlib.sha256(np.ascontiguousarray(graph_np).tobytes()).hexdigest()
    graph_degree = int(graph_np.shape[1]) if graph_np.ndim == 2 else None

    search_params = cagra.SearchParams(itopk_size=64)
    t0 = time.perf_counter()
    _distances, neighbors = cagra.search(search_params, index, queries_gpu, k)
    cp.cuda.Stream.null.synchronize()
    search_ms = (time.perf_counter() - t0) * 1000

    neighbors_np = cp.asnumpy(neighbors).astype(np.int64, copy=False)
    post_vram = _vram_mib()

    recalls_1, recalls_16 = [], []
    for qi in range(num_queries):
        o1, o16 = set(oracle_idx[qi][:1]), set(oracle_idx[qi][:16])
        c1, c16 = set(neighbors_np[qi][:1]), set(neighbors_np[qi][:16])
        recalls_1.append(len(o1 & c1) / 1)
        recalls_16.append(len(o16 & c16) / 16)

    return {
        "cagra_build_receipt_v1": {
            "buildAlgo": build_algo,
            "freeVramBeforeMib": free_vram_before.get("free_mib"),
            "peakVramDuringBuildUsedMib": peak_vram_during_build.get("used_mib"),
            "postSearchFreeVramMib": post_vram.get("free_mib"),
            "internalBatchReductionObserved": internal_batch_reduction_observed,
            "buildLogRaw": build_log.strip() or None,
            "graphDegree": graph_degree,
            "intermediateGraphDegree": 128,  # CAGRA default, not overridden
            "buildTimeMs": round(build_ms, 3),
            "graphChecksum": graph_checksum,
        },
        "itopk_size": 64,
        "search_ms_total": round(search_ms, 3),
        "recall_at_1": round(float(np.mean(recalls_1)), 6),
        "recall_at_16": round(float(np.mean(recalls_16)), 6),
        "worst_query_recall_at_16": round(float(np.min(recalls_16)), 6),
    }


def main() -> None:
    fixture = generate_graph_ann_fixture_v1(N)
    vectors = fixture.vectors
    queries = vectors[fixture.query_indices]

    oracle_idx = _exact_oracle(vectors, queries, fixture.k)

    vectors_gpu = cp.asarray(vectors)
    queries_gpu = cp.asarray(queries)

    result_02a = _run_build_config("ivf_pq", vectors_gpu, queries_gpu, oracle_idx, fixture.k, fixture.num_queries)
    print("02A (ivf_pq):", json.dumps(result_02a, indent=2))

    result_02b = _run_build_config("nn_descent", vectors_gpu, queries_gpu, oracle_idx, fixture.k, fixture.num_queries)
    print("02B (nn_descent):", json.dumps(result_02b, indent=2))

    original_ann01_recall_at_16 = 0.8289  # GPU-GRAPH-ANN-01's original N=65536 result, for direct comparison

    report = {
        "schema": "atlas.gpu-mini-fabric.graph-ann-02-build-isolation-result.v1",
        "test": "GPU-GRAPH-ANN-02A/02B",
        "phase": "B2-build-isolation",
        "read_only": True,
        "canonical_production_data_touched": False,
        "n": N,
        "fixture": fixture.to_manifest_dict(),
        "gpu_graph_ann_01_original_recall_at_16": original_ann01_recall_at_16,
        "02a_ivf_pq": result_02a,
        "02b_nn_descent": result_02b,
        "interpretation": {
            "02a_matches_original_ann01_within_tolerance": abs(result_02a["recall_at_16"] - original_ann01_recall_at_16) < 0.02,
            "note": "If 02A's recall_at_16 is close to the original 0.8289 despite different VRAM headroom, the recall drop is NOT primarily VRAM-driven -- likely intrinsic to ivf_pq graph quality at this N/dim on this fixture. If 02A recall is now much higher than 0.8289, VRAM/workspace pressure was a real contributor. Compare 02A vs 02B to see whether nn_descent produces a materially different graph quality at equal itopk_size.",
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
