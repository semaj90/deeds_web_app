#!/usr/bin/env python3
"""
Phase 8 Environment Probe
Validates Python environment, PyTorch, CUDA, and model availability.
Emits structured JSON for the Node wrapper to verify setup.
"""

from __future__ import annotations
import json
import os
import platform
import sys

result: dict[str, object] = {
    "python_executable": sys.executable,
    "python_version": sys.version,
    "platform": platform.platform(),
    "conda_prefix": os.environ.get("CONDA_PREFIX"),
}

try:
    import torch

    result["torch_version"] = torch.__version__
    result["cuda_available"] = torch.cuda.is_available()
    result["cuda_version"] = torch.version.cuda
    result["cuda_device_count"] = torch.cuda.device_count()
    if torch.cuda.is_available():
        result["cuda_device_name"] = torch.cuda.get_device_name(0)
        result["cuda_device_properties"] = {
            "total_memory_gb": torch.cuda.get_device_properties(0).total_memory / 1e9,
            "compute_capability": f"{torch.cuda.get_device_properties(0).major}.{torch.cuda.get_device_properties(0).minor}",
        }
except Exception as error:
    result["torch_error"] = repr(error)

try:
    import transformers

    result["transformers_version"] = transformers.__version__
except Exception:
    pass

print(json.dumps(result, indent=2))
