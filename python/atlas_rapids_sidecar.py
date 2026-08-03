"""
Atlas RAPIDS Sidecar — minimal local GPU service, health + capabilities only.

Step 3 of the bounded seam named in openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md
(GS1.37): "Build the minimal local RAPIDS sidecar with health + capabilities
and v1 knn exact." This file is health/capabilities ONLY — the exact-KNN
endpoint is step 4, not built here on purpose.

Explicit non-goals for this file (per the operator's own sequencing — do not
add these until their own later, dedicated steps):
- No clustering, no tRPC, no Kanban receipts, no MCP publication.
- No Arrow/mmap transport, no Redis warming.
- No exact-KNN endpoint yet (step 4).

Runs inside the WSL2 conda environment `atlas-rapids-cu13`
(scripts/atlas/environments/atlas-rapids-cu13.yml — see that file's README
for the known torch-before-cudf/cugraph import-order requirement, applied
below).

Usage:
    wsl -d Ubuntu -e bash -lc "
      source ~/miniforge3/bin/activate atlas-rapids-cu13
      cd /mnt/c/Users/james/Videos/deeds-web-app
      python python/atlas_rapids_sidecar.py
    "
    curl http://127.0.0.1:8098/health
    curl http://127.0.0.1:8098/v1/capabilities
"""

from __future__ import annotations

import os
import time
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    import uvicorn
except ImportError as exc:  # pragma: no cover - launcher/runtime only
    raise RuntimeError("uvicorn is required to run the Atlas RAPIDS sidecar") from exc

# Import order matters: torch before cudf/cugraph avoids the
# `undefined symbol: cublasLtZZZMatmulAlgoGetHeuristicForStream` conflict
# between PyTorch's bundled CUDA libs and the conda-installed RAPIDS build.
# Confirmed via isolated reproduction, GS1.33.
_TORCH_STATUS: dict[str, Any] = {"available": False}
try:
    import torch  # noqa: F401

    _TORCH_STATUS = {
        "available": True,
        "version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }
except Exception as exc:  # pragma: no cover
    _TORCH_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}

_CUPY_STATUS: dict[str, Any] = {"available": False}
try:
    import cupy as cp

    _CUPY_STATUS = {"available": True, "version": cp.__version__}
except Exception as exc:  # pragma: no cover
    _CUPY_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}

_CUVS_STATUS: dict[str, Any] = {"available": False}
try:
    import cuvs
    from cuvs.neighbors import brute_force  # noqa: F401

    _CUVS_STATUS = {"available": True, "version": getattr(cuvs, "__version__", "unknown")}
except Exception as exc:  # pragma: no cover
    _CUVS_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}

_CUGRAPH_STATUS: dict[str, Any] = {"available": False}
try:
    import cudf  # noqa: F401
    import cugraph

    _CUGRAPH_STATUS = {"available": True, "version": cugraph.__version__}
except Exception as exc:  # pragma: no cover
    _CUGRAPH_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}

_CUML_STATUS: dict[str, Any] = {"available": False}
try:
    import cuml

    _CUML_STATUS = {"available": True, "version": cuml.__version__}
except Exception as exc:  # pragma: no cover
    _CUML_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}


app = FastAPI(title="Atlas RAPIDS Sidecar", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_START_TIME = time.time()


def _gpu_memory_mb() -> dict[str, Any] | None:
    if not _CUPY_STATUS.get("available"):
        return None
    try:
        free_bytes, total_bytes = cp.cuda.Device().mem_info
        return {
            "free_mb": round(free_bytes / (1024 * 1024), 1),
            "total_mb": round(total_bytes / (1024 * 1024), 1),
            "used_mb": round((total_bytes - free_bytes) / (1024 * 1024), 1),
        }
    except Exception as exc:  # pragma: no cover
        return {"error": f"{type(exc).__name__}: {exc}"}


@app.get("/health")
def health() -> dict[str, Any]:
    gpu_available = bool(_TORCH_STATUS.get("cuda_available")) or bool(_CUPY_STATUS.get("available"))
    return {
        "status": "ok" if gpu_available else "degraded",
        "uptime_s": round(time.time() - _START_TIME, 1),
        "gpu": {
            "available": gpu_available,
            "device_name": _TORCH_STATUS.get("device_name"),
            "memory": _gpu_memory_mb(),
        },
        "packages": {
            "torch": _TORCH_STATUS,
            "cupy": _CUPY_STATUS,
            "cuvs": _CUVS_STATUS,
            "cugraph": _CUGRAPH_STATUS,
            "cuml": _CUML_STATUS,
        },
        "timestamp": int(time.time() * 1000),
    }


@app.get("/v1/capabilities")
def capabilities() -> dict[str, Any]:
    """
    Capability registry — what operations this sidecar can currently perform,
    given what actually imported successfully above. Consumers (the future
    TypeScript client, step 6) should check this before calling an endpoint,
    rather than assuming availability from the sidecar's mere presence.
    """
    ops: list[dict[str, Any]] = []
    if _CUVS_STATUS.get("available"):
        ops.append(
            {
                "op": "knn.exact",
                "status": "NOT_IMPLEMENTED_YET",
                "note": "cuVS brute_force is importable; the /v1/knn/exact endpoint itself is step 4, not built yet",
                "backend": "cuvs.neighbors.brute_force",
                "backend_version": _CUVS_STATUS.get("version"),
            }
        )
    else:
        ops.append({"op": "knn.exact", "status": "UNAVAILABLE", "reason": _CUVS_STATUS.get("error")})

    return {
        "sidecar_version": "0.1.0",
        "schema_version": 1,
        "operations": ops,
        "gpu_memory": _gpu_memory_mb(),
        "row_identity_contract": "NOT_YET_DEFINED",  # step 4 introduces the identity manifest
        "timestamp": int(time.time() * 1000),
    }


def main() -> None:
    host = os.getenv("ATLAS_RAPIDS_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("ATLAS_RAPIDS_SIDECAR_PORT", "8098"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":  # pragma: no cover - process entrypoint
    main()
