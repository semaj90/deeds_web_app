#!/usr/bin/env python3
"""Verify active Python + Torch + TensorRT-LLM environment against ENGINE_BUILD_BASELINE.json.
Exits non-zero if mismatch (unless ALLOW_VERSION_DRIFT=1).
"""
from __future__ import annotations
import json, sys, subprocess, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "ENGINE_BUILD_BASELINE.json"

FAIL = 0

def read_baseline():
    if not BASELINE_PATH.exists():
        print("ERROR baseline manifest missing:", BASELINE_PATH)
        sys.exit(2)
    return json.loads(BASELINE_PATH.read_text())


def get_version(cmd: list[str]) -> str | None:
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT).strip()
        return out
    except Exception:
        return None


def main():
    bl = read_baseline()
    allow_drift = os.environ.get("ALLOW_VERSION_DRIFT") == "1"

    print("Baseline Manifest:")
    for k,v in bl.items():
        print(f"  {k}: {v}")
    print()

    # Python
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
    if not py_ver.startswith(bl['python']):
        print(f"❌ Python mismatch: running {py_ver}, expected {bl['python']}.x")
        global FAIL; FAIL = 1
    else:
        print(f"✅ Python {py_ver} OK")

    # Torch
    try:
        import torch  # type: ignore
        torch_version = torch.__version__
        print(f"Detected torch: {torch_version}")
        if torch_version != bl['torch_version']:
            print(f"❌ Torch version mismatch (expected {bl['torch_version']})")
            FAIL = 1
        if not torch.cuda.is_available():
            print("❌ CUDA not available in torch")
            FAIL = 1
        else:
            cap = torch.cuda.get_device_capability()
            name = torch.cuda.get_device_name(0)
            print(f"✅ CUDA device: {name} (cc {cap[0]}.{cap[1]})")
    except ImportError:
        print("❌ Torch not installed")
        FAIL = 1

    # TensorRT-LLM
    try:
        import tensorrt_llm  # type: ignore
        trt_ver = getattr(tensorrt_llm, "__version__", "unknown")
        print(f"Detected tensorrt-llm: {trt_ver}")
        if trt_ver != bl['tensorrt_llm_version']:
            print(f"❌ tensorrt-llm version mismatch (expected {bl['tensorrt_llm_version']})")
            FAIL = 1
    except ImportError:
        print("❌ tensorrt-llm not installed")
        FAIL = 1

    # Check path location (WSL performance guard)
    cwd = pathlib.Path.cwd()
    if str(cwd).startswith('/mnt/c'):
        print(f"❌ Workspace on /mnt/c path ({cwd}) — move to Linux FS for performance.")
        FAIL = 1
    else:
        print(f"✅ Workspace on native Linux FS: {cwd}")

    # nvidia-smi CUDA runtime
    nsmi = get_version(["bash", "-lc", "nvidia-smi | head -n 3 || true"])
    if nsmi:
        print("nvidia-smi snippet:\n" + nsmi)
    else:
        print("⚠️ Could not invoke nvidia-smi (driver not visible?)")

    if FAIL:
        if allow_drift:
            print("WARNING: Version drift allowed (ALLOW_VERSION_DRIFT=1). Proceeding with warnings.")
            return 0
        print("\nBUILD BLOCKED: Environment does not match baseline.")
        print("Set ALLOW_VERSION_DRIFT=1 to bypass (not recommended) or update ENGINE_BUILD_BASELINE.json after validation.")
        return 1

    print("\n✅ Environment matches baseline; safe to build engines.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
