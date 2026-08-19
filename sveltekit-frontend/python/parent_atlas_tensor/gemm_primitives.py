from __future__ import annotations

"""Parent Atlas RTX/Ampere GEMM benchmark + parity primitives.

The module keeps a strict distinction between:
- a requested PyTorch BLAS backend preference (cuBLAS / cuBLASLt), and
- independently proven kernel dispatch (which requires an external profiler such
  as Nsight/CUPTI and is therefore *not* claimed here).

CPU numerical authority:
  NumPy float64 matmul

CUDA challenger lanes:
  FP64 / cuBLAS preference
  FP32 IEEE / cuBLAS preference
  FP32 IEEE / cuBLASLt preference
  FP32 TF32-allowed / cuBLASLt preference
  FP16 input -> FP32 output / cuBLASLt preference
  BF16 input -> FP32 output / cuBLASLt preference, when supported

Receipts are read-only evidence and never authorize canonical mutation.
"""

from dataclasses import dataclass, asdict
import argparse
import hashlib
import json
import math
import statistics
import sys
import time
from typing import Any, Callable

import numpy as np


@dataclass(frozen=True)
class GemmLane:
    lane_id: str
    input_dtype: str
    output_dtype: str
    preferred_blas: str
    fp32_precision: str | None
    allow_fp16_reduced_precision_reduction: bool | None = None
    allow_bf16_reduced_precision_reduction: bool | None = None


@dataclass(frozen=True)
class GemmLaneResult:
    lane_id: str
    status: str
    input_dtype: str
    output_dtype: str
    preferred_blas_requested: str
    fp32_precision_requested: str | None
    backend_preference_api_available: bool
    backend_dispatch_independently_verified: bool
    backend_dispatch_proof: str
    warmup: int
    repeats: int
    timings_ms: list[float]
    median_ms: float | None
    min_ms: float | None
    gflops_median: float | None
    max_absolute_error_vs_numpy_f64: float | None
    relative_frobenius_error_vs_numpy_f64: float | None
    output_sha256: str | None
    detail: str | None = None


DEFAULT_LANES: tuple[GemmLane, ...] = (
    GemmLane("cuda-f64-cublas", "float64", "float64", "cublas", "ieee"),
    GemmLane("cuda-f32-ieee-cublas", "float32", "float32", "cublas", "ieee"),
    GemmLane("cuda-f32-ieee-cublaslt", "float32", "float32", "cublaslt", "ieee"),
    GemmLane("cuda-f32-tf32-cublaslt", "float32", "float32", "cublaslt", "tf32"),
    GemmLane(
        "cuda-f16-f32out-cublaslt",
        "float16",
        "float32",
        "cublaslt",
        None,
        allow_fp16_reduced_precision_reduction=False,
    ),
    GemmLane(
        "cuda-bf16-f32out-cublaslt",
        "bfloat16",
        "float32",
        "cublaslt",
        None,
        allow_bf16_reduced_precision_reduction=False,
    ),
)


def _sha256_array(value: np.ndarray) -> str:
    contiguous = np.ascontiguousarray(value)
    h = hashlib.sha256()
    h.update(str(contiguous.dtype).encode("utf-8"))
    h.update(b"\0")
    h.update(json.dumps(list(contiguous.shape), separators=(",", ":")).encode("utf-8"))
    h.update(b"\0")
    h.update(memoryview(contiguous).cast("B"))
    return h.hexdigest()


def _sha256_inputs(a: np.ndarray, b: np.ndarray) -> str:
    h = hashlib.sha256()
    h.update(_sha256_array(a).encode("ascii"))
    h.update(b"\0")
    h.update(_sha256_array(b).encode("ascii"))
    return h.hexdigest()


def _relative_frobenius_error(reference: np.ndarray, got: np.ndarray) -> float:
    denom = float(np.linalg.norm(reference, ord="fro"))
    numer = float(np.linalg.norm(reference - got, ord="fro"))
    return numer / denom if denom > 0.0 else numer


