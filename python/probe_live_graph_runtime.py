#!/usr/bin/env python3
"""Side-effect-free live graph GPU runtime probe.

Checks imports and profiler CLIs only. It does not install packages, create a CUDA
context intentionally, touch PostgreSQL/Qdrant, or execute a graph workload.
"""

from __future__ import annotations

import argparse
import importlib
import importlib.metadata
import json
import shutil
import subprocess
from typing import Any


def distribution_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def import_probe(module_name: str) -> dict[str, Any]:
    try:
        module = importlib.import_module(module_name)
        return {
            "module": module_name,
            "available": True,
            "version": str(getattr(module, "__version__", "unknown")),
            "error": None,
        }
    except Exception as exc:
        return {
            "module": module_name,
            "available": False,
            "version": None,
            "error": f"{type(exc).__name__}: {exc}",
        }


def cli_probe(name: str) -> dict[str, Any]:
    executable = shutil.which(name)
    if executable is None:
        return {"name": name, "available": False, "path": None, "version": None}
    try:
        result = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=10, check=False)
        text = (result.stdout or result.stderr).strip().splitlines()
        version = text[0][:200] if text else "unknown"
    except Exception as exc:
        version = f"probe-error:{type(exc).__name__}:{exc}"
    return {"name": name, "available": True, "path": executable, "version": version}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-profilers", action="store_true")
    args = parser.parse_args()

    imports = [import_probe(name) for name in ("nvtx", "numpy", "cupy", "cudf", "cugraph", "cuvs", "psycopg2")]
    clis = [cli_probe(name) for name in ("nsys", "ncu")]
    missing_imports = [item["module"] for item in imports if not item["available"]]
    missing_clis = [item["name"] for item in clis if not item["available"]]
    status = "READY"
    blockers = []
    if missing_imports:
        status = "BLOCKED"
        blockers.extend(f"IMPORT_MISSING:{name}" for name in missing_imports)
    if args.require_profilers and missing_clis:
        status = "BLOCKED"
        blockers.extend(f"CLI_MISSING:{name}" for name in missing_clis)

    receipt = {
        "schema": "atlas.live-graph-runtime-probe.v1",
        "status": status,
        "imports": imports,
        "profilers": clis,
        "nvtx_distribution_version": distribution_version("nvtx"),
        "blockers": blockers,
        "side_effect_free": True,
        "canonical_authority": False,
    }
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if status == "READY" else 2


if __name__ == "__main__":
    raise SystemExit(main())
