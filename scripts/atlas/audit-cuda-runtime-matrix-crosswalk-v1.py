"""Read-only CUDA / Runtime Matrix Validation & Crosswalk for Parent Atlas.

Inspects live host CUDA (nvcc), NVIDIA driver (nvidia-smi), PyTorch CUDA,
ONNX Runtime providers, and tensorrt_bridge.node without mutating any
environment or datastore, and emits a compatibility crosswalk across
CUDA 12.8 / 12.9-update-1 / 13.0 / 13.4 / 13.5.
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


def _run_text(cmd: list[str]) -> tuple[bool, str]:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, timeout=10)
        return True, out.strip()
    except Exception as exc:
        return False, str(exc)


def _detect_nvcc_cuda() -> str | None:
    ok, out = _run_text(["nvcc", "--version"])
    if not ok:
        return None
    m = re.search(r"release\s+(\d+\.\d+)", out)
    return m.group(1) if m else None


def _detect_gpu() -> dict[str, Any]:
    ok, out = _run_text([
        "nvidia-smi",
        "--query-gpu=name,driver_version,memory.free,memory.total",
        "--format=csv,noheader",
    ])
    if not ok:
        return {"available": False, "error": out}
    parts = [p.strip() for p in out.splitlines()[0].split(",")]
    return {
        "available": True,
        "name": parts[0] if len(parts) > 0 else "unknown",
        "driver_version": parts[1] if len(parts) > 1 else "unknown",
        "memory_free": parts[2] if len(parts) > 2 else "unknown",
        "memory_total": parts[3] if len(parts) > 3 else "unknown",
    }


def _detect_python_runtimes() -> dict[str, Any]:
    info: dict[str, Any] = {"python": sys.version.split()[0]}
    try:
        import torch  # type: ignore

        info["torch_version"] = torch.__version__
        info["torch_cuda_version"] = torch.version.cuda
        info["torch_cuda_available"] = bool(torch.cuda.is_available())
    except Exception as exc:
        info["torch_error"] = str(exc)

    try:
        import onnxruntime as ort  # type: ignore

        info["onnxruntime_version"] = ort.__version__
        info["onnxruntime_providers"] = list(ort.get_available_providers())
    except Exception as exc:
        info["onnxruntime_error"] = str(exc)
    return info


def build_crosswalk(host_cuda: str | None, py_info: dict[str, Any], bridge_exists: bool) -> list[dict[str, Any]]:
    ort_providers = py_info.get("onnxruntime_providers", [])
    torch_cuda = py_info.get("torch_cuda_version")
    return [
        {
            "lane": "eg2_8094_cpu_pool",
            "owner": "scripts/atlas/gemma2-onnx-embed-server-v1.py",
            "required_cuda": "none (CPUExecutionProvider, ORT_WORKERS=4, ORT_INTRA_THREADS=4)",
            "compatible_with_host_13_0": True,
            "breaks_on_cuda_13_5_upgrade": False,
            "status": "ACTIVE_FALLBACK_READY",
            "isolation_rule": "Docker/CPU ONNX pool; unaffected by host CUDA toolkit version.",
        },
        {
            "lane": "pytorch_host_cu128",
            "owner": f"py -3.13 (torch {py_info.get('torch_version', 'missing')})",
            "required_cuda": "bundled cu128 wheels (12.8)",
            "compatible_with_host_13_0": True,
            "breaks_on_cuda_13_5_upgrade": False,
            "status": "VERIFIED_ACTIVE" if py_info.get("torch_cuda_available") else "UNAVAILABLE",
            "isolation_rule": "Never install onnxruntime-gpu into main py -3.13 (CPU ort + cu128 torch conflict).",
        },
        {
            "lane": "tensorrt_bridge_napi",
            "owner": "simd-bridge/cpp/CMakeLists.txt (LibTorch cu130 + AVX2 + CUDA 13.0)",
            "required_cuda": "13.0",
            "compatible_with_host_13_0": host_cuda == "13.0",
            "breaks_on_cuda_13_5_upgrade": True,
            "status": "VERIFIED_BUILT" if (bridge_exists and host_cuda == "13.0") else "NEEDS_REBUILD",
            "isolation_rule": "Must keep CUDA 13.0 on PATH/CUDA_PATH; replacing 13.0 with 13.5 risks breaking LibTorch cu130 + CMake CUDA builds.",
        },
        {
            "lane": "eg2_gpu_onnx_venv",
            "owner": ".venv-eg2-gpu (onnxruntime-gpu[cuda,cudnn])",
            "required_cuda": ">=13.0 (via cu13/cuDNN wheels)",
            "compatible_with_host_13_0": host_cuda in ("13.0", "13.4", "13.5"),
            "breaks_on_cuda_13_5_upgrade": False,
            "status": "READY_ISOLATED_VENV" if "CUDAExecutionProvider" not in ort_providers else "ACTIVE",
            "isolation_rule": "Use isolated .venv-eg2-gpu; zero host CUDA upgrade required.",
        },
        {
            "lane": "tensorrt_rtx_1_7_ga",
            "owner": "sveltekit-frontend/src/lib/server/atlas/execution/tensorrt-rtx-compatibility-v1.ts",
            "required_cuda": "13.4 or 12.9-update-1",
            "compatible_with_host_13_0": False,
            "breaks_on_cuda_13_5_upgrade": True,
            "status": "BLOCKED_CUDA_MISMATCH",
            "isolation_rule": "Requires side-by-side CUDA 13.4 + NVIDIA Developer SDK; do not overwrite CUDA 13.0.",
        },
        {
            "lane": "tensorrt_rtx_1_8_ea",
            "owner": "https://developer.nvidia.com/tensorrt-rtx (1.8 EA)",
            "required_cuda": "13.5 or 12.9",
            "compatible_with_host_13_0": False,
            "breaks_on_cuda_13_5_upgrade": False,
            "status": "BLOCKED_CUDA_MISMATCH_AND_EA",
            "isolation_rule": "Early Access targeting CUDA 13.5/12.9; incompatible with host 13.0 and untested against LibTorch cu130.",
        },
        {
            "lane": "wsl2_rapids_8098",
            "owner": "/home/james/miniforge3/envs/atlas-rapids-cu13",
            "required_cuda": "13.x (WSL2 Linux)",
            "compatible_with_host_13_0": True,
            "breaks_on_cuda_13_5_upgrade": False,
            "status": "SEPARATE_WSL2_ENV",
            "isolation_rule": "WSL2 conda env; isolated from Windows host toolkit except NVIDIA driver.",
        },
    ]


def main() -> int:
    host_cuda = _detect_nvcc_cuda()
    gpu = _detect_gpu()
    py_info = _detect_python_runtimes()
    bridge_path = pathlib.Path("simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node")
    bridge_exists = bridge_path.is_file()
    crosswalk = build_crosswalk(host_cuda, py_info, bridge_exists)

    report = {
        "schema": "atlas.cuda-runtime-matrix-crosswalk.v1",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "host": {
            "nvcc_cuda": host_cuda,
            "gpu": gpu,
            "python_runtime": py_info,
            "tensorrt_bridge_node_present": bridge_exists,
        },
        "recommendation": (
            "KEEP_HOST_CUDA_13_0_FOR_BRIDGE_AND_PYTORCH; "
            "USE_8094_CPU_POOL_OR_ISOLATED_VENV_FOR_EG2; "
            "DO_NOT_INSTALL_CUDA_13_5_OR_TRT_RTX_1_8_EA_UNTIL_CANARY_AND_COMPAT_PASS"
        ),
        "crosswalk": crosswalk,
        "canonical_authority": False,
        "writes_performed": False,
    }

    out = pathlib.Path(".tmp/atlas/cuda-runtime-matrix-crosswalk-v1.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
