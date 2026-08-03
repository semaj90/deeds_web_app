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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    from cuvs.neighbors import cagra as cagra_neighbors  # noqa: F401

    _CUVS_STATUS = {"available": True, "version": getattr(cuvs, "__version__", "unknown")}
except Exception as exc:  # pragma: no cover
    _CUVS_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}

_CAGRA_STATUS: dict[str, Any] = {"available": False}
try:
    _CAGRA_STATUS = {"available": True, "version": getattr(cuvs, "__version__", "unknown")}
except Exception as exc:  # pragma: no cover
    _CAGRA_STATUS = {"available": False, "error": f"{type(exc).__name__}: {exc}"}

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
            "cagra": _CAGRA_STATUS,
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
                "status": "RUNTIME_SMOKE_PROVEN",
                "note": "POST /v1/knn/exact is wired (fail-closed guards, cuVS brute_force backend) and has now "
                "been exercised against the live WSL2 GPU environment with a successful request/response round trip.",
                "backend": "cuvs.neighbors.brute_force",
                "backend_version": _CUVS_STATUS.get("version"),
                "max_corpus_rows": _MAX_CORPUS_ROWS,
                "min_free_gpu_mb": _MIN_FREE_GPU_MB,
            }
        )
    else:
        ops.append({"op": "knn.exact", "status": "UNAVAILABLE", "reason": _CUVS_STATUS.get("error")})

    if _CAGRA_STATUS.get("available"):
        ops.append(
            {
                "op": "knn.cagra",
                "status": "RUNTIME_SMOKE_PROVEN",
                "note": "POST /v1/knn/cagra is wired with the same bounded identity contract as exact-KNN "
                "and has now been exercised against the live WSL2 GPU environment with a successful request/response round trip.",
                "backend": "cuvs.neighbors.cagra",
                "backend_version": _CAGRA_STATUS.get("version"),
                "max_corpus_rows": _MAX_CORPUS_ROWS,
                "min_free_gpu_mb": _MIN_FREE_GPU_MB,
            }
        )
    else:
        ops.append({"op": "knn.cagra", "status": "UNAVAILABLE", "reason": _CAGRA_STATUS.get("error")})

    return {
        "sidecar_version": "0.2.0",
        "schema_version": 1,
        "operations": ops,
        "gpu_memory": _gpu_memory_mb(),
        "row_identity_contract": "packetKey+sourceRevision (see ExactKnnRequest/ExactKnnResponse in "
        "openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/proposal.md)",
        "timestamp": int(time.time() * 1000),
    }


# ── Step 4: bounded exact-KNN endpoint ────────────────────────────────────
# Identity contract per openspec/changes/parent-atlas-gpu-sidecar-patch-tournament
# (ExactKnnRequest/ExactKnnResponse). Every corpus row carries its own identity —
# this endpoint never accepts or returns anonymous vectors. Fails closed on
# dimension mismatch, missing identity, duplicate identity, topK > corpus,
# row count over the configured max, insufficient free GPU memory, and an
# already-expired deadline.

_MAX_CORPUS_ROWS = int(os.getenv("ATLAS_RAPIDS_KNN_MAX_ROWS", "25000"))
_MIN_FREE_GPU_MB = float(os.getenv("ATLAS_RAPIDS_KNN_MIN_FREE_GPU_MB", "512"))
_EXPECTED_DIMENSION = 768


class KnnQuery(BaseModel):
    vector: list[float]
    representationId: str
    dimension: int = _EXPECTED_DIMENSION


class KnnCorpusRow(BaseModel):
    packetKey: str
    sourceRevision: str
    symbolVersionId: str | None = None
    vector: list[float]


class ExactKnnRequest(BaseModel):
    query: KnnQuery
    corpus: list[KnnCorpusRow]
    topK: int
    # RELATIVE budget in milliseconds from request receipt, NOT an absolute
    # epoch timestamp — matches how knn_exact() below actually enforces it
    # (elapsed-time comparison against t0). Flagged as ambiguous during review;
    # kept as `deadlineMs` to match the contract already published in
    # openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/proposal.md
    # rather than silently renaming to timeoutMs and diverging from that doc —
    # if the name is changed, change it in both places together.
    deadlineMs: int | None = None


