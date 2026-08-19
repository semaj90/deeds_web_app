#!/usr/bin/env python3
"""Parent Atlas cuTile capability/parity probe for Ampere SM86.

This is a challenger proof, not a canonical compute owner. It verifies that the
installed cuda-tile toolchain can launch a simple kernel on the active GPU and
produce the same result as a PyTorch/CuPy reference. Parent Atlas should only
route real feature kernels to cuTile after this environment proof plus a
shape-specific numerical/performance receipt.
"""
from __future__ import annotations

import json
import sys
from typing import Any


def report(status: str, **extra: Any) -> int:
    payload = {
        "schema": "atlas.cutile-sm86-probe.v1",
        "status": status,
        "canonicalWrites": False,
        **extra,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if status == "PROVEN_FIXTURE" else 1


def main() -> int:
    try:
        import cupy as cp
        import cuda.tile as ct
    except Exception as exc:
        return report("UNAVAILABLE", error=f"{type(exc).__name__}: {exc}")

    try:
        device = cp.cuda.Device()
        props = cp.cuda.runtime.getDeviceProperties(device.id)
        major = int(props["major"] if isinstance(props, dict) else props.major)
        minor = int(props["minor"] if isinstance(props, dict) else props.minor)
        compute_capability = f"{major}.{minor}"
    except Exception as exc:
        return report("DEVICE_PROBE_FAILED", error=f"{type(exc).__name__}: {exc}")

    # Parent Atlas workstation target is Ampere SM86; cuTile itself supports the
    # wider 8.x family, but this receipt should identify what actually ran.
    if major != 8:
        return report(
            "WRONG_ARCHITECTURE_FOR_WORKSTATION_PROOF",
            computeCapability=compute_capability,
            expectedFamily="8.x",
        )

    tile_size = 16

    @ct.kernel
    def vector_add(a, b, out, tile_n: ct.Constant[int]):
        pid = ct.bid(0)
        at = ct.load(a, index=(pid,), shape=(tile_n,))
        bt = ct.load(b, index=(pid,), shape=(tile_n,))
        ct.store(out, index=(pid,), tile=at + bt)

    try:
        n = 4096
        rng = cp.random.default_rng(0xA71A5)
        a = rng.random(n, dtype=cp.float32)
        b = rng.random(n, dtype=cp.float32)
        out = cp.zeros_like(a)
        grid = (ct.cdiv(n, tile_size), 1, 1)
        ct.launch(cp.cuda.get_current_stream(), grid, vector_add, (a, b, out, tile_size))
        cp.cuda.get_current_stream().synchronize()
        reference = a + b
        max_abs_error = float(cp.max(cp.abs(out - reference)).get())
    except Exception as exc:
        return report(
            "KERNEL_FAILED",
            computeCapability=compute_capability,
            error=f"{type(exc).__name__}: {exc}",
        )

    return report(
        "PROVEN_FIXTURE" if max_abs_error <= 1e-6 else "PARITY_FAILED",
        computeCapability=compute_capability,
        rows=n,
        dtype="float32",
        maxAbsError=max_abs_error,
        tolerance=1e-6,
        notes=[
            "cuTile is a specialized kernel challenger behind NativeComputePlanV1.",
            "This probe does not promote cuTile over cuBLASLt/LibTorch/Triton.",
            "Future kernels require representative-shape benchmarks and GPU lease accounting.",
        ],
    )


if __name__ == "__main__":
    sys.exit(main())
