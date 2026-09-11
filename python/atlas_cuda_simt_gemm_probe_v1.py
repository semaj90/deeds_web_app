"""Read-only dedicated CUDA SIMT FP16 GEMM challenger for RTX/SM86.

This is intentionally separate from the cuTile probe.  PyTorch remains the
reference implementation; the challenger is an explicit CUDA SIMT RawKernel
(one thread computes one output element with FP32 accumulation).

No database/vector/cache/graph/model state is mutated.  The only optional
write is the derived JSON receipt requested with --output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import cupy as cp
import numpy as np
import torch


SIMT_GEMM_SRC = r'''
#include <cuda_fp16.h>
extern "C" __global__
void atlas_simt_gemm_f16(
    const half* __restrict__ a,
    const half* __restrict__ b,
    half* __restrict__ out,
    const int n)
{
    const int col = blockIdx.x * blockDim.x + threadIdx.x;
    const int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (row >= n || col >= n) return;

    float acc = 0.0f;
    for (int k = 0; k < n; ++k) {
        const float av = __half2float(a[row * n + k]);
        const float bv = __half2float(b[k * n + col]);
        acc = fmaf(av, bv, acc);
    }
    out[row * n + col] = __float2half_rn(acc);
}
'''

_SIMT_KERNEL = cp.RawKernel(SIMT_GEMM_SRC, "atlas_simt_gemm_f16")


def sha256_bytes(*chunks: bytes) -> str:
    digest = hashlib.sha256()
    for chunk in chunks:
        digest.update(chunk)
    return digest.hexdigest()


def array_sha256(value: np.ndarray) -> str:
    contiguous = np.ascontiguousarray(value)
    return sha256_bytes(contiguous.dtype.str.encode(), str(contiguous.shape).encode(), contiguous.tobytes())


def run_simt(a: cp.ndarray, b: cp.ndarray, *, block: int = 16) -> cp.ndarray:
    if a.ndim != 2 or b.ndim != 2 or a.shape != b.shape or a.shape[0] != a.shape[1]:
        raise ValueError("expected same-shape square 2-D matrices")
    if a.dtype != cp.float16 or b.dtype != cp.float16:
        raise ValueError("expected FP16 challenger inputs")
    n = int(a.shape[0])
    out = cp.empty((n, n), dtype=cp.float16)
    grid = ((n + block - 1) // block, (n + block - 1) // block, 1)
    threads = (block, block, 1)
    _SIMT_KERNEL(grid, threads, (a, b, out, np.int32(n)))
    return out


def synchronize() -> None:
    cp.cuda.runtime.deviceSynchronize()
    torch.cuda.synchronize()


def run(*, size: int, repeats: int, seed: int, block: int) -> dict[str, object]:
    if not torch.cuda.is_available():
        raise SystemExit("CUDA_UNAVAILABLE")
    if size <= 0 or repeats <= 0 or block <= 0:
        raise ValueError("size/repeats/block must be positive")

    rng = np.random.default_rng(seed)
    a_host = rng.standard_normal((size, size), dtype=np.float32).astype(np.float16)
    b_host = rng.standard_normal((size, size), dtype=np.float32).astype(np.float16)
    fixture_sha256 = sha256_bytes(
        f"seed={seed};shape={size}x{size};dtype=float16".encode(),
        a_host.tobytes(),
        b_host.tobytes(),
    )

    a_torch = torch.from_numpy(a_host.copy()).to(device="cuda", dtype=torch.float16)
    b_torch = torch.from_numpy(b_host.copy()).to(device="cuda", dtype=torch.float16)
    a_cupy = cp.asarray(a_host)
    b_cupy = cp.asarray(b_host)
    synchronize()

    compile_started = time.perf_counter()
    simt_first = run_simt(a_cupy, b_cupy, block=block)
    cp.cuda.runtime.deviceSynchronize()
    compile_and_first_ms = (time.perf_counter() - compile_started) * 1000.0

    reference_first = a_torch @ b_torch
    synchronize()

    simt_ms: list[float] = []
    reference_ms: list[float] = []
    simt_outputs: list[np.ndarray] = []
    reference_outputs: list[np.ndarray] = []

    for _ in range(repeats):
        started = time.perf_counter()
        simt_out = run_simt(a_cupy, b_cupy, block=block)
        cp.cuda.runtime.deviceSynchronize()
        simt_ms.append((time.perf_counter() - started) * 1000.0)
        simt_outputs.append(cp.asnumpy(simt_out))

        started = time.perf_counter()
        reference_out = a_torch @ b_torch
        torch.cuda.synchronize()
        reference_ms.append((time.perf_counter() - started) * 1000.0)
        reference_outputs.append(reference_out.detach().cpu().numpy())

    simt_np = simt_outputs[-1]
    reference_np = reference_outputs[-1]
    delta = np.abs(simt_np.astype(np.float32) - reference_np.astype(np.float32))
    reference_abs = np.maximum(np.abs(reference_np.astype(np.float32)), 1e-3)
    max_abs = float(delta.max(initial=0.0))
    max_rel = float((delta / reference_abs).max(initial=0.0))
    mean_abs = float(delta.mean())

    simt_checksums = [array_sha256(value) for value in simt_outputs]
    reference_checksums = [array_sha256(value) for value in reference_outputs]
    simt_deterministic = len(set(simt_checksums)) == 1
    reference_deterministic = len(set(reference_checksums)) == 1
    finite = bool(np.isfinite(simt_np).all() and np.isfinite(reference_np).all())

    # FP16 GEMM implementations are allowed bounded numeric drift because the
    # explicit SIMT kernel uses FP32 accumulation while the PyTorch reference
    # may select Tensor Core/library algorithms.  Keep the threshold explicit
    # in the receipt rather than hiding it in an assertion.
    thresholds = {"maxAbsoluteDelta": 0.5, "maxRelativeDelta": 0.10}
    parity = finite and max_abs <= thresholds["maxAbsoluteDelta"] and max_rel <= thresholds["maxRelativeDelta"]
    replay = simt_deterministic and reference_deterministic

    props = torch.cuda.get_device_properties(0)
    try:
        driver_version = cp.cuda.runtime.driverGetVersion()
    except Exception:
        driver_version = None
    try:
        runtime_version = cp.cuda.runtime.runtimeGetVersion()
    except Exception:
        runtime_version = None

    return {
        "schema": "atlas.cuda-simt-gemm-probe.v1",
        "status": "SIMT_CHALLENGER_BOUNDED_PARITY_PROVEN" if parity and replay else "BLOCKED_SIMT_CHALLENGER_PARITY",
        "challenger": {
            "kind": "CUDA_SIMT_RAW_KERNEL",
            "kernel": "atlas_simt_gemm_f16",
            "threadsPerBlock": [block, block, 1],
            "accumulator": "float32",
            "output": "float16",
        },
        "reference": {
            "kind": "PYTORCH_CUDA_MATMUL",
            "torch": torch.__version__,
            "torchCudaRuntime": torch.version.cuda,
        },
        "environment": {
            "gpu": torch.cuda.get_device_name(0),
            "computeCapability": list(torch.cuda.get_device_capability(0)),
            "cupy": cp.__version__,
            "cudaDriverVersionRaw": driver_version,
            "cudaRuntimeVersionRaw": runtime_version,
            "multiProcessorCount": int(props.multi_processor_count),
        },
        "fixture": {
            "seed": seed,
            "shape": [size, size, size],
            "dtype": "float16",
            "artifactKey": f"derived:sha256:{fixture_sha256}",
            "inputSha256": fixture_sha256,
        },
        "parity": {
            "finite": finite,
            "maxAbsoluteDelta": max_abs,
            "maxRelativeDelta": max_rel,
            "meanAbsoluteDelta": mean_abs,
            "thresholds": thresholds,
            "passed": parity,
        },
        "replay": {
            "repeats": repeats,
            "simtDeterministic": simt_deterministic,
            "referenceDeterministic": reference_deterministic,
            "simtOutputChecksums": simt_checksums,
            "referenceOutputChecksums": reference_checksums,
        },
        "timing": {
            "compileAndFirstMs": compile_and_first_ms,
            "simtWarmMs": simt_ms,
            "referenceWarmMs": reference_ms,
            "simtWarmMeanMs": sum(simt_ms) / len(simt_ms),
            "referenceWarmMeanMs": sum(reference_ms) / len(reference_ms),
        },
        "writes": False,
        "canonicalAuthority": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--seed", type=int, default=23)
    parser.add_argument("--block", type=int, default=16)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    result = run(size=args.size, repeats=args.repeats, seed=args.seed, block=args.block)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": result["schema"],
        "status": result["status"],
        "artifactKey": result["fixture"]["artifactKey"],
        "maxAbsoluteDelta": result["parity"]["maxAbsoluteDelta"],
        "maxRelativeDelta": result["parity"]["maxRelativeDelta"],
        "simtWarmMeanMs": result["timing"]["simtWarmMeanMs"],
        "referenceWarmMeanMs": result["timing"]["referenceWarmMeanMs"],
        "output": str(output_path),
    }, sort_keys=True))
    return 0 if result["status"] == "SIMT_CHALLENGER_BOUNDED_PARITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
