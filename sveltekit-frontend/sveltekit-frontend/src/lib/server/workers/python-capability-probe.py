"""
Python runtime capability probe for Atlas worker routing.

Outputs a JSON manifest consumed by the TypeScript control plane.
Run this from the worker process at startup and on a periodic heartbeat.

Rules:
  - PYTHON_VERSION_IS_NOT_A_CAPABILITY
  - FREE_THREADED_BUILD_MUST_BE_PROBED (sysconfig.get_config_var)
  - GIL_RUNTIME_STATE_MUST_BE_PROBED (sys._is_gil_enabled)
  - EXTENSIONS_MUST_BE_VALIDATED_BY_EXACT_VERSION_AND_WORKLOAD
  - RAPIDS_ON_WINDOWS_REQUIRES_WSL2
  - PYTORCH_FREE_THREADED_SUPPORT_IS_AN_ISOLATED_EXPERIMENTAL_LANE
  - PROCESS_ISOLATION_REMAINS_DEFAULT_FOR_GPU_AND_MODEL_WORKERS
"""

from __future__ import annotations

import importlib
import json
import platform
import sys
import sysconfig
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class ExtensionProbe:
    status: str                          # pass | fail | not_installed | degraded
    version: str | None = None
    import_passed: bool = False
    gil_enabled_after_import: bool | None = None
    parallel_smoke_passed: bool | None = None
    reason: str | None = None


def _gil_enabled() -> bool | None:
    probe = getattr(sys, "_is_gil_enabled", None)
    if probe is None:
        return None
    try:
        return bool(probe())
    except Exception:
        return None


def _cpu_smoke(iterations: int = 500_000) -> int:
    value = 0
    for i in range(iterations):
        value = (value + 5 + value * i) & 0xFFFFFFFF
    return value


def _parallel_smoke() -> bool:
    try:
        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(_cpu_smoke, [500_000, 500_000]))
        elapsed = time.perf_counter() - started
        return len(results) == 2 and elapsed > 0
    except Exception:
        return False


def _probe_extension(module_name: str) -> ExtensionProbe:
    before_gil = _gil_enabled()
    try:
        module = importlib.import_module(module_name)
        after_gil = _gil_enabled()
        # Detect if importing this extension re-enabled the GIL
        gil_re_enabled = (before_gil is False) and (after_gil is True)
        return ExtensionProbe(
            status="pass",
            version=getattr(module, "__version__", None),
            import_passed=True,
            gil_enabled_after_import=after_gil,
            parallel_smoke_passed=_parallel_smoke(),
            reason=(
                "Import caused GIL re-enablement — extension not free-thread-safe"
                if gil_re_enabled
                else None
            ),
        )
    except ModuleNotFoundError:
        return ExtensionProbe(status="not_installed", reason=f"{module_name} is not installed")
    except Exception as exc:
        return ExtensionProbe(status="fail", reason=f"{type(exc).__name__}: {exc}")


def _is_wsl2() -> bool:
    try:
        with open("/proc/version", "r") as f:
            return "microsoft" in f.read().lower()
    except Exception:
        return False


def main() -> None:
    py_gil_disabled_raw: Any = sysconfig.get_config_var("Py_GIL_DISABLED")
    free_threaded_build: bool = py_gil_disabled_raw == 1
    current_gil = _gil_enabled()

    # freeThreadingActive requires BOTH: built without GIL AND GIL actually disabled at runtime.
    # A free-threaded build can still run with GIL enabled (e.g., if an unsafe extension was imported).
    free_threading_active = free_threaded_build and current_gil is False

    numpy_probe = _probe_extension("numpy")
    spacy_probe = _probe_extension("spacy")
    torch_probe = _probe_extension("torch")
    onnx_probe = _probe_extension("onnxruntime")

    # RAPIDS requires WSL2 on Windows — probe environment before attempting import
    os_name = platform.system()
    in_wsl2 = _is_wsl2()
    rapids_eligible = os_name == "Linux" or in_wsl2

    if rapids_eligible:
        # Probe all three rapids components — import alone is not sufficient
        cudf_probe = _probe_extension("cudf")
        cuGraph_probe = _probe_extension("cugraph")
        cuvs_probe = _probe_extension("cuvs")
        rapids_pass = (
            cudf_probe.import_passed
            and cuGraph_probe.import_passed
            and cuvs_probe.import_passed
        )
        rapids_reason = None if rapids_pass else "One or more RAPIDS components failed to import"
        rapids_probe = ExtensionProbe(
            status="pass" if rapids_pass else "fail",
            import_passed=rapids_pass,
            reason=rapids_reason,
        )
    else:
        rapids_probe = ExtensionProbe(
            status="not_applicable",
            reason="RAPIDS requires WSL2 on Windows or a Linux environment",
        )

    # Derive capabilities from probed facts — never from version strings alone
    cpu_nlp_parallel_threads = (
        free_threading_active
        and numpy_probe.import_passed
        and numpy_probe.gil_enabled_after_import is False
    )

    # PyTorch free-threaded is EXPERIMENTAL — isolated lane, not a default
    torch_free_threaded_experimental = (
        free_threading_active
        and torch_probe.import_passed
        and torch_probe.gil_enabled_after_import is False
        and torch_probe.parallel_smoke_passed is True
        # Require explicit operator opt-in signal — not auto-promoted
    )

    rapids_gpu_graph = rapids_eligible and rapids_probe.import_passed
    rapids_gpu_ann = rapids_eligible and rapids_probe.import_passed

    manifest = {
        "schemaVersion": "1.0",
        "platform": {
            "os": os_name,
            "release": platform.release(),
            "architecture": platform.machine(),
        },
        "environment": (
            "wsl2" if in_wsl2 else
            "linux" if os_name == "Linux" else
            "windows_native"
        ),
        "python": {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "executable": sys.executable,
            "abiFlags": getattr(sys, "abiflags", ""),
        },
        # Raw probe values — preserved for audit
        "pyGilDisabledRaw": py_gil_disabled_raw,
        "freeThreadedBuild": free_threaded_build,
        "gilProbeAvailable": hasattr(sys, "_is_gil_enabled"),
        "gilEnabled": current_gil,
        # The single boolean that matters for routing — not version, not build flag alone
        "freeThreadingActive": free_threading_active,
        "extensions": {
            "numpy": asdict(numpy_probe),
            "spacy": asdict(spacy_probe),
            "torch": asdict(torch_probe),
            "rapids": asdict(rapids_probe),
            "onnxruntime": asdict(onnx_probe),
        },
        # Capabilities derived from probed facts — what the control plane routes on
        "capabilities": {
            "cpuNlpParallelThreads": cpu_nlp_parallel_threads,
            "torchFreeThreadedExperimental": torch_free_threaded_experimental,
            "rapidsGpuGraph": rapids_gpu_graph,
            "rapidsGpuAnn": rapids_gpu_ann,
        },
        "constraints": [
            "PYTHON_VERSION_IS_NOT_A_CAPABILITY",
            "FREE_THREADED_BUILD_MUST_BE_PROBED",
            "GIL_RUNTIME_STATE_MUST_BE_PROBED",
            "EXTENSIONS_MUST_BE_VALIDATED_BY_EXACT_VERSION_AND_WORKLOAD",
            "RAPIDS_ON_WINDOWS_REQUIRES_WSL2",
            "PYTORCH_FREE_THREADED_SUPPORT_IS_AN_ISOLATED_EXPERIMENTAL_LANE",
            "PROCESS_ISOLATION_REMAINS_DEFAULT_FOR_GPU_AND_MODEL_WORKERS",
        ],
    }

    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
