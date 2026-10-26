"""cuTile toolchain smoke (vector add) for SM86, with CPU parity.

Separate from atlas_cuda_cutile_simt_gemm_probe_v1.py, which owns GEMM parity and timing.
This probe only proves that the TileIR toolchain launches a kernel and matches NumPy.

Default: import and version report only (no GPU work).
--run: launch the kernel once and compare against NumPy.

Usage (WSL2, isolated cuTile env):
    /home/james/.venvs/atlas-cutile-cu132/bin/python python/atlas_cuda_cutile_vecadd_smoke_v1.py
    /home/james/.venvs/atlas-cutile-cu132/bin/python python/atlas_cuda_cutile_vecadd_smoke_v1.py --run
"""

from __future__ import annotations

import argparse
import importlib.metadata as md
import json

import numpy as np

TILE = 1024
N = 1 << 20


def versions() -> dict[str, str]:
    out: dict[str, str] = {}
    for dist in ("cuda-tile", "cupy-cuda13x", "nvidia-cuda-tileiras"):
        try:
            out[dist] = md.version(dist)
        except md.PackageNotFoundError:
            out[dist] = "NOT_INSTALLED"
    out["numpy"] = np.__version__
    return out


def run_smoke() -> dict[str, object]:
    import cupy as cp
    import cuda.tile as ct

    @ct.kernel
    def vec_add(a, b, c, tile: ct.Constant[int]):
        bid = ct.bid(0)
        ta = ct.load(a, (bid,), (tile,))
        tb = ct.load(b, (bid,), (tile,))
        ct.store(c, (bid,), ta + tb)

    rng = np.random.default_rng(0)
    a_h = rng.standard_normal(N, dtype=np.float32)
    b_h = rng.standard_normal(N, dtype=np.float32)
    a = cp.asarray(a_h)
    b = cp.asarray(b_h)
    c = cp.zeros_like(a)
    ct.launch(cp.cuda.get_current_stream(), (N // TILE, 1, 1), vec_add, (a, b, c, TILE))
    cp.cuda.Stream.null.synchronize()
    got = cp.asnumpy(c)
    max_abs = float(np.max(np.abs(got - (a_h + b_h))))
    free, total = cp.cuda.Device(0).mem_info
    return {
        "n": N,
        "tile": TILE,
        "max_abs_err_vs_numpy": max_abs,
        "pass": bool(np.allclose(got, a_h + b_h, rtol=0, atol=1e-6)),
        "gpu_mem_free_mib_after": round(free / 2**20),
        "gpu_mem_total_mib": round(total / 2**20),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", action="store_true", help="launch the GPU kernel (requires VRAM headroom)")
    args = parser.parse_args()

    report: dict[str, object] = {
        "schema": "atlas.cuda-cutile-vecadd-smoke.v1",
        "probe": "CUTILE_GPU_SMOKE",
        "versions": versions(),
    }
    if not args.run:
        report["mode"] = "IMPORT_ONLY"
        try:
            import cuda.tile  # noqa: F401
            report["cuda_tile_import"] = "OK"
        except Exception as exc:  # report, do not hide
            report["cuda_tile_import"] = f"FAIL: {type(exc).__name__}: {exc}"
        print(json.dumps(report, indent=2))
        return 0

    report["mode"] = "GPU_RUN"
    result = run_smoke()
    report.update(result)
    report["status"] = "PASS" if result["pass"] else "FAIL"
    print(json.dumps(report, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