def _cpu_reference(a: np.ndarray, b: np.ndarray, repeats: int) -> tuple[np.ndarray, list[float]]:
    timings: list[float] = []
    out: np.ndarray | None = None
    for _ in range(max(1, repeats)):
        start = time.perf_counter()
        out = np.matmul(a, b)
        timings.append((time.perf_counter() - start) * 1000.0)
    assert out is not None
    return np.asarray(out, dtype=np.float64), timings


def _torch_dtype(torch: Any, name: str) -> Any:
    mapping = {
        "float64": torch.float64,
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }
    if name not in mapping:
        raise ValueError(f"GEMM_UNKNOWN_TORCH_DTYPE:{name}")
    return mapping[name]


def _set_fp32_precision(torch: Any, value: str | None) -> tuple[str, Any] | None:
    if value is None:
        return None

    # PyTorch >=2.9 fine-grained CUDA matmul precision API.
    matmul_backend = getattr(torch.backends.cuda, "matmul", None)
    if matmul_backend is not None and hasattr(matmul_backend, "fp32_precision"):
        previous = matmul_backend.fp32_precision
        matmul_backend.fp32_precision = value
        return ("fine_grained", previous)

    # Compatibility fallback. highest ~= IEEE; high permits TF32 where available.
    previous = torch.get_float32_matmul_precision()
    torch.set_float32_matmul_precision("highest" if value == "ieee" else "high")
    return ("global", previous)


def _restore_fp32_precision(torch: Any, state: tuple[str, Any] | None) -> None:
    if state is None:
        return
    kind, previous = state
    if kind == "fine_grained":
        torch.backends.cuda.matmul.fp32_precision = previous
    else:
        torch.set_float32_matmul_precision(previous)


def _set_blas_preference(torch: Any, backend: str) -> tuple[bool, Any | None]:
    fn = getattr(torch.backends.cuda, "preferred_blas_library", None)
    if fn is None:
        return False, None
    previous = fn()
    fn(backend)
    return True, previous


def _restore_blas_preference(torch: Any, available: bool, previous: Any | None) -> None:
    if not available:
        return
    try:
        torch.backends.cuda.preferred_blas_library(previous)
    except Exception:
        # This is a one-shot benchmark process in the normal CLI path. Do not
        # hide a successful receipt only because an experimental preference API
        # changed its enum restoration behavior.
        pass


def _set_reduction_policy(torch: Any, lane: GemmLane) -> list[tuple[str, Any]]:
    saved: list[tuple[str, Any]] = []
    matmul = torch.backends.cuda.matmul
    if lane.allow_fp16_reduced_precision_reduction is not None and hasattr(matmul, "allow_fp16_reduced_precision_reduction"):
        saved.append(("fp16", matmul.allow_fp16_reduced_precision_reduction))
        matmul.allow_fp16_reduced_precision_reduction = lane.allow_fp16_reduced_precision_reduction
    if lane.allow_bf16_reduced_precision_reduction is not None and hasattr(matmul, "allow_bf16_reduced_precision_reduction"):
        saved.append(("bf16", matmul.allow_bf16_reduced_precision_reduction))
        matmul.allow_bf16_reduced_precision_reduction = lane.allow_bf16_reduced_precision_reduction
    return saved


def _restore_reduction_policy(torch: Any, saved: list[tuple[str, Any]]) -> None:
    matmul = torch.backends.cuda.matmul
    for kind, value in saved:
        if kind == "fp16":
            matmul.allow_fp16_reduced_precision_reduction = value
        elif kind == "bf16":
            matmul.allow_bf16_reduced_precision_reduction = value


def _torch_mm(torch: Any, a: Any, b: Any, lane: GemmLane) -> Any:
    if lane.output_dtype == "float32" and lane.input_dtype in {"float16", "bfloat16"}:
        return torch.mm(a, b, out_dtype=torch.float32)
    return torch.mm(a, b)


