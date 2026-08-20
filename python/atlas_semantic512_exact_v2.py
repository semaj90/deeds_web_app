"""Parent Atlas semantic_512 exact cosine oracle v2.

This endpoint deliberately requires packet_key but NOT source_revision. The live
atlas_packets authority currently has no canonical source_revision column;
source freshness is proven independently by the SvelteKit mutation-awareness
receipt (source_ref + trusted content hash + git mutation provenance).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from typing import Any, Callable

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel

try:
    import cupy as cp
    from cuvs.neighbors import brute_force
except Exception as exc:  # pragma: no cover
    cp = None  # type: ignore[assignment]
    brute_force = None  # type: ignore[assignment]
    _IMPORT_ERROR: str | None = f"{type(exc).__name__}: {exc}"
else:
    _IMPORT_ERROR = None

SEMANTIC_DIM = 512
MAX_CORPUS_ROWS = int(os.getenv("ATLAS_SEMANTIC512_MAX_CORPUS_ROWS", "25000"))
MAX_TOP_K = int(os.getenv("ATLAS_SEMANTIC512_MAX_TOPK", "512"))
MIN_FREE_GPU_MB = float(os.getenv("ATLAS_SEMANTIC512_MIN_FREE_GPU_MB", "384"))
ALGORITHM_REVISION = "atlas.cuvs-exact-cosine.semantic512.v2-mutation-aware"


class SemanticIdentityRowV2(BaseModel):
    packetKey: str
    sourceRevision: str | None = None
    sourceRef: str | None = None
    symbolVersionId: str | None = None
    treeNodeId: str | None = None
    featureLabel: str | None = None
    vector: list[float]


class SemanticQueryV2(BaseModel):
    vector: list[float]
    representationId: str = "semantic_512"
    representationRevision: str


class ExactRequestV2(BaseModel):
    query: SemanticQueryV2
    corpus: list[SemanticIdentityRowV2]
    topK: int = 100
    deadlineMs: int | None = None


def _fail(code: str, message: str, status_code: int = 422) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _normalize(values: list[float], label: str) -> list[float]:
    if len(values) != SEMANTIC_DIM:
        raise ValueError(f"{label} dimension {len(values)} != {SEMANTIC_DIM}")
    if not all(math.isfinite(float(value)) for value in values):
        raise ValueError(f"{label} contains non-finite values")
    norm = math.sqrt(sum(float(value) ** 2 for value in values))
    if norm <= 0:
        raise ValueError(f"{label} has zero norm")
    return [float(value) / norm for value in values]


def _identity_checksum(rows: list[SemanticIdentityRowV2]) -> str:
    payload = [
        {
            "packetKey": row.packetKey,
            "sourceRevision": row.sourceRevision,
            "sourceRef": row.sourceRef,
            "symbolVersionId": row.symbolVersionId,
            "treeNodeId": row.treeNodeId,
            "featureLabel": row.featureLabel,
        }
        for row in rows
    ]
    return hashlib.sha256(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()


def exact_semantic512_v2(req: ExactRequestV2) -> dict[str, Any]:
    if _IMPORT_ERROR is not None or cp is None or brute_force is None:
        _fail("CUVS_UNAVAILABLE", _IMPORT_ERROR or "cuVS unavailable", 503)
    if req.query.representationId != "semantic_512":
        _fail("REPRESENTATION_MISMATCH", "semantic_512 required")
    if not req.query.representationRevision.strip():
        _fail("REPRESENTATION_REVISION_REQUIRED", "representationRevision is required")
    if not req.corpus or len(req.corpus) > MAX_CORPUS_ROWS:
        _fail("CORPUS_SIZE_INVALID", f"corpus size must be in [1, {MAX_CORPUS_ROWS}]")
    if req.topK < 1 or req.topK > min(MAX_TOP_K, len(req.corpus)):
        _fail("INVALID_TOPK", f"topK must be in [1, {min(MAX_TOP_K, len(req.corpus))}]")
    if req.deadlineMs is not None and req.deadlineMs <= 0:
        _fail("DEADLINE_INVALID", "deadlineMs must be positive")

    seen: set[str] = set()
    try:
        query = _normalize(req.query.vector, "query")
        corpus_vectors: list[list[float]] = []
        for index, row in enumerate(req.corpus):
            packet_key = row.packetKey.strip()
            if not packet_key:
                raise ValueError(f"corpus[{index}] missing packetKey")
            if packet_key in seen:
                raise ValueError(f"duplicate packetKey {packet_key}")
            seen.add(packet_key)
            corpus_vectors.append(_normalize(row.vector, f"corpus[{index}]"))
    except ValueError as exc:
        _fail("SEMANTIC512_INVALID", str(exc))

    started = time.perf_counter()
    query_array = cp.asarray([query], dtype=cp.float32)
    corpus_array = cp.asarray(corpus_vectors, dtype=cp.float32)
    index = brute_force.build(corpus_array, metric="cosine")
    distances, neighbors = brute_force.search(index, query_array, k=req.topK)
    duration_ms = (time.perf_counter() - started) * 1000
    if req.deadlineMs is not None and duration_ms >= req.deadlineMs:
        _fail("DEADLINE_EXCEEDED", f"{duration_ms:.2f}ms >= {req.deadlineMs}ms", 408)

    neighbor_ids = cp.asnumpy(neighbors)[0].tolist()
    neighbor_distances = cp.asnumpy(distances)[0].tolist()
    results: list[dict[str, Any]] = []
    for rank, (row_index, distance) in enumerate(zip(neighbor_ids, neighbor_distances), start=1):
        row = req.corpus[int(row_index)]
        distance_value = float(distance)
        results.append(
            {
                "rank": rank,
                "rowIndex": int(row_index),
                "packetKey": row.packetKey,
                "sourceRevision": row.sourceRevision,
                "sourceRef": row.sourceRef,
                "symbolVersionId": row.symbolVersionId,
                "treeNodeId": row.treeNodeId,
                "featureLabel": row.featureLabel,
                "cosineDistance": distance_value,
                "cosineSimilarity": 1.0 - distance_value,
            }
        )

    return {
        "schema": "atlas.semantic512-exact-knn-receipt.v1",
        "operation": "knn.exact",
        "backend": "cuvs.neighbors.brute_force",
        "metric": "cosine",
        "algorithmRevision": ALGORITHM_REVISION,
        "identityRequirement": "packet_key",
        "sourceFreshnessAuthority": "external-mutation-awareness-receipt",
        "representationId": "semantic_512",
        "representationRevision": req.query.representationRevision,
        "dimension": SEMANTIC_DIM,
        "corpusRows": len(req.corpus),
        "topK": req.topK,
        "identityManifestChecksum": _identity_checksum(req.corpus),
        "durationMs": round(duration_ms, 3),
        "results": results,
    }


def install_semantic512_exact_v2_routes(
    app: FastAPI,
    gpu_memory_reader: Callable[[], dict[str, Any] | None] | None = None,
) -> None:
    router = APIRouter(prefix="/v1/semantic512", tags=["atlas-semantic512-v2"])

    @router.post("/knn/exact-v2")
    def exact_v2(req: ExactRequestV2) -> dict[str, Any]:
        if gpu_memory_reader is not None:
            memory = gpu_memory_reader()
            if memory and isinstance(memory.get("free_mb"), (int, float)):
                if float(memory["free_mb"]) < MIN_FREE_GPU_MB:
                    _fail(
                        "INSUFFICIENT_GPU_MEMORY",
                        f"{memory['free_mb']}MB free < {MIN_FREE_GPU_MB}MB semantic512 floor",
                        503,
                    )
        return exact_semantic512_v2(req)

    app.include_router(router)
