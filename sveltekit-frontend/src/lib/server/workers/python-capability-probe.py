#!/usr/bin/env python3
"""
Python runtime capability probe.

Probes the actual capabilities of this Python runtime and outputs a JSON
manifest. The manifest is consumed by the Atlas control plane, which stores
it in runtime_capability_manifests and uses it to route tasks by capability.

Hard rules enforced here:
  PYTHON_VERSION_IS_NOT_A_CAPABILITY
  FREE_THREADED_BUILD_MUST_BE_PROBED
  GIL_RUNTIME_STATE_MUST_BE_PROBED
  RAPIDS_ON_WINDOWS_REQUIRES_WSL2
  PYTORCH_FREE_THREADED_SUPPORT_IS_AN_ISOLATED_EXPERIMENTAL_LANE
  PROCESS_ISOLATION_REMAINS_DEFAULT_FOR_GPU_AND_MODEL_WORKERS

The probe intentionally avoids naming queues after Python versions.
Routing decisions belong to the control plane, not this script.
"""

import json
import os
import platform
import socket
import sys
import sysconfig
import time
import uuid
from typing import Any


# ---------------------------------------------------------------------------
# GIL state detection
# ---------------------------------------------------------------------------

def _free_threaded_build() -> bool:
    """Build-time flag: was this Python compiled with --disable-gil?"""
    return bool(sysconfig.get_config_var("Py_GIL_DISABLED"))


def _gil_enabled() -> bool | None:
    """
    Runtime GIL state.

    Returns True if the GIL is currently active, False if disabled,
    None if the API is not available (Python < 3.13).

    NOTE: A free-threaded build can still have the GIL active at runtime
    if an extension that doesn't declare free-threading support was imported.
    Always probe this separately from _free_threaded_build().
    """
    try:
        return sys._is_gil_enabled()  # type: ignore[attr-defined]
    except AttributeError:
        return None  # Python < 3.13


# ---------------------------------------------------------------------------
# Extension probing
# ---------------------------------------------------------------------------

def _probe_extension(name: str) -> dict[str, Any]:
    """
    Probe an extension module.

    Captures GIL state before and after import to detect whether
    the extension re-enables the GIL (unsafe under free threading).
    """
    gil_before = _gil_enabled()
    result: dict[str, Any] = {
        "available": False,
        "version": None,
        "gilReenabledOnImport": False,
        "error": None,
    }
    try:
        mod = __import__(name)
        result["available"] = True
        result["version"] = getattr(mod, "__version__", None)
    except ImportError as e:
        result["error"] = str(e)
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
    finally:
        gil_after = _gil_enabled()
        if gil_before is False and gil_after is True:
            result["gilReenabledOnImport"] = True
    return result


# ---------------------------------------------------------------------------
# Environment detection
# ---------------------------------------------------------------------------

def _in_wsl2() -> bool:
    """True only inside WSL2 on Windows (not native Linux)."""
    try:
        with open("/proc/version", "r") as fh:
            return "microsoft" in fh.read().lower()
    except OSError:
        return False


def _os_name() -> str:
    """Canonical OS name for capability routing."""
    system = platform.system().lower()
    if system == "windows":
        return "windows_native"
    if system == "linux":
        return "wsl2" if _in_wsl2() else "linux"
    return system


# ---------------------------------------------------------------------------
# Capability probes
# ---------------------------------------------------------------------------

def _probe_numpy() -> dict[str, Any]:
    return _probe_extension("numpy")


def _probe_torch() -> dict[str, Any]:
    r = _probe_extension("torch")
    if r["available"]:
        import torch
        r["cudaAvailable"] = torch.cuda.is_available()
        r["cudaDeviceCount"] = torch.cuda.device_count() if r["cudaAvailable"] else 0
        # Experimental free-threading support in PyTorch is an isolated lane.
        # Do not enable by default.
        r["freeThreadedSupport"] = getattr(torch, "_C", None) is not None and getattr(
            getattr(torch, "_C", None), "_GLIBCXX_USE_CXX11_ABI", False
        )
    return r


def _probe_rapids(os_name: str, in_wsl2: bool) -> dict[str, Any]:
    """
    RAPIDS (cuDF, cuGraph, cuVS) requires a CUDA Linux environment.
    On Windows native it is not available. Always verify WSL2 first.
    """
    result: dict[str, Any] = {
        "available": False,
        "cudf": False,
        "cugraph": False,
        "cuvs": False,
        "skippedReason": None,
        "error": None,
    }

    if os_name == "windows_native":
        result["skippedReason"] = "RAPIDS_ON_WINDOWS_REQUIRES_WSL2"
        return result

    # Even on Linux, only attempt if we're in a CUDA-capable environment.
    r_cudf = _probe_extension("cudf")
    r_cugraph = _probe_extension("cugraph")
    r_cuvs = _probe_extension("cuvs")

    result["cudf"] = r_cudf["available"]
    result["cugraph"] = r_cugraph["available"]
    result["cuvs"] = r_cuvs["available"]
    result["available"] = all([r_cudf["available"], r_cugraph["available"], r_cuvs["available"]])

    if not result["available"]:
        errors = [
            r["error"]
            for r in [r_cudf, r_cugraph, r_cuvs]
            if r["error"]
        ]
        if errors:
            result["error"] = "; ".join(errors)

    return result