def _nvtx_push(torch: Any, label: str) -> bool:
    try:
        torch.cuda.nvtx.range_push(label)
        return True
    except Exception:
        return False


def _nvtx_pop(torch: Any, pushed: bool) -> None:
    if not pushed:
        return
    try:
        torch.cuda.nvtx.range_pop()
    except Exception:
        pass


def _run_cuda_lane(
    torch: Any,
    lane: GemmLane,
    a_np: np.ndarray,
    b_np: np.ndarray,
    reference: np.ndarray,
    warmup: int,
    repeats: int,
) -> GemmLaneResult:
    if lane.input_dtype == "bfloat16":
        try:
            if not bool(torch.cuda.is_bf16_supported(including_emulation=False)):
                return GemmLaneResult(
                    lane.lane_id, "UNAVAILABLE", lane.input_dtype, lane.output_dtype,
                    lane.preferred_blas, lane.fp32_precision, False, False,
                    "PYTORCH_BACKEND_PREFERENCE_ONLY", warmup, repeats, [], None,
                    None, None, None, None, None, "BF16_NOT_NATIVELY_SUPPORTED",
                )
        except TypeError:
            if not bool(torch.cuda.is_bf16_supported()):
                return GemmLaneResult(
                    lane.lane_id, "UNAVAILABLE", lane.input_dtype, lane.output_dtype,
                    lane.preferred_blas, lane.fp32_precision, False, False,
                    "PYTORCH_BACKEND_PREFERENCE_ONLY", warmup, repeats, [], None,
                    None, None, None, None, None, "BF16_NOT_SUPPORTED",
                )

    dtype = _torch_dtype(torch, lane.input_dtype)
    blas_available, previous_blas = _set_blas_preference(torch, lane.preferred_blas)
    precision_state = _set_fp32_precision(torch, lane.fp32_precision)
    reduction_state = _set_reduction_policy(torch, lane)
    pushed = False
    try:
        a = torch.as_tensor(a_np, device="cuda", dtype=dtype)
        b = torch.as_tensor(b_np, device="cuda", dtype=dtype)

        for _ in range(max(0, warmup)):
            _ = _torch_mm(torch, a, b, lane)
        torch.cuda.synchronize()

        timings: list[float] = []
        output = None
        pushed = _nvtx_push(torch, f"parent-atlas::{lane.lane_id}")
        for _ in range(max(1, repeats)):
            start = torch.cuda.Event(enable_timing=True)
            end = torch.cuda.Event(enable_timing=True)
            start.record()
            output = _torch_mm(torch, a, b, lane)
            end.record()
            end.synchronize()
            timings.append(float(start.elapsed_time(end)))
        assert output is not None
        torch.cuda.synchronize()
        got = output.detach().to(torch.float64).cpu().numpy()

        median_ms = float(statistics.median(timings))
        min_ms = float(min(timings))
        flop_count = 2.0 * a_np.shape[0] * a_np.shape[1] * b_np.shape[1]
        gflops = (flop_count / (median_ms / 1000.0)) / 1e9 if median_ms > 0 else None
        max_abs = float(np.max(np.abs(reference - got)))
        rel_frob = _relative_frobenius_error(reference, got)
        return GemmLaneResult(
            lane_id=lane.lane_id,
            status="EXECUTED",
            input_dtype=lane.input_dtype,
            output_dtype=lane.output_dtype,
            preferred_blas_requested=lane.preferred_blas,
            fp32_precision_requested=lane.fp32_precision,
            backend_preference_api_available=blas_available,
            backend_dispatch_independently_verified=False,
            backend_dispatch_proof="PYTORCH_BACKEND_PREFERENCE_ONLY",
            warmup=warmup,
            repeats=repeats,
            timings_ms=timings,
            median_ms=median_ms,
            min_ms=min_ms,
            gflops_median=gflops,
            max_absolute_error_vs_numpy_f64=max_abs,
            relative_frobenius_error_vs_numpy_f64=rel_frob,
            output_sha256=_sha256_array(got),
        )
    except Exception as exc:
        return GemmLaneResult(
            lane_id=lane.lane_id,
            status="FAILED",
            input_dtype=lane.input_dtype,
            output_dtype=lane.output_dtype,
            preferred_blas_requested=lane.preferred_blas,
            fp32_precision_requested=lane.fp32_precision,
            backend_preference_api_available=blas_available,
            backend_dispatch_independently_verified=False,
            backend_dispatch_proof="PYTORCH_BACKEND_PREFERENCE_ONLY",
            warmup=warmup,
            repeats=repeats,
            timings_ms=[],
            median_ms=None,
            min_ms=None,
            gflops_median=None,
            max_absolute_error_vs_numpy_f64=None,
            relative_frobenius_error_vs_numpy_f64=None,
            output_sha256=None,
            detail=f"{type(exc).__name__}:{exc}",
        )
    finally:
        _nvtx_pop(torch, pushed)
        _restore_reduction_policy(torch, reduction_state)
        _restore_fp32_precision(torch, precision_state)
        _restore_blas_preference(torch, blas_available, previous_blas)


