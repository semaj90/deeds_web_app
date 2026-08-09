#!/usr/bin/env python3
import json, os, platform

result = {
    "python": platform.python_version(),
    "platform": platform.platform(),
    "NX_CUGRAPH_AUTOCONFIG": os.getenv("NX_CUGRAPH_AUTOCONFIG"),
}

mods = {}
for name in ["cupy","cudf","cugraph","cuml","cuvs","networkx","nx_cugraph","pyarrow","duckdb"]:
    try:
        m = __import__(name)
        mods[name] = getattr(m, "__version__", "installed")
    except Exception as e:
        mods[name] = f"MISSING: {type(e).__name__}: {e}"

result["modules"] = mods

try:
    import cupy as cp
    d = cp.cuda.Device()
    props = cp.cuda.runtime.getDeviceProperties(d.id)
    result["cuda"] = {
        "deviceId": int(d.id),
        "name": props["name"].decode() if isinstance(props["name"], bytes) else str(props["name"]),
        "computeCapability": f'{props["major"]}.{props["minor"]}',
        "totalMemoryBytes": int(props["totalGlobalMem"]),
    }
except Exception as e:
    result["cuda"] = {"error": str(e)}

print(json.dumps(result, indent=2))
