"""LOWRANK-NORM-01 stage 4: torch-CUDA float32 vs float64 CPU oracle parity on the shared 11-candidate fixture.

Evidence only: no writes, no authority, no quality claim. Needs torch with CUDA; callers must check free VRAM/RAM first.
"""
from __future__ import annotations

import json
import time

import numpy as np

from atlas_compute import lowrank_stage3_compare_v1 as s3
from atlas_compute import lowrank_tile_projection_v1 as lr
from atlas_compute.candidate_concept_tile_v1 import stable_top_k

TOLERANCE = 1e-5
TOP_K = 5


def run_parity(tolerance: float = TOLERANCE) -> dict:
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA_UNAVAILABLE")
    d, x, p = s3.load_fixture()
    ordinals = list(d["candidateOrdinals"])
    w = np.array(d["headWeightsByChannel"])
    b = float(d["headBias"])
    base = b + x @ w
    proj = lr.fit_lowrank_projection(x, p, 6, "stage4-fixture", missing_policy="raw_zero")
    v = np.array(proj.w).T @ (np.array(proj.d) * w)
    oracle = lr.head_scores(lr.project(proj, x, p), v, b)

    dev = torch.device("cuda")
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.cuda.reset_peak_memory_stats()
    t0 = time.perf_counter()
    f32 = lambda a: torch.tensor(np.asarray(a), dtype=torch.float32, device=dev)
    xt, mu, dd, wt, vt = f32(x), f32(proj.mu), f32(proj.d), f32(np.array(proj.w)), f32(v)
    g_base = b + xt @ f32(w)
    g_proj = b + (((xt - mu) / dd) @ wt) @ vt
    torch.cuda.synchronize()
    ms = (time.perf_counter() - t0) * 1000
    g_base = g_base.cpu().numpy().astype(np.float64)
    g_proj = g_proj.cpu().numpy().astype(np.float64)

    res = {
        "schema": "atlas.lowrank-stage4-gpu-parity.v1", "device": torch.cuda.get_device_name(0), "torch": torch.__version__,
        "dtype": "float32", "tf32": False, "tolerance": tolerance, "candidates": len(ordinals),
        "baselineMaxAbsDiff": float(np.abs(g_base - base).max()), "projectedMaxAbsDiff": float(np.abs(g_proj - oracle).max()),
        "baselineTopKMatch": stable_top_k(list(g_base), ordinals, TOP_K) == stable_top_k(list(base), ordinals, TOP_K),
        "projectedTopKMatch": stable_top_k(list(g_proj), ordinals, TOP_K) == stable_top_k(list(oracle), ordinals, TOP_K),
        "peakVramMiB": round(torch.cuda.max_memory_allocated() / 2**20, 2), "wallMsInclFirstLaunch": round(ms, 1),
        "canonicalAuthority": False, "writesPerformed": False, "gpuExecuted": True,
    }
    res["pass"] = bool(res["baselineMaxAbsDiff"] <= tolerance and res["projectedMaxAbsDiff"] <= tolerance
                       and res["baselineTopKMatch"] and res["projectedTopKMatch"])
    return res


if __name__ == "__main__":
    print(json.dumps(run_parity(), indent=1))
