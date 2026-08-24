#!/usr/bin/env python3
"""Parent Atlas Python runtime capability probe.

The probe is intentionally observational. It does not install packages, enable
or disable the GIL, initialize CUDA workloads, or become a runtime owner.

Why probe at runtime:
- a CPython build may support free threading while the GIL is enabled;
- importing a C extension that does not declare free-thread support may re-enable
  the GIL;
- package availability and CUDA visibility are executor capabilities, not
  architecture assumptions.

Prints one JSON object to stdout.
"""

from __future__ import annotations

import importlib
import json
import os
import platform
import sys
import sysconfig
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class PackageCapability:
    available: bool
    version: str | None
    import_error: str | None


@dataclass
class RuntimeProbe:
    schema: str
    implementation: str
    python_version: str
    executable: str
    abi_flags: str
    free_thread_build: bool
    gil_enabled_before_imports: bool | None
    gil_enabled_after_imports: bool | None
    gil_reenabled_by_extension_import: bool | None
    networkx: PackageCapability
    torch: PackageCapability
    qdrant_client: PackageCapability
    neo4j: PackageCapability
    torch_cuda_available: bool | None
    torch_cuda_device_count: int | None
    host_memory_total_mb: int | None
    host_memory_available_mb: int | None
    executor_hints: dict[str, str]


def gil_enabled() -> bool | None:
    fn = getattr(sys, "_is_gil_enabled", None)
    if not callable(fn):
        return None
    try:
        return bool(fn())
    except Exception:
        return None


def probe_package(name: str) -> tuple[PackageCapability, Any | None]:
    try:
        module = importlib.import_module(name)
        version = getattr(module, "__version__", None)
        return PackageCapability(True, str(version) if version is not None else None, None), module
    except Exception as exc:  # capability probe: preserve failure as evidence
        return PackageCapability(False, None, f"{type(exc).__name__}: {exc}"), None


def host_memory_mb() -> tuple[int | None, int | None]:
    """Return total/available host memory without adding a probe dependency."""
    try:
        import psutil  # type: ignore
        memory = psutil.virtual_memory()
        return int(memory.total / (1024 * 1024)), int(memory.available / (1024 * 1024))
    except Exception:
        pass

    if sys.platform == "win32":
        try:
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_ulong),
                    ("memory_load", ctypes.c_ulong),
                    ("total_phys", ctypes.c_ulonglong),
                    ("avail_phys", ctypes.c_ulonglong),
                    ("total_page", ctypes.c_ulonglong),
                    ("avail_page", ctypes.c_ulonglong),
                    ("total_virtual", ctypes.c_ulonglong),
                    ("avail_virtual", ctypes.c_ulonglong),
                    ("avail_extended", ctypes.c_ulonglong),
                ]

            status = MemoryStatus()
            status.length = ctypes.sizeof(MemoryStatus)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                return int(status.total_phys / (1024 * 1024)), int(status.avail_phys / (1024 * 1024))
        except Exception:
            return None, None

    try:
        page_size = int(os.sysconf("SC_PAGE_SIZE"))
        total_pages = int(os.sysconf("SC_PHYS_PAGES"))
        available_pages = int(os.sysconf("SC_AVPHYS_PAGES"))
        return (
            int(page_size * total_pages / (1024 * 1024)),
            int(page_size * available_pages / (1024 * 1024)),
        )
    except Exception:
        return None, None


def main() -> int:
    build_flag = sysconfig.get_config_var("Py_GIL_DISABLED")
    free_thread_build = bool(build_flag == 1)
    before = gil_enabled()

    networkx_cap, _nx = probe_package("networkx")
    torch_cap, torch = probe_package("torch")
    qdrant_cap, _qdrant = probe_package("qdrant_client")
    neo4j_cap, _neo4j = probe_package("neo4j")

    after = gil_enabled()
    reenabled = (
        True
        if before is False and after is True
        else False
        if before is not None and after is not None
        else None
    )

    cuda_available: bool | None = None
    cuda_count: int | None = None
    if torch is not None:
        try:
            cuda_available = bool(torch.cuda.is_available())
            cuda_count = int(torch.cuda.device_count()) if cuda_available else 0
        except Exception:
            cuda_available = None
            cuda_count = None

    true_cpu_threads = free_thread_build and after is False
    total_memory_mb, available_memory_mb = host_memory_mb()
    recommended_workers = 1 if available_memory_mb is None or available_memory_mb < 4096 else 2
    executor_hints = {
        "qdrant_io": "ASYNCIO_OR_THREAD_POOL",
        "neo4j_io": "ASYNCIO_OR_THREAD_POOL",
        "networkx_cpu": "THREAD_POOL" if true_cpu_threads else "PROCESS_POOL",
        "recommended_cpu_workers": str(recommended_workers),
        "pytorch_cuda": "ISOLATED_GPU_WORKER" if torch_cap.available and cuda_available else "UNAVAILABLE",
        "shared_cuda_context_across_python_threads": "DO_NOT_ASSUME_SAFE_OR_BENEFICIAL",
    }

    result = RuntimeProbe(
        schema="atlas.python-runtime-capability.v1",
        implementation=platform.python_implementation(),
        python_version=platform.python_version(),
        executable=sys.executable,
        abi_flags=getattr(sys, "abiflags", ""),
        free_thread_build=free_thread_build,
        gil_enabled_before_imports=before,
        gil_enabled_after_imports=after,
        gil_reenabled_by_extension_import=reenabled,
        networkx=networkx_cap,
        torch=torch_cap,
        qdrant_client=qdrant_cap,
        neo4j=neo4j_cap,
        torch_cuda_available=cuda_available,
        torch_cuda_device_count=cuda_count,
        host_memory_total_mb=total_memory_mb,
        host_memory_available_mb=available_memory_mb,
        executor_hints=executor_hints,
    )
    print(json.dumps(asdict(result), sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
