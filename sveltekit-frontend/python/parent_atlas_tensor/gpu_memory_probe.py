"""BITFROST-GPU-MEMORY-ADMISSION-01 (stage C) -- CUDA observation probe.

Reads torch.cuda.mem_get_info() (the PyTorch wrapper for cudaMemGetInfo) and
prints ONE JSON line matching a GpuMemoryObservationV1 `cudaContextFree`
reading. Read-only: no allocation, no tensor materialization, no writes.

This is deliberately a standalone script, not routed through
unified_residency_stdio.py's length-framed binary protocol -- that framing
exists specifically for transferring a numeric tile buffer alongside a
descriptor, which does not apply here (there is no payload, only a memory
query). Reuses the SAME WSL2/venv invocation convention as the existing host
harness (scripts/atlas/prove-unified-residency-stdio-handoff-v1.mjs), not a
new transport mechanism.

Usage: python -m parent_atlas_tensor.gpu_memory_probe
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    try:
        import torch  # local import: keep failure isolated to CUDA absence, not module import
    except Exception as exc:  # pragma: no cover - environment-dependent
        print(json.dumps({
            "schema": "atlas.gpu-memory-observation.v1",
            "ok": False,
            "error": f"TORCH_IMPORT_FAILED:{exc}",
            "writesPerformed": False,
        }))
        return 1

    if not torch.cuda.is_available():
        print(json.dumps({
            "schema": "atlas.gpu-memory-observation.v1",
            "ok": False,
            "error": "CUDA_NOT_AVAILABLE",
            "writesPerformed": False,
        }))
        return 1

    free_bytes, total_bytes = torch.cuda.mem_get_info()
    device_name = torch.cuda.get_device_name(0)

    print(json.dumps({
        "schema": "atlas.gpu-memory-observation.v1",
        "ok": True,
        "cudaContextFree": {"value": int(free_bytes), "source": "cuda-context"},
        "cudaContextTotal": int(total_bytes),
        "deviceLabel": device_name,
        "torchVersion": torch.__version__,
        "writesPerformed": False,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