def cuda_attestation() -> dict[str, Any]:
    try:
        import torch
    except Exception as exc:
        return {
            "torchImportable": False,
            "cudaAvailable": False,
            "detail": f"TORCH_IMPORT_FAILED:{type(exc).__name__}:{exc}",
        }

    if not torch.cuda.is_available():
        return {
            "torchImportable": True,
            "torchVersion": str(torch.__version__),
            "cudaBuildVersion": str(torch.version.cuda),
            "cudaAvailable": False,
        }

    index = torch.cuda.current_device()
    properties = torch.cuda.get_device_properties(index)
    try:
        tf32_supported = bool(torch.cuda.is_tf32_supported())
    except Exception:
        tf32_supported = properties.major >= 8
    try:
        bf16_supported = bool(torch.cuda.is_bf16_supported(including_emulation=False))
    except TypeError:
        bf16_supported = bool(torch.cuda.is_bf16_supported())
    except Exception:
        bf16_supported = False

    preferred = None
    if hasattr(torch.backends.cuda, "preferred_blas_library"):
        try:
            preferred = str(torch.backends.cuda.preferred_blas_library())
        except Exception:
            preferred = None

    return {
        "torchImportable": True,
        "torchVersion": str(torch.__version__),
        "cudaBuildVersion": str(torch.version.cuda),
        "cudaAvailable": True,
        "deviceIndex": int(index),
        "deviceName": str(properties.name),
        "computeCapability": f"{properties.major}.{properties.minor}",
        "totalMemoryBytes": int(properties.total_memory),
        "multiProcessorCount": int(properties.multi_processor_count),
        "tf32Supported": tf32_supported,
        "bf16Supported": bf16_supported,
        "currentPreferredBlas": preferred,
        "backendDispatchTraceVerified": False,
    }


