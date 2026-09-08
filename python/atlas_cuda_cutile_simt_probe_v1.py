"""Read-only SM86 cuTile/SIMT smoke probe.

This deliberately proves only the isolated runtime and a tiny kernel/GEMM pair.
It does not load AtlasGemma, write artifacts, or alter canonical data.
"""

from __future__ import annotations

import json
import time

import cupy as cp
import torch
import cuda.tile as ct


@ct.kernel
def vector_add_kernel(a, b, result):
    block_id = ct.bid(0)
    a_tile = ct.load(a, index=(block_id,), shape=(16,))
    b_tile = ct.load(b, index=(block_id,), shape=(16,))
    ct.store(result, index=(block_id,), tile=a_tile + b_tile)


def main() -> None:
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is unavailable")

    n = 1024
    x = cp.arange(n, dtype=cp.float32)
    y = cp.ones(n, dtype=cp.float32)
    z = cp.zeros_like(x)
    grid = (ct.cdiv(n, 16), 1, 1)

    started = time.perf_counter()
    ct.launch(cp.cuda.get_current_stream(), grid, vector_add_kernel, (x, y, z))
    cp.cuda.Stream.null.synchronize()
    cutile_ms = (time.perf_counter() - started) * 1000
    cutile_ok = bool(cp.allclose(z, x + y))

    torch.manual_seed(7)
    started = time.perf_counter()
    a = torch.randn((512, 256), device="cuda", dtype=torch.float16)
    b = torch.randn((256, 256), device="cuda", dtype=torch.float16)
    torch.cuda.synchronize()
    c = a @ b
    torch.cuda.synchronize()
    simt_ms = (time.perf_counter() - started) * 1000
    simt_ok = bool(torch.isfinite(c).all().item())

    print(json.dumps({
        "schema": "atlas.cuda-cutile-simt-probe.v1",
        "torch": torch.__version__,
        "torchCuda": torch.version.cuda,
        "cudaAvailable": True,
        "gpu": torch.cuda.get_device_name(0),
        "capability": list(torch.cuda.get_device_capability(0)),
        "cuTile": getattr(ct, "__version__", "imported"),
        "tileCompiler": "13.2.78",
        "cuTileVectorAdd": {
            "shape": [n],
            "finiteAndCorrect": cutile_ok,
            "latencyMs": round(cutile_ms, 3),
        },
        "simtTorchFp16Gemm": {
            "shape": [512, 256, 256],
            "finite": simt_ok,
            "latencyMs": round(simt_ms, 3),
        },
        "peakTorchMiB": round(torch.cuda.max_memory_allocated() / 1024 / 1024, 2),
        "writes": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
