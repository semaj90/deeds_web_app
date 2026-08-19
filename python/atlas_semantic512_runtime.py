"""GPU executors for Parent Atlas semantic_512 and latent_64 routing.

Roles are intentionally separate:
- semantic_512 + cuVS brute_force(metric='cosine') = exact semantic oracle.
- latent_64 + cuML KMeans = routing/partition metadata only.

Neither executor owns packet identity, tree_node_id, feature_label, or graph truth.
All returned rows preserve the caller's revision-qualified identity manifest.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from typing import Any, Callable

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import cupy as cp
    from cuvs.neighbors import brute_force
except Exception as exc:  # pragma: no cover - runtime dependent
    cp = None  # type: ignore[assignment]
    brute_force = None  # type: ignore[assignment]
    _CUVS_ERROR: str | None = f"{type(exc).__name__}: {exc}"
else:
    _CUVS_ERROR = None

try:
    from cuml.cluster import KMeans
except Exception as exc:  # pragma: no cover - runtime dependent
    KMeans = None  # type: ignore[assignment]
    _CUML_ERROR: str | None = f"{type(exc).__name__}: {exc}"
else:
    _CUML_ERROR = None

SEMANTIC_DIM = 512
LATENT_DIM = 64
SEMANTIC_REPRESENTATION = "semantic_512"
LATENT_REPRESENTATION = "latent_64"
SEMANTIC_ALGORITHM_REVISION = "atlas.cuvs-exact-cosine.semantic512.v1"
KMEANS_ALGORITHM_REVISION = "atlas.cuml-kmeans.latent64.v1"
MAX_CORPUS_ROWS = int(os.getenv("ATLAS_SEMANTIC512_MAX_CORPUS_ROWS", "25000"))
MAX_TOP_K = int(os.getenv("ATLAS_SEMANTIC512_MAX_TOPK", "512"))
MAX_KMEANS_ROWS = int(os.getenv("ATLAS_LATENT64_KMEANS_MAX_ROWS", "250000"))
MAX_CLUSTERS = int(os.getenv("ATLAS_LATENT64_KMEANS_MAX_CLUSTERS", "4096"))
MIN_FREE_GPU_MB = float(os.getenv("ATLAS_SEMANTIC512_MIN_FREE_GPU_MB", "384"))


class IdentityRow(BaseModel):
    packetKey: str
    sourceRevision: str
    symbolVersionId: str | None = None
    treeNodeId: str | None = None
    featureLabel: str | None = None


class Semantic512Row(IdentityRow):
    vector: list[float]


class Semantic512Query(BaseModel):
    vector: list[float]
    representationId: str = SEMANTIC_REPRESENTATION
    representationRevision: str


class ExactSemantic512Request(BaseModel):
    query: Semantic512Query
    corpus: list[Semantic512Row]
    topK: int = 100
    deadlineMs: int | None = None


class Latent64Row(IdentityRow):
    vector: list[float]


class Latent64KMeansRequest(BaseModel):
    rows: list[Latent64Row]
    sourceRepresentationId: str = SEMANTIC_REPRESENTATION
    autoencoderRevision: str
    nClusters: int
    randomState: int = 42
    maxIter: int = 300
    tol: float = 1e-4


class RoutedTopKRequest(BaseModel):
    query: Semantic512Query
    queryLatent64: list[float]
    corpus: list[Semantic512Row]
    corpusLatent64: list[Latent64Row]
    clusterAssignments: dict[str, int]
    queryClusterId: int
    topK: int = 100
    minRouteCandidates: int = 128


def _fail(code: str, message: str, status_code: int = 422) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _l2_normalized(values: list[float], dim: int, label: str) -> list[float]:
    if len(values) != dim:
        raise ValueError(f"{label} dimension {len(values)} != {dim}")
    if not all(math.isfinite(float(value)) for value in values):
        raise ValueError(f"{label} contains non-finite values")
    norm = math.sqrt(sum(float(value) * float(value) for value in values))
    if norm <= 0:
        raise ValueError(f"{label} has zero norm")
    return [float(value) / norm for value in values]


def _validate_identity(rows: list[IdentityRow], label: str) -> None:
    seen: set[tuple[str, str]] = set()
    for index, row in enumerate(rows):
        if not row.packetKey.strip():
            raise ValueError(f"{label}[{index}] missing packetKey")
        if not row.sourceRevision.strip():
            raise ValueError(f"{label}[{index}] missing sourceRevision")
        identity = (row.packetKey, row.sourceRevision)
        if identity in seen:
            raise ValueError(f"duplicate {label} identity {identity}")
        seen.add(identity)


def _manifest_checksum(rows: list[IdentityRow]) -> str:
    payload = [
        {
            "packetKey": row.packetKey,
            "sourceRevision": row.sourceRevision,
            "symbolVersionId": row.symbolVersionId,
            "treeNodeId": row.treeNodeId,
            "featureLabel": row.featureLabel,
        }
        for row in rows
    ]
    return hashlib.sha256(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def _device_row(array: Any) -> list[Any]:
    host = cp.asnumpy(array)
    if getattr(host, "ndim", 1) > 1:
        host = host[0]
    return host.tolist()


def exact_semantic512(req: ExactSemantic512Request) -> dict[str, Any]:
    if _CUVS_ERROR is not None or cp is None or brute_force is None:
        _fail("CUVS_UNAVAILABLE", _CUVS_ERROR or "cuVS unavailable", 503)
    if req.query.representationId != SEMANTIC_REPRESENTATION:
        _fail("REPRESENTATION_MISMATCH", f"expected {SEMANTIC_REPRESENTATION}")
    if not req.query.representationRevision.strip():
        _fail("REPRESENTATION_REVISION_REQUIRED", "representationRevision is required")
    if not req.corpus or len(req.corpus) > MAX_CORPUS_ROWS:
        _fail("CORPUS_SIZE_INVALID", f"corpus size must be in [1, {MAX_CORPUS_ROWS}]")
    if req.topK < 1 or req.topK > min(MAX_TOP_K, len(req.corpus)):
        _fail("INVALID_TOPK", f"topK must be in [1, {min(MAX_TOP_K, len(req.corpus))}]")
    if req.deadlineMs is not None and req.deadlineMs <= 0:
        _fail("DEADLINE_INVALID", "deadlineMs must be positive")

    try:
        _validate_identity(req.corpus, "corpus")
        query = _l2_normalized(req.query.vector, SEMANTIC_DIM, "query")
        corpus = [_l2_normalized(row.vector, SEMANTIC_DIM, f"corpus[{i}]") for i, row in enumerate(req.corpus)]
    except ValueError as exc:
        _fail("SEMANTIC512_INVALID", str(exc))

    started = time.perf_counter()
    query_arr = cp.asarray([query], dtype=cp.float32)
    corpus_arr = cp.asarray(corpus, dtype=cp.float32)
    # Explicit metric is mandatory: cuVS brute_force defaults to squared
    # Euclidean, which is useful for a mechanics smoke test but is not the
    # Parent Atlas semantic cosine contract.
    index = brute_force.build(corpus_arr, metric="cosine")
    distances, neighbors = brute_force.search(index, query_arr, k=req.topK)
    duration_ms = (time.perf_counter() - started) * 1000
    if req.deadlineMs is not None and duration_ms >= req.deadlineMs:
        _fail("DEADLINE_EXCEEDED", f"{duration_ms:.2f}ms >= {req.deadlineMs}ms", 408)

    neighbor_ids = _device_row(neighbors)
    neighbor_distances = _device_row(distances)
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
        "algorithmRevision": SEMANTIC_ALGORITHM_REVISION,
        "representationId": SEMANTIC_REPRESENTATION,
        "representationRevision": req.query.representationRevision,
        "dimension": SEMANTIC_DIM,
        "corpusRows": len(req.corpus),
        "topK": req.topK,
        "identityManifestChecksum": _manifest_checksum(req.corpus),
        "durationMs": round(duration_ms, 3),
        "results": results,
    }


def cluster_latent64(req: Latent64KMeansRequest) -> dict[str, Any]:
    if _CUML_ERROR is not None or cp is None or KMeans is None:
        _fail("CUML_UNAVAILABLE", _CUML_ERROR or "cuML unavailable", 503)
    if req.sourceRepresentationId != SEMANTIC_REPRESENTATION:
        _fail("SOURCE_REPRESENTATION_MISMATCH", f"expected {SEMANTIC_REPRESENTATION}")
    if not req.autoencoderRevision.strip():
        _fail("AUTOENCODER_REVISION_REQUIRED", "autoencoderRevision is required")
    if not req.rows or len(req.rows) > MAX_KMEANS_ROWS:
        _fail("KMEANS_ROW_COUNT_INVALID", f"row count must be in [1, {MAX_KMEANS_ROWS}]")
    if req.nClusters < 2 or req.nClusters > min(MAX_CLUSTERS, len(req.rows)):
        _fail("KMEANS_CLUSTER_COUNT_INVALID", f"nClusters must be in [2, {min(MAX_CLUSTERS, len(req.rows))}]")
    if req.maxIter < 1 or req.maxIter > 10_000:
        _fail("KMEANS_MAX_ITER_INVALID", "maxIter must be in [1, 10000]")
    if not math.isfinite(req.tol) or req.tol <= 0:
        _fail("KMEANS_TOL_INVALID", "tol must be finite and > 0")

    try:
        _validate_identity(req.rows, "rows")
        vectors = [_l2_normalized(row.vector, LATENT_DIM, f"rows[{i}]") for i, row in enumerate(req.rows)]
    except ValueError as exc:
        _fail("LATENT64_INVALID", str(exc))

    matrix = cp.asarray(vectors, dtype=cp.float32)
    started = time.perf_counter()
    model = KMeans(
        n_clusters=req.nClusters,
        init="scalable-k-means++",
        n_init="auto",
        max_iter=req.maxIter,
        tol=req.tol,
        random_state=req.randomState,
        output_type="cupy",
    )
    labels = model.fit_predict(matrix)
    duration_ms = (time.perf_counter() - started) * 1000
    labels_host = cp.asnumpy(labels).tolist()
    centers_host = cp.asnumpy(model.cluster_centers_).tolist()

    assignments = [
        {
            "packetKey": row.packetKey,
            "sourceRevision": row.sourceRevision,
            "symbolVersionId": row.symbolVersionId,
            "treeNodeId": row.treeNodeId,
            "featureLabel": row.featureLabel,
            "clusterId": int(labels_host[index]),
        }
        for index, row in enumerate(req.rows)
    ]

    return {
        "schema": "atlas.latent64-kmeans-receipt.v1",
        "operation": "routing.kmeans",
        "backend": "cuml.cluster.KMeans",
        "algorithmRevision": KMEANS_ALGORITHM_REVISION,
        "evidenceAuthority": False,
        "sourceRepresentationId": SEMANTIC_REPRESENTATION,
        "latentRepresentationId": LATENT_REPRESENTATION,
        "autoencoderRevision": req.autoencoderRevision,
        "dimension": LATENT_DIM,
        "rowCount": len(req.rows),
        "nClusters": req.nClusters,
        "randomState": req.randomState,
        "maxIter": req.maxIter,
        "tol": req.tol,
        "inertia": float(model.inertia_),
        "identityManifestChecksum": _manifest_checksum(req.rows),
        "durationMs": round(duration_ms, 3),
        "centroids": centers_host,
        "assignments": assignments,
    }


def routed_topk(req: RoutedTopKRequest) -> dict[str, Any]:
    """Evaluate one-cluster routing against the full semantic_512 exact oracle.

    This is deliberately an evaluation/promotion gate. The routed result is
    exact cosine inside the selected subset, but the receipt also computes
    recall against the full-corpus exact top-K so a bad clustering policy cannot
    silently become the online semantic authority.
    """
    _validate_identity(req.corpus, "corpus")
    _validate_identity(req.corpusLatent64, "corpusLatent64")
    if len(req.corpus) != len(req.corpusLatent64):
        _fail("ROUTING_ROW_COUNT_MISMATCH", "semantic and latent manifests must have equal row counts")
    semantic_by_key = {row.packetKey: row for row in req.corpus}
    latent_keys = {row.packetKey for row in req.corpusLatent64}
    if set(semantic_by_key) != latent_keys:
        _fail("ROUTING_IDENTITY_MISMATCH", "semantic and latent packet_key sets differ")

    full = exact_semantic512(
        ExactSemantic512Request(query=req.query, corpus=req.corpus, topK=req.topK)
    )
    routed_rows = [
        row
        for row in req.corpus
        if req.clusterAssignments.get(row.packetKey) == req.queryClusterId
    ]
    if len(routed_rows) < min(req.minRouteCandidates, len(req.corpus)):
        # Fail open to full exact corpus when the route is too narrow.
        routed_rows = req.corpus
        route_fallback = True
    else:
        route_fallback = False

    routed = exact_semantic512(
        ExactSemantic512Request(
            query=req.query,
            corpus=routed_rows,
            topK=min(req.topK, len(routed_rows)),
        )
    )
    full_keys = {row["packetKey"] for row in full["results"]}
    routed_keys = {row["packetKey"] for row in routed["results"]}
    recall = len(full_keys & routed_keys) / max(1, len(full_keys))

    return {
        "schema": "atlas.semantic512-routed-topk-receipt.v1",
        "sourceRepresentationId": SEMANTIC_REPRESENTATION,
        "routingRepresentationId": LATENT_REPRESENTATION,
        "queryClusterId": req.queryClusterId,
        "routedCorpusRows": len(routed_rows),
        "fullCorpusRows": len(req.corpus),
        "routeFallbackToFullCorpus": route_fallback,
        "topK": req.topK,
        "recallAtK": recall,
        "fullExact": full,
        "routedExact": routed,
    }


def install_semantic512_routes(
    app: FastAPI,
    gpu_memory_reader: Callable[[], dict[str, Any] | None] | None = None,
) -> None:
    router = APIRouter(prefix="/v1/semantic512", tags=["atlas-semantic512"])

    def _guard_memory() -> None:
        if gpu_memory_reader is None:
            return
        memory = gpu_memory_reader()
        if memory and isinstance(memory.get("free_mb"), (int, float)):
            if float(memory["free_mb"]) < MIN_FREE_GPU_MB:
                _fail(
                    "INSUFFICIENT_GPU_MEMORY",
                    f"{memory['free_mb']}MB free < {MIN_FREE_GPU_MB}MB semantic512 floor",
                    503,
                )

    @router.get("/capabilities")
    def semantic512_capabilities() -> dict[str, Any]:
        return {
            "representationId": SEMANTIC_REPRESENTATION,
            "semanticDimension": SEMANTIC_DIM,
            "latentRepresentationId": LATENT_REPRESENTATION,
            "latentDimension": LATENT_DIM,
            "knnExact": {"available": _CUVS_ERROR is None, "metric": "cosine", "error": _CUVS_ERROR},
            "kmeans": {"available": _CUML_ERROR is None, "randomStateRequiredForParity": True, "error": _CUML_ERROR},
            "maxCorpusRows": MAX_CORPUS_ROWS,
            "maxTopK": MAX_TOP_K,
        }

    @router.post("/knn/exact")
    def semantic512_knn_exact(req: ExactSemantic512Request) -> dict[str, Any]:
        _guard_memory()
        return exact_semantic512(req)

    @router.post("/kmeans")
    def semantic512_kmeans(req: Latent64KMeansRequest) -> dict[str, Any]:
        _guard_memory()
        return cluster_latent64(req)

    @router.post("/topk/evaluate-route")
    def semantic512_routed_topk(req: RoutedTopKRequest) -> dict[str, Any]:
        _guard_memory()
        return routed_topk(req)

    app.include_router(router)