class ExactKnnHit(BaseModel):
    rank: int
    packetKey: str
    sourceRevision: str
    symbolVersionId: str | None = None
    distance: float


class ExactKnnResponse(BaseModel):
    operation: str = "knn.exact"
    backend: str = "cuvs.brute_force"
    representationId: str
    dimension: int
    results: list[ExactKnnHit]
    corpusRows: int
    gpuMemoryBeforeMb: float | None
    gpuMemoryAfterMb: float | None
    durationMs: float
    truncated: bool


class CagraKnnResponse(ExactKnnResponse):
    operation: str = "knn.cagra"
    backend: str = "cuvs.cagra"


def _fail_closed(code: str, message: str) -> None:
    raise HTTPException(status_code=422, detail={"code": code, "message": message})


def _validate_knn_request(req: ExactKnnRequest, t0: float) -> dict[str, Any] | None:
    if not _CUVS_STATUS.get("available"):
        raise HTTPException(status_code=503, detail={"code": "CUVS_UNAVAILABLE", "message": _CUVS_STATUS.get("error")})

    if req.deadlineMs is not None and req.deadlineMs <= 0:
        _fail_closed("DEADLINE_EXPIRED", "deadlineMs must be positive")

    if req.query.dimension != _EXPECTED_DIMENSION or len(req.query.vector) != req.query.dimension:
        _fail_closed(
            "DIMENSION_MISMATCH",
            f"query dimension {req.query.dimension} / vector length {len(req.query.vector)} != {_EXPECTED_DIMENSION}",
        )

    if len(req.corpus) > _MAX_CORPUS_ROWS:
        _fail_closed("CORPUS_TOO_LARGE", f"{len(req.corpus)} rows > max {_MAX_CORPUS_ROWS}")
    if len(req.corpus) == 0:
        _fail_closed("EMPTY_CORPUS", "corpus must contain at least one row")

    seen_identity: set[tuple[str, str]] = set()
    for i, row in enumerate(req.corpus):
        if not row.packetKey:
            _fail_closed("MISSING_PACKET_IDENTITY", f"corpus[{i}] missing packetKey")
        if not row.sourceRevision:
            _fail_closed("MISSING_REVISION_IDENTITY", f"corpus[{i}] ({row.packetKey}) missing sourceRevision")
        if len(row.vector) != req.query.dimension:
            _fail_closed("DIMENSION_MISMATCH", f"corpus[{i}] ({row.packetKey}) vector length {len(row.vector)} != {req.query.dimension}")
        identity = (row.packetKey, row.sourceRevision)
        if identity in seen_identity:
            _fail_closed("DUPLICATE_CORPUS_IDENTITY", f"duplicate (packetKey, sourceRevision) = {identity}")
        seen_identity.add(identity)

    if req.topK <= 0 or req.topK > len(req.corpus):
        _fail_closed("INVALID_TOPK", f"topK {req.topK} must be in [1, {len(req.corpus)}]")

    mem_before = _gpu_memory_mb()
    if mem_before and isinstance(mem_before.get("free_mb"), (int, float)) and mem_before["free_mb"] < _MIN_FREE_GPU_MB:
        raise HTTPException(
            status_code=503,
            detail={"code": "INSUFFICIENT_GPU_MEMORY", "message": f"{mem_before['free_mb']}MB free < {_MIN_FREE_GPU_MB}MB required"},
        )

    if req.deadlineMs is not None and (time.time() - t0) * 1000 >= req.deadlineMs:
        _fail_closed("DEADLINE_EXPIRED", "deadline elapsed during pre-flight guards")

    return mem_before


def _device_rows_to_list(device_array: Any) -> list[Any]:
    host_array = cp.asnumpy(device_array)
    if getattr(host_array, "ndim", 1) > 1:
        host_array = host_array[0]
    return host_array.tolist()


