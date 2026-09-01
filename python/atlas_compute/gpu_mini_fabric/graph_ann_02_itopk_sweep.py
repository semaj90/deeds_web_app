#!/usr/bin/env python
"""GPU-GRAPH-ANN-02 -- itopk_size sweep at the N=65536 crossover boundary.

Per NVIDIA's own CAGRA tuning guidance, itopk_size is the primary
accuracy/throughput knob and should be tuned before graph_degree or
intermediate_graph_degree. This sweep deliberately holds graph construction
(build_algo="ivf_pq", graph_degree, intermediate_graph_degree) fixed at
CAGRA's defaults and only varies itopk_size, isolating the search-side knob
from the build-side ones per that guidance.

Same frozen Gaussian-64 fixture as GPU-GRAPH-ANN-01's N=65536 tier (same
seed -> same corpus/queries), so results are directly comparable to that
run's default itopk_size=64 result (recall@16=0.8289).

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.graph_ann_02_itopk_sweep
"""

from __future__ import annotations

import json
import subprocess
import threading
import time
from pathlib import Path

import cupy as cp
import numpy as np
import torch
from cuvs.neighbors import cagra

from atlas_compute.gpu_mini_fabric.graph_ann_fixture import generate_graph_ann_fixture_v1

N = 65536
ITOPK_SIZES = [64, 128, 256, 512]
WARMUP_QUERIES = 16

OUT_PATH = Path(
    "/mnt/c/Users/james/Videos/deeds-web-app/docs/reports/gpu-mini-fabric-01-graph-ann-02-itopk-sweep.json"
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


class _PeakVramSampler:
    """Polls nvidia-smi used-memory at a short interval to approximate peak
    usage during a build+search window (cupy's pool stats undercount driver-
    level allocation from cuVS's own internal workspace)."""

    def __init__(self, interval_s: float = 0.02):
        self.interval_s = interval_s
        self._peak_used_mib = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.is_set():
            v = _vram_mib()
            if "used_mib" in v:
                self._peak_used_mib = max(self._peak_used_mib, v["used_mib"])
            time.sleep(self.interval_s)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=2)

    @property
    def peak_used_mib(self) -> int:
        return self._peak_used_mib


def _exact_oracle(vectors: np.ndarray, queries: np.ndarray, k: int) -> np.ndarray:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    corpus_t = torch.nn.functional.normalize(torch.from_numpy(vectors).to(device), p=2, dim=1)
    queries_t = torch.nn.functional.normalize(torch.from_numpy(queries).to(device), p=2, dim=1)
    scores = torch.mm(queries_t, corpus_t.t())
    _scores, topk_idx = torch.topk(scores, k=k, dim=1)
    if device == "cuda":
        torch.cuda.synchronize()
    return topk_idx.cpu().numpy()


