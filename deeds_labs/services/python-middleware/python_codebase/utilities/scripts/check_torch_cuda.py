#!/usr/bin/env python3
"""Smoke test: report torch and CUDA availability and langextract presence.

Run this with the project's virtualenv python (e.g. .venv-phase46/Scripts/python.exe).
Prints a single JSON object to stdout.
"""
import json
import sys

info = {"executable": sys.executable}

try:
    import importlib
    packages = []
    for name in ("torch", "langextract"):
        spec = importlib.util.find_spec(name)
        packages.append({"name": name, "installed": spec is not None})
    info["packages"] = packages
except Exception as e:
    info["pkg_check_error"] = str(e)

try:
    import torch
    info["torch_version"] = getattr(torch, "__version__", "unknown")
    try:
        info["cuda_available"] = torch.cuda.is_available()
        # If CUDA is available, report device count and current device name if possible
        if info["cuda_available"]:
            try:
                info["cuda_device_count"] = torch.cuda.device_count()
                info["cuda_device_name"] = torch.cuda.get_device_name(torch.cuda.current_device())
            except Exception as e:
                info["cuda_probe_error"] = str(e)
    except Exception as e:
        info["cuda_check_error"] = str(e)
except Exception as e:
    info["torch_import_error"] = str(e)

try:
    import langextract
    info["langextract"] = "installed"
except Exception as e:
    info["langextract_error"] = str(e)

print(json.dumps(info, indent=2))
