#!/usr/bin/env python3
"""Fit a task x helper low-rank recommendation artifact.

This is Tang-inspired only in the systems sense:
- low-rank recommendation matrix
- optional l2 contribution weights (efficient l2-norm sampling importance)

It does NOT claim Ewin Tang's sampling-access assumptions or complexity result
("A quantum-inspired classical algorithm for recommendation systems",
arXiv:1807.04271).

FIXED 2026-09-06 (review before bringing this pack into the repo, per
openspec/changes/parent-atlas-memory-architecture-freeze addendum 9):
- Missing (task, helper) observations are no longer zero-filled. An
  unobserved cell being treated as "this helper has zero utility for this
  task" is a real, materially different claim than "we have not tried this
  combination" — the project's own existing rule is that missing feature
  data is never zero-filled, and this fitter now respects that: a boolean
  observation mask excludes every unobserved cell from every normal-equation
  term in the factorization (masked alternating least squares), rather than
  cuML/numpy's ordinary SVD, which has no concept of "missing" and would
  silently treat a zero-filled cell as a real zero utility observation.
- Factor signs are canonicalized per component (SVD/ALS factors are only
  defined up to a sign flip per component - two runs, or a CPU vs. GPU run,
  can produce numerically-equivalent but sign-flipped factors that would
  falsely look like a determinism regression under a raw-byte checksum).
  The artifact now also carries a `reconstructionChecksum` of the rounded
  reconstructed (task x helper) matrix - what actually matters for replay
  parity - rather than relying on raw factor bytes matching exactly.

Input JSON:
{
  "artifactRevision": "...",
  "rank": 4,
  "rows": [
    {
      "taskFamily": "repair",
      "helperId": "AST_GREP",
      "utility": 0.94,
      "successRate": 0.95,
      "validationRate": 0.90,
      "medianLatencyMs": 24,
      "medianContextTokens": 80
    }
  ]
}
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


def _masked_als(
    matrix: np.ndarray,
    mask: np.ndarray,
    rank: int,
    *,
    iterations: int = 60,
    reg: float = 1e-2,
    seed: int = 0,
    xp: Any = np,
) -> tuple[Any, Any]:
    """Factorize `matrix` as U @ V.T using only cells where `mask` is truthy.

    Unobserved cells never appear in any normal-equation term - this is the
    property that makes "missing" genuinely different from "observed zero".
    Works identically on numpy or cupy arrays via the `xp` module parameter,
    so the same, correct algorithm backs both the CPU and GPU paths (unlike
    ordinary SVD, cuML's TruncatedSVD has no masked/weighted input mode, so
    it cannot express this constraint - ALS can, on either backend).
    """
    rng = np.random.default_rng(seed)
    n_rows, n_cols = matrix.shape
    rank = max(1, min(rank, min(n_rows, n_cols)))

    u_init = rng.normal(scale=0.1, size=(n_rows, rank))
    v_init = rng.normal(scale=0.1, size=(n_cols, rank))
    u = xp.asarray(u_init, dtype=xp.float64)
    v = xp.asarray(v_init, dtype=xp.float64)
    m = xp.asarray(matrix, dtype=xp.float64)
    w = xp.asarray(mask, dtype=xp.float64)
    eye = xp.eye(rank, dtype=xp.float64)

    for _ in range(iterations):
        for i in range(n_rows):
            wi = w[i]
            if float(wi.sum()) == 0.0:
                continue
            vw = v * wi[:, None]
            a = vw.T @ v + reg * eye
            b = vw.T @ m[i]
            u[i] = xp.linalg.solve(a, b)
        for j in range(n_cols):
            wj = w[:, j]
            if float(wj.sum()) == 0.0:
                continue
            uw = u * wj[:, None]
            a = uw.T @ u + reg * eye
            b = uw.T @ m[:, j]
            v[j] = xp.linalg.solve(a, b)

    return u, v


def _canonicalize_signs(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Fix the sign ambiguity per rank component: make the largest-magnitude
    entry of each U column positive, flipping the paired V column to match.
    Without this, U@V.T is unchanged but the raw factor bytes can differ
    between equally-valid solutions (different backend, different ALS
    initialization), which would falsely fail a raw-byte replay check.
    """
    u = u.copy()
    v = v.copy()
    for k in range(u.shape[1]):
        col = u[:, k]
        idx = int(np.argmax(np.abs(col)))
        if col[idx] < 0:
            u[:, k] *= -1.0
            v[:, k] *= -1.0
    return u, v


