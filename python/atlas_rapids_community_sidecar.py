"""Bounded RAPIDS community sidecar for Parent Atlas.

Separate process from atlas_rapids_sidecar.py so exact-KNN/CAGRA proof status
is not silently expanded. This service exposes only non-mutating community
challenger endpoints over explicit undirected weighted projections.

Default port: 8099
"""

from __future__ import annotations

import os
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from python.atlas_rapids_community import (
    CommunityPartitionRequestV1,
    CommunityPartitionResponseV1,
    run_cugraph_partition,
)

try:
    import cugraph
    _CUGRAPH_VERSION = str(cugraph.__version__)
    _CUGRAPH_ERROR: str | None = None
except Exception as exc:  # pragma: no cover
    _CUGRAPH_VERSION = "unavailable"
    _CUGRAPH_ERROR = f"{type(exc).__name__}: {exc}"

try:
    import uvicorn
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("uvicorn is required to run the RAPIDS community sidecar") from exc


app = FastAPI(title="Atlas RAPIDS Community Challenger", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
_START_TIME = time.time()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if _CUGRAPH_ERROR is None else "degraded",
        "uptime_s": round(time.time() - _START_TIME, 1),
        "cugraph_version": _CUGRAPH_VERSION,
        "error": _CUGRAPH_ERROR,
    }


@app.get("/v1/capabilities")
def capabilities() -> dict[str, Any]:
    available = _CUGRAPH_ERROR is None
    common = {
        "available": available,
        "production_status": "QUARANTINED",
        "approval_scope": "NON_MUTATING_BOUNDED_BENCHMARK",
        "projection_semantics": "atlas.undirected-weighted-projection.v1",
        "backend_version": _CUGRAPH_VERSION,
    }
    return {
        "schema": "atlas.rapids-community-capabilities.v1",
        "operations": [
            {"op": "community.louvain", "backend": "cugraph.louvain", **common},
            {"op": "community.leiden", "backend": "cugraph.leiden", **common},
            {
                "op": "community.spectral",
                "backend": "cugraph.spectralModularityMaximizationClustering",
                "available": available and hasattr(cugraph, "spectralModularityMaximizationClustering"),
                **{key: value for key, value in common.items() if key != "available"},
            },
        ],
        "note": "Neo4j GDS remains the durable promoted owner until parity/eval promotion is proven.",
    }


def _execute(req: CommunityPartitionRequestV1, algorithm: str) -> CommunityPartitionResponseV1:
    if _CUGRAPH_ERROR is not None:
        raise HTTPException(
            status_code=503,
            detail={"code": "CUGRAPH_UNAVAILABLE", "message": _CUGRAPH_ERROR},
        )
    if req.algorithm != algorithm:
        raise HTTPException(
            status_code=422,
            detail={"code": "ALGORITHM_MISMATCH", "message": f"request algorithm must be {algorithm}"},
        )
    try:
        return run_cugraph_partition(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_PROJECTION", "message": str(exc)}) from exc
    except Exception as exc:  # pragma: no cover - GPU runtime boundary
        raise HTTPException(
            status_code=500,
            detail={"code": "COMMUNITY_EXECUTION_FAILED", "message": f"{type(exc).__name__}: {exc}"},
        ) from exc


@app.post("/v1/community/louvain", response_model=CommunityPartitionResponseV1)
def community_louvain(req: CommunityPartitionRequestV1) -> CommunityPartitionResponseV1:
    return _execute(req, "louvain")


@app.post("/v1/community/leiden", response_model=CommunityPartitionResponseV1)
def community_leiden(req: CommunityPartitionRequestV1) -> CommunityPartitionResponseV1:
    return _execute(req, "leiden")


@app.post("/v1/community/spectral", response_model=CommunityPartitionResponseV1)
def community_spectral(req: CommunityPartitionRequestV1) -> CommunityPartitionResponseV1:
    return _execute(req, "spectral")


def main() -> None:
    host = os.getenv("ATLAS_RAPIDS_COMMUNITY_HOST", "127.0.0.1")
    port = int(os.getenv("ATLAS_RAPIDS_COMMUNITY_PORT", "8099"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":  # pragma: no cover
    main()
