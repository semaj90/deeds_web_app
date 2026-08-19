from __future__ import annotations

"""Direct-SVD parity probe for Parent Atlas N×16 feature matrices.

CPU reference:
  numpy.linalg.svd(..., full_matrices=False) -> LAPACK gesdd

GPU challengers (when CUDA is available):
  torch.linalg.svd(..., driver='gesvdj') -> cuSOLVER Jacobi SVD
  torch.linalg.svd(..., driver='gesvd')  -> cuSOLVER QR SVD accuracy fallback

The probe compares singular values and reconstruction residuals only. Singular
vectors are intentionally excluded from parity because their signs/bases are not
unique even when two SVD implementations are both correct.
"""

from dataclasses import dataclass
import argparse
import json
import math
import sys
import time
from typing import Any

import numpy as np


@dataclass(frozen=True)
class SvdRun:
    backend: str
    driver: str
    device: str
    dtype: str
    status: str
    singular_values: list[float]
    numerical_rank: int | None
    condition_number_active: float | None
    reconstruction_relative_frobenius_error: float | None
    duration_ms: float
    detail: str | None = None


def _as_matrix(raw: dict[str, Any]) -> np.ndarray:
    rows = int(raw["rows"])
    cols = int(raw["cols"])
    values = np.asarray(raw["values"], dtype=np.float64)
    if rows <= 0 or cols <= 0:
        raise ValueError("SVD_PARITY_INVALID_SHAPE")
    if values.size != rows * cols:
        raise ValueError("SVD_PARITY_VALUE_LENGTH_MISMATCH")
    matrix = values.reshape(rows, cols)
    if not np.isfinite(matrix).all():
        raise ValueError("SVD_PARITY_NONFINITE_MATRIX")
    return matrix


def _rank_and_condition(
    singular_values: np.ndarray,
    rows: int,
    cols: int,
    tolerance_factor: float,
) -> tuple[int, float | None, float]:
    sigma_max = float(singular_values[0]) if singular_values.size else 0.0
    tolerance = (
        tolerance_factor * max(rows, cols) * sigma_max if sigma_max > 0.0 else 0.0
    )
    active = singular_values[singular_values > tolerance]
    numerical_rank = int(active.size)
    condition = (
        float(active[0] / active[-1]) if active.size and float(active[-1]) > 0.0 else None
    )
    return numerical_rank, condition, tolerance


def _relative_frobenius_residual(
    matrix: np.ndarray,
    u: np.ndarray,
    s: np.ndarray,
    vh: np.ndarray,
) -> float:
    norm = float(np.linalg.norm(matrix, ord="fro"))
    reconstructed = (u * s[np.newaxis, :]) @ vh
    residual = float(np.linalg.norm(matrix - reconstructed, ord="fro"))
    return residual / norm if norm > 0.0 else residual


def run_numpy_gesdd(matrix: np.ndarray, tolerance_factor: float) -> SvdRun:
    start = time.perf_counter()
    u, s, vh = np.linalg.svd(matrix.astype(np.float64, copy=False), full_matrices=False)
    duration_ms = (time.perf_counter() - start) * 1000.0
    rank, condition, _ = _rank_and_condition(s, matrix.shape[0], matrix.shape[1], tolerance_factor)
    return SvdRun(
        backend="numpy",
        driver="lapack_gesdd",
        device="cpu",
        dtype="float64",
        status="EXECUTED",
        singular_values=[float(v) for v in s],
        numerical_rank=rank,
        condition_number_active=condition,
        reconstruction_relative_frobenius_error=_relative_frobenius_residual(matrix, u, s, vh),
        duration_ms=duration_ms,
    )