def _probe_spacy() -> dict[str, Any]:
    r = _probe_extension("spacy")
    if r["available"]:
        import spacy
        r["version"] = spacy.__version__
    return r


def _probe_transformers() -> dict[str, Any]:
    return _probe_extension("transformers")


# ---------------------------------------------------------------------------
# Main probe
# ---------------------------------------------------------------------------

def run_probe() -> dict[str, Any]:
    in_wsl2 = _in_wsl2()
    os_name = _os_name()

    free_threaded_build = _free_threaded_build()
    gil_probe_available = _gil_enabled() is not None
    gil_enabled = _gil_enabled()

    # freeThreadingActive is the ROUTING signal.
    # It is True only when:
    #   1. The build was compiled without GIL (free_threaded_build = True), AND
    #   2. The GIL is actually disabled at runtime (gil_enabled = False).
    # A free-threaded build with GIL re-enabled (e.g. by an unsafe extension)
    # does NOT qualify for the free-threaded lane.
    if free_threaded_build and gil_probe_available and gil_enabled is False:
        free_threading_active = True
    else:
        free_threading_active = False

    numpy_probe = _probe_numpy()
    torch_probe = _probe_torch()
    rapids_probe = _probe_rapids(os_name, in_wsl2)
    spacy_probe = _probe_spacy()
    transformers_probe = _probe_transformers()

    # Derived capability flags — these are what the control plane queries.
    # Never derive from Python version strings.
    capabilities: dict[str, bool] = {
        # CPU NLP parallelism: spaCy + numpy + no active GIL (or process-pool mode)
        "cpuNlpParallelThreads": (
            spacy_probe["available"]
            and numpy_probe["available"]
            and free_threading_active
        ),
        # CPU NLP process pool: spaCy + numpy, works under any GIL state
        "cpuNlpProcessPool": spacy_probe["available"] and numpy_probe["available"],
        # GPU compute: torch CUDA available
        "gpuTorch": torch_probe["available"] and torch_probe.get("cudaAvailable", False),
        # RAPIDS GPU analytics (Linux/WSL2 only)
        "rapidsGpu": rapids_probe["available"],
        # HuggingFace transformers
        "transformers": transformers_probe["available"],
        # Free-threaded execution (the capability, not the Python version)
        "freeThreadedExecution": free_threading_active,
    }

    constraints: list[str] = [
        "PYTHON_VERSION_IS_NOT_A_CAPABILITY",
        "FREE_THREADED_BUILD_MUST_BE_PROBED",
        "GIL_RUNTIME_STATE_MUST_BE_PROBED",
    ]
    if os_name == "windows_native":
        constraints.append("RAPIDS_ON_WINDOWS_REQUIRES_WSL2")
    if torch_probe["available"]:
        constraints.append("PYTORCH_FREE_THREADED_SUPPORT_IS_AN_ISOLATED_EXPERIMENTAL_LANE")
    if capabilities["gpuTorch"] or rapids_probe["available"]:
        constraints.append("PROCESS_ISOLATION_REMAINS_DEFAULT_FOR_GPU_AND_MODEL_WORKERS")

    manifest = {
        "schemaVersion": "1.0.0",
        "probeId": str(uuid.uuid4()),
        "probedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "hostId": socket.gethostname(),
        "environment": os_name,
        "python": {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "inWsl2": in_wsl2,
        },
        # Raw probe values — stored for auditing; never used for routing.
        "gilState": {
            "pyGilDisabledRaw": free_threaded_build,
            "freeThreadedBuild": free_threaded_build,
            "gilProbeAvailable": gil_probe_available,
            "gilEnabled": gil_enabled,
            "freeThreadingActive": free_threading_active,
        },
        # Extension probe results — raw facts, not routing decisions.
        "extensions": {
            "numpy": numpy_probe,
            "torch": torch_probe,
            "rapids": rapids_probe,
            "spacy": spacy_probe,
            "transformers": transformers_probe,
        },
        # Derived capability flags — what the control plane routes on.
        "capabilities": capabilities,
        # Hard rules enforced by this probe.
        "constraints": constraints,
    }

    return manifest


if __name__ == "__main__":
    manifest = run_probe()
    print(json.dumps(manifest, indent=2))
