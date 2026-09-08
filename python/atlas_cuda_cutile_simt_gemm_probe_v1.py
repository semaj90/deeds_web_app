"""Read-only cuTile versus PyTorch SIMT FP16 GEMM probe for SM86."""

from __future__ import annotations

import argparse
import json
import time

import cuda.tile as ct
import torch


ConstInt = ct.Constant[int]


@ct.kernel
def matmul_kernel(a, b, out, tile_m: ConstInt, tile_n: ConstInt, tile_k: ConstInt):
    row_tile = ct.bid(0)
    col_tile = ct.bid(1)
    tiles_k = ct.num_tiles(a, axis=1, shape=(tile_m, tile_k))
    accumulator = ct.full((tile_m, tile_n), 0.0, dtype=ct.float32)
    for k_tile in range(tiles_k):
        left = ct.load(
            a,
            index=(row_tile, k_tile),
            shape=(tile_m, tile_k),
            padding_mode=ct.PaddingMode.ZERO,
        )
        right = ct.load(
            b,
            index=(k_tile, col_tile),
            shape=(tile_k, tile_n),
            padding_mode=ct.PaddingMode.ZERO,
        )
        accumulator = ct.mma(left, right, accumulator)
    ct.store(out, index=(row_tile, col_tile), tile=ct.astype(accumulator, out.dtype))


def cutile_matmul(a: torch.Tensor, b: torch.Tensor, *, tile: int = 32) -> torch.Tensor:
    if a.ndim != 2 or b.ndim != 2 or a.shape[1] != b.shape[0]:
        raise ValueError("expected compatible 2-D matrices")
    if not a.is_cuda or not b.is_cuda or a.dtype != torch.float16 or b.dtype != torch.float16:
        raise ValueError("expected CUDA FP16 inputs")
    if a.device != b.device:
        raise ValueError("inputs must share a CUDA device")
    m, k = a.shape
    _, n = b.shape
    out = torch.empty((m, n), device=a.device, dtype=a.dtype)
    grid = ((m + tile - 1) // tile, (n + tile - 1) // tile)
    ct.launch(torch.cuda.current_stream(), grid, matmul_kernel, (a, b, out, tile, tile, tile))
    return out


def run(*, size: int, repeats: int) -> dict[str, object]:
    if not torch.cuda.is_available():
        raise SystemExit("CUDA_UNAVAILABLE")
    torch.manual_seed(23)
    a = torch.randn((size, size), device="cuda", dtype=torch.float16)
    b = torch.randn((size, size), device="cuda", dtype=torch.float16)
    torch.cuda.synchronize()

    compile_started = time.perf_counter()
    cutile_output = cutile_matmul(a, b)
    torch.cuda.synchronize()
    compile_and_first_ms = (time.perf_counter() - compile_started) * 1000
    simt_output = a @ b
    torch.cuda.synchronize()

    cutile_ms: list[float] = []
    simt_ms: list[float] = []
    for _ in range(repeats):
        started = time.perf_counter()
        cutile_output = cutile_matmul(a, b)
        torch.cuda.synchronize()
        cutile_ms.append((time.perf_counter() - started) * 1000)

        started = time.perf_counter()
        simt_output = a @ b
        torch.cuda.synchronize()
        simt_ms.append((time.perf_counter() - started) * 1000)

    delta = (cutile_output.float() - simt_output.float()).abs()
    reference = simt_output.float().abs().clamp_min(1e-6)
    max_delta = float(delta.max().item())
    max_relative_delta = float((delta / reference).max().item())
    return {
        "schema": "atlas.cuda-cutile-simt-gemm-probe.v1",
        "status": "CUTILE_SIMT_GEMM_FINITE_PARITY_PROVEN" if (
            bool(torch.isfinite(cutile_output).all().item())
            and bool(torch.isfinite(simt_output).all().item())
            and max_relative_delta <= 0.05
        ) else "BLOCKED_CUTILE_SIMT_GEMM_PARITY",
        "environment": {
            "torch": torch.__version__,
            "torchCuda": torch.version.cuda,
            "cuTile": getattr(ct, "__version__", "imported"),
            "gpu": torch.cuda.get_device_name(0),
            "computeCapability": list(torch.cuda.get_device_capability(0)),
        },
        "fixture": {
            "shape": [size, size, size],
            "dtype": "float16",
            "cutileFinite": bool(torch.isfinite(cutile_output).all().item()),
            "simtFinite": bool(torch.isfinite(simt_output).all().item()),
            "maxAbsoluteDelta": max_delta,
            "maxRelativeDelta": max_relative_delta,
        },
        "timing": {
            "repeats": repeats,
            "cutileCompileAndFirstMs": compile_and_first_ms,
            "cutileWarmMs": cutile_ms,
            "simtWarmMs": simt_ms,
            "cutileWarmMeanMs": sum(cutile_ms) / len(cutile_ms),
            "simtWarmMeanMs": sum(simt_ms) / len(simt_ms),
        },
        "cudaPeakMiB": round(torch.cuda.max_memory_allocated() / 1024 / 1024, 3),
        "writes": False,
        "canonicalAuthority": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=str, required=True)
    args = parser.parse_args()
    result = run(size=args.size, repeats=args.repeats)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({
        "schema": result["schema"],
        "status": result["status"],
        "cutileWarmMeanMs": result["timing"]["cutileWarmMeanMs"],
        "simtWarmMeanMs": result["timing"]["simtWarmMeanMs"],
        "maxAbsoluteDelta": result["fixture"]["maxAbsoluteDelta"],
        "maxRelativeDelta": result["fixture"]["maxRelativeDelta"],
        "output": args.output,
    }, sort_keys=True))
    return 0 if result["status"] == "CUTILE_SIMT_GEMM_FINITE_PARITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