def _run_itopk(itopk_size: int, index, oracle_idx: np.ndarray, queries_gpu: cp.ndarray, k: int, num_queries: int) -> dict:
    search_params = cagra.SearchParams(itopk_size=itopk_size)

    # Warmup (not timed) -- lets CUDA context/kernels JIT-settle before timing.
    warm_q = queries_gpu[:WARMUP_QUERIES]
    _d, _n = cagra.search(search_params, index, warm_q, k)
    cp.cuda.Stream.null.synchronize()

    pre_vram = _vram_mib()

    per_query_ms = []
    all_neighbors = np.zeros((num_queries, k), dtype=np.int64)
    with _PeakVramSampler() as sampler:
        t_total0 = time.perf_counter()
        for qi in range(num_queries):
            q = queries_gpu[qi : qi + 1]
            start = cp.cuda.Event()
            end = cp.cuda.Event()
            start.record()
            distances, neighbors = cagra.search(search_params, index, q, k)
            end.record()
            end.synchronize()
            elapsed_ms = cp.cuda.get_elapsed_time(start, end)
            per_query_ms.append(elapsed_ms)
            all_neighbors[qi] = cp.asnumpy(neighbors)[0]
        total_ms = (time.perf_counter() - t_total0) * 1000
        peak_used_mib = sampler.peak_used_mib

    post_vram = _vram_mib()

    recalls_1, recalls_8, recalls_16, rank_overlaps = [], [], [], []
    for qi in range(num_queries):
        oracle_set_1 = set(oracle_idx[qi][:1].tolist())
        oracle_set_8 = set(oracle_idx[qi][:8].tolist())
        oracle_set_16 = set(oracle_idx[qi][:16].tolist())
        cagra_row = all_neighbors[qi]
        cagra_set_1 = set(cagra_row[:1].tolist())
        cagra_set_8 = set(cagra_row[:8].tolist())
        cagra_set_16 = set(cagra_row[:16].tolist())
        recalls_1.append(len(oracle_set_1 & cagra_set_1) / 1)
        recalls_8.append(len(oracle_set_8 & cagra_set_8) / 8)
        recalls_16.append(len(oracle_set_16 & cagra_set_16) / 16)
        rank_overlaps.append(len(oracle_set_16 & cagra_set_16) / 16)

    per_query_ms_sorted = sorted(per_query_ms)
    p50 = per_query_ms_sorted[len(per_query_ms_sorted) // 2]
    p95 = per_query_ms_sorted[int(len(per_query_ms_sorted) * 0.95)]
    qps = num_queries / (total_ms / 1000.0)

    return {
        "itopk_size": itopk_size,
        "recall_at_1": round(float(np.mean(recalls_1)), 6),
        "recall_at_8": round(float(np.mean(recalls_8)), 6),
        "recall_at_16": round(float(np.mean(recalls_16)), 6),
        "worst_query_recall_at_16": round(float(np.min(recalls_16)), 6),
        "mean_rank_overlap": round(float(np.mean(rank_overlaps)), 6),
        "timing": {
            "total_ms": round(total_ms, 3),
            "p50_ms": round(p50, 5),
            "p95_ms": round(p95, 5),
            "qps": round(qps, 2),
        },
        "vram": {
            "pre_free_mib": pre_vram.get("free_mib"),
            "post_free_mib": post_vram.get("free_mib"),
            "peak_used_mib_sampled": peak_used_mib,
        },
    }


def main() -> None:
    fixture = generate_graph_ann_fixture_v1(N)
    vectors = fixture.vectors
    queries = vectors[fixture.query_indices]

    oracle_idx = _exact_oracle(vectors, queries, fixture.k)

    vectors_gpu = cp.asarray(vectors)
    queries_gpu = cp.asarray(queries)

    # Graph construction held fixed (default build_algo="ivf_pq") across the
    # entire sweep -- only itopk_size varies, per NVIDIA's own tuning guidance
    # to tune the search knob before the build knobs.
    build_params = cagra.IndexParams(metric="cosine")
    t0 = time.perf_counter()
    index = cagra.build(build_params, vectors_gpu)
    cp.cuda.Stream.null.synchronize()
    build_ms = (time.perf_counter() - t0) * 1000

    sweep_results = []
    for itopk_size in ITOPK_SIZES:
        r = _run_itopk(itopk_size, index, oracle_idx, queries_gpu, fixture.k, fixture.num_queries)
        sweep_results.append(r)
        print(
            f"itopk_size={itopk_size}: recall@16={r['recall_at_16']} worst={r['worst_query_recall_at_16']} "
            f"p50={r['timing']['p50_ms']}ms p95={r['timing']['p95_ms']}ms qps={r['timing']['qps']}"
        )

    baseline_recall_at_16 = 0.8289  # GPU-GRAPH-ANN-01's default itopk_size=64 result, for comparison
    winning = max(sweep_results, key=lambda r: r["recall_at_16"])

    report = {
        "schema": "atlas.gpu-mini-fabric.graph-ann-02-itopk-sweep-result.v1",
        "test": "GPU-GRAPH-ANN-02",
        "phase": "B2",
        "read_only": True,
        "canonical_production_data_touched": False,
        "n": N,
        "fixture": fixture.to_manifest_dict(),
        "build_ms_shared_across_sweep": round(build_ms, 3),
        "graph_construction_held_fixed": "build_algo=ivf_pq (default), graph_degree=64 (default), intermediate_graph_degree=128 (default)",
        "sweep": sweep_results,
        "gpu_graph_ann_01_baseline_recall_at_16_itopk64": baseline_recall_at_16,
        "winning_config": {"itopk_size": winning["itopk_size"], "recall_at_16": winning["recall_at_16"]},
        "recall_at_16_ge_0_95_at_any_itopk": any(r["recall_at_16"] >= 0.95 for r in sweep_results),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print("Report:", OUT_PATH)


if __name__ == "__main__":
    main()