def run_gemm_suite(
    *,
    m: int = 1024,
    n: int = 1024,
    k: int = 1024,
    seed: int = 0xA71A5,
    warmup: int = 3,
    repeats: int = 7,
    require_cuda: bool = False,
    lanes: tuple[GemmLane, ...] = DEFAULT_LANES,
    producer_revision: str = "parent-atlas-gemm-primitives.v1",
) -> dict[str, Any]:
    if min(m, n, k) <= 0:
        raise ValueError("GEMM_DIMENSIONS_MUST_BE_POSITIVE")
    if max(m, n, k) > 32768:
        raise ValueError("GEMM_DIMENSION_EXCEEDS_BOUNDED_PROBE_LIMIT")
    if warmup < 0 or repeats <= 0:
        raise ValueError("GEMM_TIMING_COUNTS_INVALID")

    rng = np.random.default_rng(seed)
    a = rng.standard_normal((m, k), dtype=np.float64)
    b = rng.standard_normal((k, n), dtype=np.float64)
    input_sha256 = _sha256_inputs(a, b)

    reference, cpu_timings = _cpu_reference(a, b, repeats=min(3, repeats))
    cpu_median = float(statistics.median(cpu_timings))
    flop_count = 2.0 * m * n * k
    cpu_gflops = (flop_count / (cpu_median / 1000.0)) / 1e9 if cpu_median > 0 else None

    attestation = cuda_attestation()
    if require_cuda and not attestation.get("cudaAvailable", False):
        raise RuntimeError("GEMM_CUDA_REQUIRED_BUT_UNAVAILABLE")

    lane_results: list[GemmLaneResult] = []
    if attestation.get("cudaAvailable", False):
        import torch
        for lane in lanes:
            lane_results.append(_run_cuda_lane(torch, lane, a, b, reference, warmup, repeats))

    executed = [row for row in lane_results if row.status == "EXECUTED"]
    failed = [row for row in lane_results if row.status == "FAILED"]
    unavailable = [row for row in lane_results if row.status == "UNAVAILABLE"]

    return {
        "schema": "atlas.rtx-gemm-parity-receipt.v1",
        "shape": {"m": m, "n": n, "k": k},
        "seed": seed,
        "inputSha256": input_sha256,
        "numpyReference": {
            "dtype": "float64",
            "numpyVersion": np.__version__,
            "timingsMs": cpu_timings,
            "medianMs": cpu_median,
            "gflopsMedian": cpu_gflops,
            "outputSha256": _sha256_array(reference),
            "blasImplementationRuntimeSelectedByNumpyBuild": True,
        },
        "cudaAttestation": attestation,
        "lanes": [asdict(row) for row in lane_results],
        "summary": {
            "cudaLaneCount": len(lane_results),
            "executedLaneCount": len(executed),
            "failedLaneCount": len(failed),
            "unavailableLaneCount": len(unavailable),
            "allRequestedCudaLanesExecuted": bool(lane_results) and not failed and not unavailable,
            "backendDispatchIndependentlyVerified": False,
            "nvtxRangesEmittedWhenAvailable": True,
        },
        "invariants": {
            "numpyFloat64IsNumericalOracle": True,
            "preferredBlasIsRequestNotKernelProof": True,
            "laneDoesNotCreateIndependentRetrievalVote": True,
            "evidenceAuthorizesMutation": False,
            "canonicalWritesAllowed": False,
        },
        "producerRevision": producer_revision,
    }


def _json_dump(value: Any) -> None:
    print(json.dumps(value, separators=(",", ":"), allow_nan=False))


def main() -> None:
    parser = argparse.ArgumentParser(prog="parent-atlas-gemm")
    parser.add_argument("--m", type=int, default=1024)
    parser.add_argument("--n", type=int, default=1024)
    parser.add_argument("--k", type=int, default=1024)
    parser.add_argument("--seed", type=lambda value: int(value, 0), default=0xA71A5)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--repeats", type=int, default=7)
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument("--attest", action="store_true")
    args = parser.parse_args()

    if args.attest:
        _json_dump({
            "schema": "atlas.rtx-cuda-attestation.v1",
            "cuda": cuda_attestation(),
            "canonicalWritesAllowed": False,
        })
        return

    receipt = run_gemm_suite(
        m=args.m,
        n=args.n,
        k=args.k,
        seed=args.seed,
        warmup=args.warmup,
        repeats=args.repeats,
        require_cuda=args.require_cuda,
    )
    _json_dump(receipt)
    if receipt["summary"]["failedLaneCount"]:
        raise SystemExit(2)
    if args.require_cuda and not receipt["cudaAttestation"].get("cudaAvailable", False):
        raise SystemExit(3)


if __name__ == "__main__":
    main()