def _torch_cuda_run(matrix: np.ndarray, driver: str, tolerance_factor: float) -> SvdRun:
    try:
        import torch
    except Exception as exc:  # pragma: no cover - environment dependent
        return SvdRun(
            backend="torch",
            driver=f"cusolver_{driver}",
            device="cuda",
            dtype="float64",
            status="UNAVAILABLE",
            singular_values=[],
            numerical_rank=None,
            condition_number_active=None,
            reconstruction_relative_frobenius_error=None,
            duration_ms=0.0,
            detail=f"TORCH_IMPORT_FAILED:{type(exc).__name__}:{exc}",
        )

    if not torch.cuda.is_available():  # pragma: no cover - environment dependent
        return SvdRun(
            backend="torch",
            driver=f"cusolver_{driver}",
            device="cuda",
            dtype="float64",
            status="UNAVAILABLE",
            singular_values=[],
            numerical_rank=None,
            condition_number_active=None,
            reconstruction_relative_frobenius_error=None,
            duration_ms=0.0,
            detail="CUDA_NOT_AVAILABLE",
        )

    try:  # pragma: no cover - requires CUDA runtime
        a = torch.as_tensor(matrix, dtype=torch.float64, device="cuda")
        torch.cuda.synchronize()
        start = time.perf_counter()
        u, s, vh = torch.linalg.svd(a, full_matrices=False, driver=driver)
        torch.cuda.synchronize()
        duration_ms = (time.perf_counter() - start) * 1000.0
        reconstructed = (u * s.unsqueeze(0)) @ vh
        denom = torch.linalg.vector_norm(a)
        residual = torch.linalg.vector_norm(a - reconstructed)
        relative_residual = float((residual / denom).item()) if float(denom.item()) > 0 else float(residual.item())
        singular_values = s.detach().cpu().numpy().astype(np.float64, copy=False)
        rank, condition, _ = _rank_and_condition(
            singular_values,
            matrix.shape[0],
            matrix.shape[1],
            tolerance_factor,
        )
        return SvdRun(
            backend="torch",
            driver=f"cusolver_{driver}",
            device="cuda",
            dtype="float64",
            status="EXECUTED",
            singular_values=[float(v) for v in singular_values],
            numerical_rank=rank,
            condition_number_active=condition,
            reconstruction_relative_frobenius_error=relative_residual,
            duration_ms=duration_ms,
            detail=f"cuda_device:{torch.cuda.get_device_name(a.device)}",
        )
    except Exception as exc:
        return SvdRun(
            backend="torch",
            driver=f"cusolver_{driver}",
            device="cuda",
            dtype="float64",
            status="FAILED",
            singular_values=[],
            numerical_rank=None,
            condition_number_active=None,
            reconstruction_relative_frobenius_error=None,
            duration_ms=0.0,
            detail=f"{type(exc).__name__}:{exc}",
        )


def _compare(reference: SvdRun, challenger: SvdRun) -> dict[str, Any]:
    if reference.status != "EXECUTED" or challenger.status != "EXECUTED":
        return {
            "referenceDriver": reference.driver,
            "challengerDriver": challenger.driver,
            "status": "NOT_COMPARABLE",
            "maxAbsoluteSingularError": None,
            "maxRelativeSingularError": None,
            "rankAgreement": None,
            "conditionRelativeError": None,
        }

    ref = np.asarray(reference.singular_values, dtype=np.float64)
    got = np.asarray(challenger.singular_values, dtype=np.float64)
    if ref.shape != got.shape:
        return {
            "referenceDriver": reference.driver,
            "challengerDriver": challenger.driver,
            "status": "SHAPE_MISMATCH",
            "maxAbsoluteSingularError": None,
            "maxRelativeSingularError": None,
            "rankAgreement": False,
            "conditionRelativeError": None,
        }

    absolute = np.abs(ref - got)
    denominator = np.maximum(np.abs(ref), np.finfo(np.float64).tiny)
    relative = absolute / denominator
    ref_condition = reference.condition_number_active
    got_condition = challenger.condition_number_active
    condition_relative_error = None
    if ref_condition is not None and got_condition is not None and ref_condition > 0:
        condition_relative_error = abs(ref_condition - got_condition) / ref_condition

    return {
        "referenceDriver": reference.driver,
        "challengerDriver": challenger.driver,
        "status": "COMPARED",
        "maxAbsoluteSingularError": float(absolute.max(initial=0.0)),
        "maxRelativeSingularError": float(relative.max(initial=0.0)),
        "rankAgreement": reference.numerical_rank == challenger.numerical_rank,
        "conditionRelativeError": condition_relative_error,
    }