def _try_gpu_als(matrix: np.ndarray, mask: np.ndarray, rank: int):
    try:
        import cupy as cp

        u, v = _masked_als(matrix, mask, rank, xp=cp)
        return cp.asnumpy(u), cp.asnumpy(v), "CUPY_MASKED_ALS"
    except Exception as exc:
        return None, None, f"GPU_UNAVAILABLE:{type(exc).__name__}"


def _l2_weights(vector: np.ndarray) -> list[float]:
    sq = np.square(vector.astype(np.float64, copy=False))
    total = float(sq.sum())
    if total <= 0:
        return [0.0 for _ in sq]
    return [float(x / total) for x in sq]


def fit(payload: dict[str, Any], prefer_gpu: bool = True) -> dict[str, Any]:
    rows = payload["rows"]
    tasks = sorted({str(r["taskFamily"]) for r in rows})
    helpers = sorted({str(r["helperId"]) for r in rows})
    ti = {v: i for i, v in enumerate(tasks)}
    hi = {v: i for i, v in enumerate(helpers)}

    matrix = np.zeros((len(tasks), len(helpers)), dtype=np.float64)
    mask = np.zeros((len(tasks), len(helpers)), dtype=bool)
    stats: dict[str, dict[str, list[float]]] = {
        helper: {
            "successRate": [],
            "validationRate": [],
            "medianLatencyMs": [],
            "medianContextTokens": [],
        }
        for helper in helpers
    }

    for row in rows:
        t = str(row["taskFamily"])
        h = str(row["helperId"])
        matrix[ti[t], hi[h]] = float(row["utility"])
        mask[ti[t], hi[h]] = True
        for key in stats[h]:
            if key in row:
                stats[h][key].append(float(row[key]))

    observed_pairs = {(str(r["taskFamily"]), str(r["helperId"])) for r in rows}
    rank = int(payload.get("rank", min(4, min(matrix.shape))))

    backend = "GPU_DISABLED"
    task_f = helper_f = None
    if prefer_gpu:
        task_f, helper_f, backend = _try_gpu_als(matrix, mask, rank)

    if task_f is None:
        cpu_backend = "NUMPY_MASKED_ALS"
        task_f, helper_f = _masked_als(matrix, mask, rank, xp=np)
        backend = f"{cpu_backend};fallbackFrom={backend}"

    task_f, helper_f = _canonicalize_signs(task_f, helper_f)
    reconstructed = np.round(task_f @ helper_f.T, 6)

    helper_records = []
    for helper in helpers:
        j = hi[helper]
        s = stats[helper]
        helper_records.append(
            {
                "helperId": helper,
                "factors": [float(x) for x in helper_f[j]],
                "successRate": float(np.mean(s["successRate"])) if s["successRate"] else 0.0,
                "validationRate": float(np.mean(s["validationRate"])) if s["validationRate"] else 0.0,
                "medianLatencyMs": float(np.median(s["medianLatencyMs"])) if s["medianLatencyMs"] else 0.0,
                "medianContextTokens": float(np.median(s["medianContextTokens"])) if s["medianContextTokens"] else 0.0,
                "l2ContributionWeights": _l2_weights(helper_f[j]),
            }
        )

    task_factor_records = [
        {"taskFamily": task, "factors": [float(x) for x in task_f[ti[task]]]}
        for task in tasks
    ]

    # Reconstructed-cell observedness: a consumer must be able to tell a
    # genuinely-observed utility from a low-rank-inferred one for an
    # unobserved (task, helper) pair - the fitter fills in a plausible
    # value for every cell (that's the point of factorization), but callers
    # should not treat an inferred value with the same confidence as a real
    # receipt.
    reconstruction = [
        {
            "taskFamily": task,
            "helperId": helper,
            "reconstructedUtility": float(reconstructed[ti[task], hi[helper]]),
            "observed": (task, helper) in observed_pairs,
        }
        for task in tasks
        for helper in helpers
    ]

    return {
        "schema": "parent-atlas.low-rank-helper-artifact.v1",
        "artifactRevision": str(payload["artifactRevision"]),
        "rank": int(task_f.shape[1]),
        "backend": backend,
        "taskFactors": task_factor_records,
        "helperFactors": helper_records,
        "reconstruction": reconstruction,
        "reconstructionChecksum": float(np.sum(reconstructed)),
        "trainingReceiptRefs": list(payload.get("trainingReceiptRefs", [])),
        "promotion": "SHADOW_ONLY",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_json")
    ap.add_argument("output_json")
    ap.add_argument("--cpu", action="store_true")
    args = ap.parse_args()

    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    artifact = fit(payload, prefer_gpu=not args.cpu)
    Path(args.output_json).write_text(
        json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"status": "OK", "backend": artifact["backend"], "output": args.output_json}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
