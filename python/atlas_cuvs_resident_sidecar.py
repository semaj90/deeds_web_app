from __future__ import annotations

import os
from typing import Any, Literal

import numpy as np
from fastapi import HTTPException
from pydantic import BaseModel, Field

# Reuse the already-proven RAPIDS import order, health surface, exact KNN and
# CAGRA endpoints. Importing this module attaches resident-index lifecycle
# endpoints to the same FastAPI app without creating another GPU owner.
from atlas_rapids_sidecar import app, _CUVS_STATUS  # noqa: E402
from atlas_cuvs_resident_registry import (  # noqa: E402
    CorpusIdentity,
    PythonCuvsBackend,
    ResidentCuvsIndexRegistry,
    ResidentIndexBuildSpec,
    ResidentIndexSearchSpec,
    checksum_identity_order,
)


class ResidentCorpusRow(BaseModel):
    packetKey: str
    sourceRevision: str
    symbolVersionId: str | None = None
    vector: list[float]


class ResidentIndexBuildRequest(BaseModel):
    indexId: str
    algorithm: Literal["brute_force", "cagra", "ivf_flat", "ivf_pq"]
    representationId: str
    representationRevision: str
    workspaceRevision: str
    datasetChecksumSha256: str
    metric: Literal["cosine", "sqeuclidean", "inner_product"] = "sqeuclidean"
    dimension: int = Field(gt=0)
    corpus: list[ResidentCorpusRow]
    buildParams: dict[str, Any] = Field(default_factory=dict)
    replace: bool = False


class ResidentIndexSearchRequest(BaseModel):
    representationRevision: str
    datasetChecksumSha256: str
    queries: list[list[float]]
    topK: int = Field(gt=0)
    searchParams: dict[str, Any] = Field(default_factory=dict)


class ResidentHnswConvertRequest(BaseModel):
    targetIndexId: str
    hierarchy: Literal["none", "cpu"] = "none"
    releaseSource: bool = False
    buildParams: dict[str, Any] = Field(default_factory=dict)


class ResidentIndexDropResponse(BaseModel):
    indexId: str
    dropped: bool


_REGISTRY: ResidentCuvsIndexRegistry | None = None


def _registry() -> ResidentCuvsIndexRegistry:
    global _REGISTRY
    if not _CUVS_STATUS.get("available"):
        raise HTTPException(
            status_code=503,
            detail={"code": "CUVS_UNAVAILABLE", "message": _CUVS_STATUS.get("error")},
        )
    if _REGISTRY is None:
        _REGISTRY = ResidentCuvsIndexRegistry(PythonCuvsBackend())
    return _REGISTRY


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, KeyError):
        return HTTPException(status_code=404, detail={"code": "INDEX_NOT_FOUND", "message": str(exc)})
    if isinstance(exc, (ValueError, RuntimeError)):
        return HTTPException(status_code=422, detail={"code": "RESIDENT_INDEX_CONTRACT_ERROR", "message": str(exc)})
    return HTTPException(status_code=500, detail={"code": "RESIDENT_INDEX_INTERNAL_ERROR", "message": f"{type(exc).__name__}: {exc}"})


@app.get("/v1/indexes")
def list_resident_indexes() -> dict[str, Any]:
    try:
        return {"indexes": _registry().list()}
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


@app.get("/v1/indexes/{index_id}")
def get_resident_index(index_id: str) -> dict[str, Any]:
    try:
        return _registry().get(index_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


@app.post("/v1/indexes/build")
def build_resident_index(req: ResidentIndexBuildRequest) -> dict[str, Any]:
    try:
        identities = tuple(
            CorpusIdentity(row.packetKey, row.sourceRevision, row.symbolVersionId)
            for row in req.corpus
        )
        matrix = np.asarray([row.vector for row in req.corpus], dtype=np.float32)
        if matrix.ndim != 2 or matrix.shape[1] != req.dimension:
            raise ValueError("corpus matrix dimension mismatch")
        spec = ResidentIndexBuildSpec(
            index_id=req.indexId,
            algorithm=req.algorithm,
            representation_id=req.representationId,
            representation_revision=req.representationRevision,
            workspace_revision=req.workspaceRevision,
            dataset_checksum_sha256=req.datasetChecksumSha256,
            metric=req.metric,
            dimension=req.dimension,
            build_params=dict(req.buildParams),
        )
        metadata = _registry().build(spec, identities, matrix, replace=req.replace)
        return {
            "index": metadata,
            "identityOrderChecksumSha256": checksum_identity_order(identities),
            "canonicalWrites": False,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


@app.post("/v1/indexes/{index_id}/search")
def search_resident_index(index_id: str, req: ResidentIndexSearchRequest) -> dict[str, Any]:
    try:
        queries = np.asarray(req.queries, dtype=np.float32)
        return {
            **_registry().search(
                ResidentIndexSearchSpec(
                    index_id=index_id,
                    representation_revision=req.representationRevision,
                    dataset_checksum_sha256=req.datasetChecksumSha256,
                    top_k=req.topK,
                    search_params=dict(req.searchParams),
                ),
                queries,
            ),
            "canonicalWrites": False,
            "exactPromotionRequired": _registry().get(index_id)["exact"] is False,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


@app.post("/v1/indexes/{index_id}/convert/hnsw")
def convert_resident_cagra_to_hnsw(index_id: str, req: ResidentHnswConvertRequest) -> dict[str, Any]:
    try:
        converted = _registry().convert_cagra_to_hnsw(
            index_id,
            req.targetIndexId,
            hierarchy=req.hierarchy,
            release_source=req.releaseSource,
            build_params=dict(req.buildParams),
        )
        return {
            "index": converted,
            "canonicalWrites": False,
            "exactPromotionRequired": True,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


@app.delete("/v1/indexes/{index_id}", response_model=ResidentIndexDropResponse)
def drop_resident_index(index_id: str) -> ResidentIndexDropResponse:
    try:
        return ResidentIndexDropResponse(indexId=index_id, dropped=_registry().drop(index_id))
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


def main() -> None:
    import uvicorn

    host = os.getenv("ATLAS_RAPIDS_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("ATLAS_RAPIDS_SIDECAR_PORT", "8098"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":  # pragma: no cover
    main()
