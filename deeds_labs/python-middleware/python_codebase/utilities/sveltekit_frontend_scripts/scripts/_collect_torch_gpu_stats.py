#!/usr/bin/env python
"""
Small Torch-based probe that prints a JSON blob with CUDA memory and availability.
Used by Node collector to aggregate overall telemetry.
"""
import json
import sys

try:
    import torch
except Exception as e:
    print(json.dumps({"error": f"import_error: {e}"}))
    sys.exit(0)

out = {
    "torch_version": torch.__version__ if hasattr(torch, '__version__') else None,
    "cuda_available": torch.cuda.is_available(),
    "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
    "devices": [],
}

if torch.cuda.is_available():
    for i in range(torch.cuda.device_count()):
        try:
            name = torch.cuda.get_device_name(i)
        except Exception:
            name = None
        try:
            allocated = torch.cuda.memory_allocated(i)
            reserved = torch.cuda.memory_reserved(i)
        except Exception:
            allocated = None
            reserved = None
        out['devices'].append({
            'index': i,
            'name': name,
            'memory_allocated_bytes': allocated,
            'memory_reserved_bytes': reserved,
        })

print(json.dumps(out))
