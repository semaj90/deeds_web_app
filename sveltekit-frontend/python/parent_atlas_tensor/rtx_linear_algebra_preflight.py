from __future__ import annotations

"""Integrated Parent Atlas RTX linear-algebra preflight.

One bounded receipt ties together:
  1. NumPy/CUDA GEMM parity lanes,
  2. CPU direct SVD + CUDA gesvdj/gesvd parity,
  3. bounded ModFKV sampling/sketch reconstruction.

This is numerical/runtime evidence only. No result authorizes canonical mutation.
"""

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

from .gemm_primitives import run_gemm_suite
from .modfkv_bounded import run_bounded_modfkv
from .svd_parity import run_parity


def _sha256_matrix(matrix: np.ndarray) -> str:
    value = np.ascontiguousarray(matrix.astype(np.float64, copy=False))
    h = hashlib.sha256()
    h.update(json.dumps(list(value.shape), separators=(",", ":")).encode("utf-8"))
    h.update(b"\0")
    h.update(memoryview(value).cast("B"))
    return h.hexdigest()


def _conditioned_matrix(
    rows: int,
    cols: int,
    condition_number: float,
    seed: int,
) -> np.ndarray:
    if rows < cols:
        raise ValueError("RTX_PREFLIGHT_REQUIRES_ROWS_GE_COLS")
    if condition_number < 1.0:
        raise ValueError("RTX_PREFLIGHT_CONDITION_NUMBER_INVALID")
    rng = np.random.default_rng(seed)
    q_left, _ = np.linalg.qr(rng.normal(size=(rows, cols)))
    q_right, _ = np.linalg.qr(rng.normal(size=(cols, cols)))
    singular = np.geomspace(1.0, 1.0 / condition_number, num=cols)
    return q_left @ np.diag(singular) @ q_right.T


def run_linear_algebra_preflight(
    *,
    seed: int = 0xA71A5,
    gemm_m: int = 1024,
    gemm_n: int = 1024,
    gemm_k: int = 1024,
    feature_rows: int = 64,
    feature_cols: int = 16,
    condition_number: float = 1e6,
    modfkv_sample_count: int = 32,
    modfkv_rank: int = 8,
    require_cuda: bool = False,
) -> dict[str, Any]:
    gemm = run_gemm_suite(
        m=gemm_m,
        n=gemm_n,
        k=gemm_k,
        seed=seed,
        warmup=3,
        repeats=7,
        require_cuda=require_cuda,
        producer_revision="parent-atlas-rtx-linear-algebra-preflight.gemm.v1",
    )

    feature_matrix = _conditioned_matrix(
        feature_rows,
        feature_cols,
        condition_number,
        seed ^ 0x5A5A5A,
    )
    matrix_sha256 = _sha256_matrix(feature_matrix)
    matrix_values = feature_matrix.reshape(-1).tolist()

    svd = run_parity({
        "schema": "atlas.direct-svd-parity-input.v1",
        "requestId": f"rtx-preflight:{matrix_sha256[:16]}",
        "matrixSha256": matrix_sha256,
        "rows": feature_rows,
        "cols": feature_cols,
        "values": matrix_values,
        "singularValueToleranceFactor": 1e-12,
        "maxRelativeSingularError": 5e-5 if condition_number >= 1e8 else 1e-6,
        "maxReconstructionRelativeFrobeniusError": 1e-9,
        "producerRevision": "parent-atlas-rtx-linear-algebra-preflight.svd.v1",
    })

    modfkv = run_bounded_modfkv({
        "schema": "atlas.modfkv-bounded-input.v1",
        "requestId": f"rtx-preflight:{matrix_sha256[:16]}",
        "matrixSha256": matrix_sha256,
        "rows": feature_rows,
        "cols": feature_cols,
        "values": matrix_values,
        "sampleCount": min(modfkv_sample_count, max(feature_rows, feature_cols) * 4),
        "desiredRank": min(modfkv_rank, feature_cols),
        "singularValueThreshold": 1e-12,
        "seed": seed,
        "producerRevision": "parent-atlas-rtx-linear-algebra-preflight.modfkv.v1",
    })

    cuda_available = bool(gemm["cudaAttestation"].get("cudaAvailable", False))
    gemm_ok = (
        gemm["summary"]["failedLaneCount"] == 0
        and (not require_cuda or gemm["summary"]["executedLaneCount"] > 0)
    )
    svd_ok = svd["status"] == "PASS" if cuda_available else svd["status"] == "GPU_UNAVAILABLE"
    modfkv_ok = bool(modfkv["modFkvSamplingStructureExecuted"] and modfkv["directSvdOfWSketchExecuted"])

    if require_cuda and not cuda_available:
        status = "GPU_UNAVAILABLE"
    elif gemm_ok and svd_ok and modfkv_ok:
        status = "PASS" if cuda_available else "CPU_REFERENCE_ONLY"
    else:
        status = "FAIL"

    return {
        "schema": "atlas.rtx-linear-algebra-preflight-receipt.v1",
        "seed": seed,
        "featureMatrix": {
            "rows": feature_rows,
            "cols": feature_cols,
            "conditionNumberTarget": condition_number,
            "matrixSha256": matrix_sha256,
        },
        "gemm": gemm,
        "directSvdParity": svd,
        "boundedModFkv": modfkv,
        "status": status,
        "gates": {
            "gemmGate": gemm_ok,
            "directSvdGate": svd_ok,
            "boundedModFkvGate": modfkv_ok,
            "cudaRequired": require_cuda,
            "cudaAvailable": cuda_available,
        },
        "invariants": {
            "sameSeedLineage": True,
            "sameFeatureMatrixForSvdAndModFkv": True,
            "gpuBackendPreferenceIsNotDispatchProof": True,
            "fullTangRecommendationAlgorithmExecuted": False,
            "evidenceAuthorizesMutation": False,
            "canonicalWritesAllowed": False,
        },
        "producerRevision": "parent-atlas-rtx-linear-algebra-preflight.v1",
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="parent-atlas-rtx-linear-algebra-preflight")
    parser.add_argument("--seed", type=lambda value: int(value, 0), default=0xA71A5)
    parser.add_argument("--gemm-m", type=int, default=1024)
    parser.add_argument("--gemm-n", type=int, default=1024)
    parser.add_argument("--gemm-k", type=int, default=1024)
    parser.add_argument("--feature-rows", type=int, default=64)
    parser.add_argument("--condition", type=float, default=1e6)
    parser.add_argument("--modfkv-samples", type=int, default=32)
    parser.add_argument("--modfkv-rank", type=int, default=8)
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()

    receipt = run_linear_algebra_preflight(
        seed=args.seed,
        gemm_m=args.gemm_m,
        gemm_n=args.gemm_n,
        gemm_k=args.gemm_k,
        feature_rows=args.feature_rows,
        feature_cols=16,
        condition_number=args.condition,
        modfkv_sample_count=args.modfkv_samples,
        modfkv_rank=args.modfkv_rank,
        require_cuda=args.require_cuda,
    )
    payload = json.dumps(receipt, indent=2, allow_nan=False) + "\n"
    if args.output:
        target = Path(args.output).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")
    print(payload, end="")
    if receipt["status"] == "FAIL":
        raise SystemExit(2)
    if args.require_cuda and receipt["status"] == "GPU_UNAVAILABLE":
        raise SystemExit(3)


if __name__ == "__main__":
    main()