def run_parity(raw: dict[str, Any]) -> dict[str, Any]:
    if raw.get("schema") != "atlas.direct-svd-parity-input.v1":
        raise ValueError("SVD_PARITY_INPUT_SCHEMA_MISMATCH")

    matrix = _as_matrix(raw)
    tolerance_factor = float(raw.get("singularValueToleranceFactor", 1e-12))
    max_relative_error = float(raw.get("maxRelativeSingularError", 1e-6))
    max_residual = float(raw.get("maxReconstructionRelativeFrobeniusError", 1e-10))
    if not (tolerance_factor > 0 and math.isfinite(tolerance_factor)):
        raise ValueError("SVD_PARITY_INVALID_SINGULAR_TOLERANCE")

    cpu = run_numpy_gesdd(matrix, tolerance_factor)
    gpu_jacobi = _torch_cuda_run(matrix, "gesvdj", tolerance_factor)
    gpu_qr = _torch_cuda_run(matrix, "gesvd", tolerance_factor)
    runs = [cpu, gpu_jacobi, gpu_qr]
    comparisons = [_compare(cpu, gpu_jacobi), _compare(cpu, gpu_qr)]

    gpu_executed = [run for run in (gpu_jacobi, gpu_qr) if run.status == "EXECUTED"]
    comparable = [row for row in comparisons if row["status"] == "COMPARED"]
    comparison_pass = bool(comparable) and all(
        row["maxRelativeSingularError"] is not None
        and row["maxRelativeSingularError"] <= max_relative_error
        and row["rankAgreement"] is True
        for row in comparable
    )
    residual_pass = cpu.reconstruction_relative_frobenius_error is not None and cpu.reconstruction_relative_frobenius_error <= max_residual
    residual_pass = residual_pass and all(
        run.reconstruction_relative_frobenius_error is not None
        and run.reconstruction_relative_frobenius_error <= max_residual
        for run in gpu_executed
    )

    if not gpu_executed:
        status = "GPU_UNAVAILABLE"
    elif comparison_pass and residual_pass:
        status = "PASS"
    else:
        status = "FAIL"

    return {
        "schema": "atlas.direct-svd-parity-receipt.v1",
        "requestId": str(raw["requestId"]),
        "matrixSha256": str(raw["matrixSha256"]),
        "rows": int(raw["rows"]),
        "cols": int(raw["cols"]),
        "dtype": "float64",
        "comparisonTarget": "SINGULAR_VALUES_NOT_SINGULAR_VECTORS",
        "singularValueToleranceFactor": tolerance_factor,
        "maxRelativeSingularErrorPolicy": max_relative_error,
        "maxReconstructionRelativeFrobeniusErrorPolicy": max_residual,
        "runs": [run.__dict__ for run in runs],
        "comparisons": comparisons,
        "status": status,
        "cpuDirectSvdExecuted": True,
        "gpuGesvdjExecuted": gpu_jacobi.status == "EXECUTED",
        "gpuGesvdExecuted": gpu_qr.status == "EXECUTED",
        "ataJacobiIncluded": False,
        "canonicalWritesAllowed": False,
        "producerRevision": str(raw.get("producerRevision", "parent-atlas-svd-parity.v1")),
    }


def _fixture_matrix(condition_number: float, rows: int = 32, cols: int = 16, seed: int = 0xA71A5) -> np.ndarray:
    if rows < cols:
        raise ValueError("fixture requires rows >= cols")
    rng = np.random.default_rng(seed)
    q_left, _ = np.linalg.qr(rng.normal(size=(rows, cols)))
    q_right, _ = np.linalg.qr(rng.normal(size=(cols, cols)))
    singular = np.geomspace(1.0, 1.0 / condition_number, num=cols)
    return q_left @ np.diag(singular) @ q_right.T


def run_fixture_suite(require_cuda: bool = False) -> dict[str, Any]:
    receipts: list[dict[str, Any]] = []
    for index, condition in enumerate((1e2, 1e4, 1e6, 1e8)):
        matrix = _fixture_matrix(condition, seed=0xA71A5 + index)
        receipt = run_parity({
            "schema": "atlas.direct-svd-parity-input.v1",
            "requestId": f"fixture-kappa-{int(condition):d}",
            "matrixSha256": f"fixture:{int(condition):d}",
            "rows": int(matrix.shape[0]),
            "cols": int(matrix.shape[1]),
            "values": matrix.reshape(-1).tolist(),
            "singularValueToleranceFactor": 1e-12,
            "maxRelativeSingularError": 5e-5 if condition >= 1e8 else 1e-6,
            "maxReconstructionRelativeFrobeniusError": 1e-9,
            "producerRevision": "parent-atlas-svd-parity.fixture.v1",
        })
        receipts.append(receipt)

    gpu_available = any(receipt["gpuGesvdjExecuted"] or receipt["gpuGesvdExecuted"] for receipt in receipts)
    if require_cuda and not gpu_available:
        raise RuntimeError("SVD_PARITY_CUDA_REQUIRED_BUT_UNAVAILABLE")
    return {
        "schema": "atlas.direct-svd-parity-fixture-suite.v1",
        "conditions": [1e2, 1e4, 1e6, 1e8],
        "receipts": receipts,
        "gpuAvailable": gpu_available,
        "allComparablePass": gpu_available and all(receipt["status"] == "PASS" for receipt in receipts),
        "canonicalWritesAllowed": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="parent-atlas-svd-parity")
    parser.add_argument("--fixtures", action="store_true")
    parser.add_argument("--require-cuda", action="store_true")
    args = parser.parse_args()

    if args.fixtures:
        print(json.dumps(run_fixture_suite(require_cuda=args.require_cuda), separators=(",", ":")))
        return

    payload = json.load(sys.stdin)
    receipt = run_parity(payload)
    print(json.dumps(receipt, separators=(",", ":")))
    if args.require_cuda and receipt["status"] == "GPU_UNAVAILABLE":
        raise SystemExit(3)
    if receipt["status"] == "FAIL":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