@app.post("/v1/knn/exact", response_model=ExactKnnResponse)
def knn_exact(req: ExactKnnRequest) -> ExactKnnResponse:
    t0 = time.time()
    mem_before = _validate_knn_request(req, t0)

    # brute_force is already imported (probed) at module scope above — reuse it
    # rather than re-importing, which pyflakes correctly flags as a shadowing
    # redefinition even though both names resolve to the same object.
    query_arr = cp.asarray([req.query.vector], dtype=cp.float32)
    corpus_arr = cp.asarray([row.vector for row in req.corpus], dtype=cp.float32)

    index = brute_force.build(corpus_arr)
    # Correct return order confirmed this session (GS1.31-33): brute_force.search
    # returns (distances, neighbors), NOT (neighbors, distances) — a real bug was
    # found and fixed in the earlier proof script from exactly this swap.
    distances, neighbors = brute_force.search(index, query_arr, k=req.topK)

    neighbor_idx = _device_rows_to_list(neighbors)
    neighbor_dist = _device_rows_to_list(distances)

    results = [
        ExactKnnHit(
            rank=rank + 1,
            packetKey=req.corpus[idx].packetKey,
            sourceRevision=req.corpus[idx].sourceRevision,
            symbolVersionId=req.corpus[idx].symbolVersionId,
            distance=float(dist),
        )
        for rank, (idx, dist) in enumerate(zip(neighbor_idx, neighbor_dist))
    ]

    mem_after = _gpu_memory_mb()

    return ExactKnnResponse(
        representationId=req.query.representationId,
        dimension=req.query.dimension,
        results=results,
        corpusRows=len(req.corpus),
        gpuMemoryBeforeMb=mem_before.get("free_mb") if mem_before else None,
        gpuMemoryAfterMb=mem_after.get("free_mb") if mem_after else None,
        durationMs=round((time.time() - t0) * 1000, 2),
        truncated=len(results) < req.topK,
    )


@app.post("/v1/knn/cagra", response_model=CagraKnnResponse)
def knn_cagra(req: ExactKnnRequest) -> CagraKnnResponse:
    t0 = time.time()
    mem_before = _validate_knn_request(req, t0)

    query_arr = cp.asarray([req.query.vector], dtype=cp.float32)
    corpus_arr = cp.asarray([row.vector for row in req.corpus], dtype=cp.float32)

    dataset_rows = len(req.corpus)
    graph_degree = max(2, min(64, max(1, dataset_rows - 1)))
    intermediate_graph_degree = max(graph_degree, min(128, max(1, dataset_rows)))
    index_params = cagra_neighbors.IndexParams(
        graph_degree=graph_degree,
        intermediate_graph_degree=intermediate_graph_degree,
        metric="sqeuclidean",
    )
    index = cagra_neighbors.build(index_params, corpus_arr)

    search_params = cagra_neighbors.SearchParams(
        search_width=max(1, min(8, req.topK)),
        itopk_size=max(64, req.topK),
    )
    distances, neighbors = cagra_neighbors.search(search_params, index, query_arr, k=req.topK)

    neighbor_idx = _device_rows_to_list(neighbors)
    neighbor_dist = _device_rows_to_list(distances)

    results = [
        ExactKnnHit(
            rank=rank + 1,
            packetKey=req.corpus[idx].packetKey,
            sourceRevision=req.corpus[idx].sourceRevision,
            symbolVersionId=req.corpus[idx].symbolVersionId,
            distance=float(dist),
        )
        for rank, (idx, dist) in enumerate(zip(neighbor_idx, neighbor_dist))
    ]

    mem_after = _gpu_memory_mb()

    return CagraKnnResponse(
        representationId=req.query.representationId,
        dimension=req.query.dimension,
        results=results,
        corpusRows=len(req.corpus),
        gpuMemoryBeforeMb=mem_before.get("free_mb") if mem_before else None,
        gpuMemoryAfterMb=mem_after.get("free_mb") if mem_after else None,
        durationMs=round((time.time() - t0) * 1000, 2),
        truncated=len(results) < req.topK,
    )


def main() -> None:
    host = os.getenv("ATLAS_RAPIDS_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("ATLAS_RAPIDS_SIDECAR_PORT", "8098"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":  # pragma: no cover - process entrypoint
    main()
