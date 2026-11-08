# scripts/audit/turbovec_314t_gate_audit.py
import hashlib
import json
import os
import sys
import sysconfig
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

EXPECTED_WIN_WHEEL_NAME = "turbovec-0.3.0-cp39-abi3-win_amd64.whl"
EXPECTED_WIN_WHEEL_BYTES = 609077
EXPECTED_WIN_WHEEL_SHA256 = "76f06ea817c12796005eb45c2a21c0cf0b65cc3f0f49dbe4b0e29145673367f0"

# Secondary accepted receipt for verified Windows recompile
RECOMPILED_WIN_WHEEL_BYTES = 609038
RECOMPILED_WIN_WHEEL_SHA256 = "49278c29cc490c066a75f2f7764aeeabc17d7960f857274f7e7c289f29c082e0"


def check_historical_wheel(repo_root: Path) -> dict:
    search_paths = [
        repo_root / "turbovec" / "target" / "wheels" / EXPECTED_WIN_WHEEL_NAME,
        repo_root / "sveltekit-frontend" / "vendor" / "wheels" / EXPECTED_WIN_WHEEL_NAME,
        repo_root / "sveltekit-frontend" / ".docker-build" / "vendor" / "wheels" / EXPECTED_WIN_WHEEL_NAME,
        repo_root / "dist" / EXPECTED_WIN_WHEEL_NAME,
    ]
    wheel_path = None
    for p in search_paths:
        if p.exists():
            wheel_path = p
            break

    if not wheel_path:
        for root, dirs, files in os.walk(repo_root):
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '.svelte-kit')]
            if EXPECTED_WIN_WHEEL_NAME in files:
                wheel_path = Path(root) / EXPECTED_WIN_WHEEL_NAME
                break

    if not wheel_path:
        return {"status": "NOT_FOUND", "expected": EXPECTED_WIN_WHEEL_NAME}

    raw = wheel_path.read_bytes()
    sha256 = hashlib.sha256(raw).hexdigest().lower()
    size_ok = (len(raw) == EXPECTED_WIN_WHEEL_BYTES) or (len(raw) == RECOMPILED_WIN_WHEEL_BYTES)
    hash_ok = (sha256 == EXPECTED_WIN_WHEEL_SHA256) or (sha256 == RECOMPILED_WIN_WHEEL_SHA256)
    receipt_type = "legacy_ci" if sha256 == EXPECTED_WIN_WHEEL_SHA256 else ("recompiled_win64" if sha256 == RECOMPILED_WIN_WHEEL_SHA256 else "unrecognized")

    return {
        "status": "PASS" if (size_ok and hash_ok) else "FAIL",
        "path": str(wheel_path.relative_to(repo_root)),
        "byteSize": len(raw),
        "expectedByteSize": EXPECTED_WIN_WHEEL_BYTES,
        "recompiledByteSize": RECOMPILED_WIN_WHEEL_BYTES,
        "sha256": sha256,
        "hashMatched": hash_ok,
        "receiptType": receipt_type,
        "abiTag": "cp39-abi3 (incompatible with cp314t free-threading; requires cp314-cp314t)"
    }


def check_gil_and_free_threading() -> dict:
    py_gil_disabled = sysconfig.get_config_var("Py_GIL_DISABLED")
    gil_enabled_before = sys._is_gil_enabled() if hasattr(sys, "_is_gil_enabled") else True

    turbovec_mod = None
    import_error = None
    try:
        import turbovec as tb
        turbovec_mod = getattr(tb, "__file__", "built-in")
        turbovec_ver = getattr(tb, "__version__", "unknown")
    except Exception as exc:
        import_error = str(exc)
        turbovec_ver = None

    gil_enabled_after = sys._is_gil_enabled() if hasattr(sys, "_is_gil_enabled") else True

    is_314t_compliant = (
        py_gil_disabled == 1
        and (not gil_enabled_before)
        and (not gil_enabled_after)
        and turbovec_mod is not None
    )

    return {
        "status": "PASS" if is_314t_compliant else ("BLOCKED_NOT_314T_ENV" if py_gil_disabled != 1 else "FAIL"),
        "pythonVersion": sys.version,
        "Py_GIL_DISABLED": py_gil_disabled,
        "gilEnabledBeforeImport": gil_enabled_before,
        "gilEnabledAfterImport": gil_enabled_after,
        "turbovecModulePath": turbovec_mod,
        "installedVersion": turbovec_ver,
        "importError": import_error
    }


def check_pytorch_and_sm86() -> dict:
    try:
        import torch
        cuda_ok = torch.cuda.is_available()
        cap = torch.cuda.get_device_capability(0) if cuda_ok else None
        return {
            "status": "PASS" if (cuda_ok and cap == (8, 6)) else "PARTIAL",
            "torchVersion": torch.__version__,
            "cudaRuntime": torch.version.cuda,
            "cudaAvailable": cuda_ok,
            "deviceName": torch.cuda.get_device_name(0) if cuda_ok else None,
            "capability": cap,
            "allocatedBytes": torch.cuda.memory_allocated(0) if cuda_ok else 0,
            "reservedBytes": torch.cuda.memory_reserved(0) if cuda_ok else 0
        }
    except Exception as exc:
        return {"status": "NOT_RUN", "error": str(exc)}


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    report = {
        "gate": "TURBOVEC_314T_AND_EMBEDDINGGEMMA2_READONLY_AUDIT",
        "historicalWinWheel": check_historical_wheel(root),
        "freeThreadingAndGil": check_gil_and_free_threading(),
        "pytorchSm86": check_pytorch_and_sm86(),
    }
    out_path = root / ".tmp" / "atlas" / "turbovec-314t-audit-receipt.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
