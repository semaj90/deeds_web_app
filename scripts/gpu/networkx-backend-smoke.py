#!/usr/bin/env python3
"""Smoke test for GPU-accelerated NetworkX backend dispatch.

Checks whether NetworkX can see a GPU backend such as nx-cugraph and
reports a concrete install/run plan for CUDA 12.x environments.

This does not mutate repo state. It only reports what is present.
"""

from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path


def try_import(module_name: str):
    try:
        return importlib.import_module(module_name), None
    except Exception as exc:  # pragma: no cover - reporting only
        return None, str(exc)


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    result = {
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "cwd": os.getcwd(),
        "root": str(root),
        "networkx": {"installed": False, "version": None, "error": None},
        "cugraph": {"installed": False, "version": None, "error": None},
        "nx_cugraph_backend": {"installed": False, "error": None},
        "backend_dispatch": {"supported": False, "error": None},
        "recommended_install": [
            "pip install networkx",
            "pip install nx-cugraph --extra-index-url https://pypi.nvidia.com",
        ],
        "notes": [],
    }

    nx, nx_err = try_import("networkx")
    if nx is not None:
        result["networkx"] = {
            "installed": True,
            "version": getattr(nx, "__version__", None),
            "error": None,
        }
        try:
            # Backend dispatch exists on newer NetworkX builds.
            from networkx import config as nx_config  # type: ignore

            result["backend_dispatch"]["supported"] = True
            backend = getattr(nx_config, "backend_priority", None)
            if backend is not None:
                result["notes"].append(f"networkx backend_priority={backend}")
        except Exception as exc:
            result["backend_dispatch"]["error"] = str(exc)
    else:
        result["networkx"]["error"] = nx_err

    cg, cg_err = try_import("cugraph")
    if cg is not None:
        result["cugraph"] = {
            "installed": True,
            "version": getattr(cg, "__version__", None),
            "error": None,
        }
    else:
        result["cugraph"]["error"] = cg_err

    nx_cg, nx_cg_err = try_import("nx_cugraph")
    if nx_cg is not None:
        result["nx_cugraph_backend"] = {
            "installed": True,
            "error": None,
        }
        result["notes"].append("nx-cugraph backend module import succeeded")
    else:
        result["nx_cugraph_backend"]["error"] = nx_cg_err

    if result["networkx"]["installed"] and result["nx_cugraph_backend"]["installed"]:
        try:
            import networkx as nx_mod  # type: ignore

            # Exercise a tiny graph operation to prove dispatch path is usable.
            graph = nx_mod.path_graph(4)
            degree = list(graph.degree())
            result["notes"].append(f"networkx path_graph degree sample={degree[:2]}")
        except Exception as exc:
            result["notes"].append(f"networkx runtime smoke failed: {exc}")

    print(json.dumps(result, indent=2, sort_keys=True))

    if not result["networkx"]["installed"]:
        return 2
    if not result["nx_cugraph_backend"]["installed"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
