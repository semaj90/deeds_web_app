"""Thin read-only Parent Atlas GPU executor host.

This service owns execution only. PostgreSQL remains canonical and Arrow IPC is
an input artifact; no endpoint here performs persistence or identity mutation.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.ipc as ipc
import pyarrow.parquet as pq
try:
    import torch
except ImportError:  # Graph-only images do not need the optional tensor lane.
    torch = None  # type: ignore[assignment]
try:
    import cupy
except ImportError:  # pragma: no cover - depends on the RAPIDS image
    cupy = None  # type: ignore[assignment]
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


RUNTIME_ROOT = Path(__file__).resolve().parents[2] / "python"
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

from atlas_rapids_graph_runtime import install_graph_routes  # noqa: E402
from shared_residency import SharedGpuResidencyLease, validate_shared_residency_lease  # noqa: E402
from atlas_semantic512_runtime import (  # noqa: E402
    Latent64KMeansRequest,
    cluster_latent64,
)
from knn_contract import (  # noqa: E402
    deterministic_topk_from_scores,
    deterministic_topk_with_boundary,
)


ARTIFACT_ROOT = Path(os.getenv("ATLAS_GPU_ARTIFACT_ROOT", "/mnt/c/Users/james/Videos/deeds-web-app")).resolve()
PORT = int(os.getenv("ATLAS_GPU_8098_PORT", "8098"))
REQUIRE_SHARED_RESIDENCY_LEASE = os.getenv("ATLAS_GPU_REQUIRE_SHARED_RESIDENCY_LEASE", "0").lower() in {"1", "true", "yes"}


class ArtifactRequest(BaseModel):
    artifactPath: str = Field(min_length=1)


class ExactScanRequest(ArtifactRequest):
    query: list[float] = Field(min_length=768, max_length=768)
    limit: int = Field(default=10, ge=1, le=128)
    residencyLease: SharedGpuResidencyLease | None = None


class EnrichmentRequest(ArtifactRequest):
    featurePath: str = Field(min_length=1)


class Latent64KMeansExecutionRequest(Latent64KMeansRequest):
    residencyLease: SharedGpuResidencyLease | None = None


app = FastAPI(title="Parent Atlas GPU Executor", version="1.0.0")

GRAPH_RESIDENT: dict[str, Any] = {}

# Graph execution is owned by the revision-aware runtime. Tile endpoints below
# remain in this host, but graph load/PageRank must share one validated manager.
GRAPH_RUNTIME = install_graph_routes(app)


def cuda_available() -> bool:
    return bool(cupy is not None and cupy.cuda.runtime.getDeviceCount() > 0)


def resolve_artifact(relative_path: str) -> Path:
    candidate = (ARTIFACT_ROOT / relative_path).resolve()
    if candidate != ARTIFACT_ROOT and ARTIFACT_ROOT not in candidate.parents:
        raise HTTPException(status_code=400, detail="ARTIFACT_PATH_OUTSIDE_ALLOWED_ROOT")
    if candidate.suffix != ".arrow" or not candidate.is_file():
        raise HTTPException(status_code=404, detail="ARROW_ARTIFACT_NOT_FOUND")
    return candidate


def resolve_json_artifact(relative_path: str) -> Path:
    candidate = (ARTIFACT_ROOT / relative_path).resolve()
    if candidate != ARTIFACT_ROOT and ARTIFACT_ROOT not in candidate.parents:
        raise HTTPException(status_code=400, detail="FEATURE_PATH_OUTSIDE_ALLOWED_ROOT")
    if candidate.suffix != ".json" or not candidate.is_file():
        raise HTTPException(status_code=404, detail="FEATURE_ARTIFACT_NOT_FOUND")
    return candidate


def load_table(path: Path) -> tuple[Any, str]:
    raw = path.read_bytes()
    checksum = "sha256:" + hashlib.sha256(raw).hexdigest()
    try:
        table = ipc.open_file(pa.BufferReader(raw)).read_all()
    except Exception as exc:  # pragma: no cover - exercised by service runtime
        raise HTTPException(status_code=400, detail=f"ARROW_IPC_READ_FAILED:{exc}") from exc
    required = {"candidate_ordinal", "tile_index", "vector_dimensions", "vector_f32"}
    missing = required.difference(table.column_names)
    if missing:
        raise HTTPException(status_code=400, detail=f"ARROW_TILE_COLUMNS_MISSING:{sorted(missing)}")
    return table, checksum


def require_residency(request: Any, expected_executor: str) -> dict[str, object]:
    try:
        return validate_shared_residency_lease(
            request.residencyLease,
            expected_executor=expected_executor,
            required=REQUIRE_SHARED_RESIDENCY_LEASE,
        )
    except ValueError as exc:
        raise HTTPException(status_code=428, detail=str(exc)) from exc


def vectors_on_cuda(table: Any) -> torch.Tensor:
    if torch is None or not torch.cuda.is_available():
        raise HTTPException(status_code=503, detail="CUDA_DEVICE_UNAVAILABLE")
    blobs = table.column("vector_f32").to_pylist()
    if not blobs:
        raise HTTPException(status_code=400, detail="ARROW_TILE_ARTIFACT_EMPTY")
    rows = []
    for blob in blobs:
        if blob is None or len(blob) != 768 * 4:
            raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_BYTES_INVALID")
        rows.append(torch.frombuffer(bytearray(blob), dtype=torch.float32).clone())
    vectors = torch.stack(rows, dim=0).to(device="cuda", dtype=torch.float32)
    if not bool(torch.isfinite(vectors).all().item()):
        raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_NONFINITE")
    norms = torch.linalg.vector_norm(vectors, dim=1, keepdim=True)
    if bool((norms <= 0).any().item()):
        raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_ZERO_NORM")
    return vectors / norms


def vectors_on_cupy(table: Any) -> Any:
    if cupy is None or not cuda_available():
        raise HTTPException(status_code=503, detail="CUDA_DEVICE_UNAVAILABLE")
    blobs = table.column("vector_f32").to_pylist()
    if not blobs:
        raise HTTPException(status_code=400, detail="ARROW_TILE_ARTIFACT_EMPTY")
    rows = []
    for blob in blobs:
        if blob is None or len(blob) != 768 * 4:
            raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_BYTES_INVALID")
        rows.append(cupy.frombuffer(blob, dtype=cupy.float32).copy())
    vectors = cupy.stack(rows, axis=0).astype(cupy.float32, copy=False)
    if not bool(cupy.isfinite(vectors).all().item()):
        raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_NONFINITE")
    norms = cupy.linalg.norm(vectors, axis=1, keepdims=True)
    if bool((norms <= 0).any().item()):
        raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_ZERO_NORM")
    return vectors / norms


def query_on_cuda(query_values: list[float]) -> torch.Tensor:
    query = torch.tensor(query_values, dtype=torch.float32, device="cuda")
    if not bool(torch.isfinite(query).all().item()):
        raise HTTPException(status_code=400, detail="QUERY_VECTOR_NONFINITE")
    norm = torch.linalg.vector_norm(query)
    if float(norm.item()) <= 0:
        raise HTTPException(status_code=400, detail="QUERY_VECTOR_ZERO_NORM")
    return query / norm


def query_on_cupy(query_values: list[float]) -> Any:
    query = cupy.asarray(query_values, dtype=cupy.float32)
    if not bool(cupy.isfinite(query).all().item()):
        raise HTTPException(status_code=400, detail="QUERY_VECTOR_NONFINITE")
    norm = cupy.linalg.norm(query)
    if float(norm.item()) <= 0:
        raise HTTPException(status_code=400, detail="QUERY_VECTOR_ZERO_NORM")
    return query / norm


@app.get("/health")
def health() -> dict[str, Any]:
    has_cuda = cuda_available()
    return {
        "ok": True,
        "service": "atlas-gpu-8098",
        "executionOnly": True,
        "cudaAvailable": has_cuda,
        "device": cupy.cuda.runtime.getDeviceProperties(0).get("name", b"").decode(errors="replace") if has_cuda else None,
        "torchAvailable": torch is not None,
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


@app.post("/v1/semantic512/kmeans")
def semantic512_kmeans(request: Latent64KMeansExecutionRequest) -> dict[str, Any]:
    residency = require_residency(request, "cuml")
    cluster_request = Latent64KMeansRequest.model_validate(
        request.model_dump(exclude={"residencyLease"})
    )
    result = cluster_latent64(cluster_request)
    return {
        **result,
        "canonicalAuthority": False,
        "residency": residency,
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


@app.post("/v1/tile-artifact/inspect")
def inspect_artifact(request: ArtifactRequest) -> dict[str, Any]:
    path = resolve_artifact(request.artifactPath)
    table, checksum = load_table(path)
    return {
        "status": "ARROW_TILE_ARTIFACT_INSPECTED",
        "artifactChecksum": checksum,
        "rowCount": table.num_rows,
        "columns": table.column_names,
        "executionBackend": "NONE_READ_ONLY_INSPECTION",
        "canonicalAuthority": False,
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


@app.post("/v1/tile-artifact/enrich")
def enrich_artifact(request: EnrichmentRequest) -> dict[str, Any]:
    """Join optional graph features by CandidateOrdinal; never ranks or writes."""
    table, artifact_checksum = load_table(resolve_artifact(request.artifactPath))
    feature_path = resolve_json_artifact(request.featurePath)
    feature_report = json.loads(feature_path.read_text(encoding="utf-8"))
    if feature_report.get("status") != "CURRENT_GRAPH_FEATURE_GATHER_PROVEN_BOUNDED":
        raise HTTPException(status_code=400, detail=f"GRAPH_FEATURE_REPORT_NOT_PROVEN:{feature_report.get('status')}")
    known_ordinals = sorted({int(value) for value in table.column("candidate_ordinal").to_pylist()})
    by_ordinal = {int(row["candidateOrdinal"]): row for row in feature_report.get("features", [])}
    rows = []
    for ordinal in known_ordinals:
        feature = by_ordinal.get(ordinal)
        rows.append({
            "candidateOrdinal": ordinal,
            "graphFeaturePresent": feature is not None,
            "pagerankMax": feature.get("pagerankMax") if feature else None,
            "pagerankMean": feature.get("pagerankMean") if feature else None,
            "pagerankSum": feature.get("pagerankSum") if feature else None,
            "graphNodeCount": feature.get("graphNodeCount") if feature else None,
            "presence": feature.get("presence") if feature else {"pagerank": 0, "graphNodeCount": 0},
        })
    return {
        "status": "GPU_TILE_GRAPH_FEATURE_ENRICHMENT_PROVEN_BOUNDED",
        "artifactChecksum": artifact_checksum,
        "graphRevision": feature_report.get("graphRevision"),
        "featureRevision": feature_report.get("featureRevision"),
        "candidateCount": len(rows),
        "graphFeaturePresentCount": sum(1 for row in rows if row["graphFeaturePresent"]),
        "graphFeatureAbsentCount": sum(1 for row in rows if not row["graphFeaturePresent"]),
        "rows": rows,
        "rankingPromotion": False,
        "logicalLaneVote": "NONE",
        "canonicalAuthority": False,
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


@app.post("/v1/tile-artifact/exact-scan")
def exact_scan(request: ExactScanRequest) -> dict[str, Any]:
    residency = require_residency(request, "pytorch_cuda")
    path = resolve_artifact(request.artifactPath)
    table, checksum = load_table(path)
    vectors = vectors_on_cuda(table)
    query = query_on_cuda(request.query)
    scores = torch.mv(vectors, query)
    ordinals = table.column("candidate_ordinal").to_pylist()
    try:
        ranked = deterministic_topk_from_scores(
            scores.cpu().tolist(), ordinals, limit=request.limit
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"KNN_RESULT_INVALID:{exc}") from exc
    tiles = table.column("tile_index").to_pylist()
    rows = [
        {"candidateOrdinal": int(ordinal), "tileIndex": int(tiles[index]), "score": score}
        for score, ordinal, index in ranked
    ]
    return {
        "status": "CUDA_EXACT_TILE_SCAN_PROVEN",
        "artifactChecksum": checksum,
        "executionBackend": "PYTORCH_CUDA_EXACT_TILE_SCAN",
        "metricContract": "float32_l2_normalized_cosine_similarity_higher_is_better",
        "rows": rows,
        "canonicalAuthority": False,
        "logicalLaneVote": "NONE",
        "residency": residency,
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


@app.post("/v1/tile-artifact/cuvs-exact-scan")
def cuvs_exact_scan(request: ExactScanRequest) -> dict[str, Any]:
    """Run cuVS brute-force search; this is one semantic executor result."""
    residency = require_residency(request, "cuvs")
    try:
        from cuvs.neighbors import brute_force
    except Exception as exc:  # pragma: no cover - depends on WSL RAPIDS image
        raise HTTPException(status_code=503, detail=f"CUVS_UNAVAILABLE:{exc}") from exc

    path = resolve_artifact(request.artifactPath)
    table, checksum = load_table(path)
    dataset = vectors_on_cupy(table)
    query = query_on_cupy(request.query)
    index = brute_force.build(dataset, metric="cosine")
    ordinals = table.column("candidate_ordinal").to_pylist()

    def search(search_limit: int) -> tuple[list[float], list[int]]:
        distances, neighbors = brute_force.search(index, query.reshape(1, -1), search_limit)
        if hasattr(distances, "copy_to_host"):
            distances = distances.copy_to_host()
        elif hasattr(distances, "get"):
            distances = distances.get()
        if hasattr(neighbors, "copy_to_host"):
            neighbors = neighbors.copy_to_host()
        elif hasattr(neighbors, "get"):
            neighbors = neighbors.get()
        return distances[0].tolist(), neighbors[0].tolist()

    try:
        ranked = deterministic_topk_with_boundary(search, ordinals, limit=request.limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"KNN_RESULT_INVALID:{exc}") from exc
    tiles = table.column("tile_index").to_pylist()
    rows = [
        {"candidateOrdinal": int(ordinal), "tileIndex": int(tiles[index]), "distance": distance, "score": float(1 - distance)}
        for distance, ordinal, index in ranked
    ]
    return {
        "status": "CUVS_EXACT_TILE_SCAN_PROVEN",
        "artifactChecksum": checksum,
        "executionBackend": "CUVS_BRUTE_FORCE",
        "metricContract": "float32_l2_normalized_cosine_distance_1_minus_similarity",
        "tieBreak": "distance_ascending_then_candidate_ordinal_ascending_after_complete_boundary_tie_fetch",
        "rows": rows,
        "canonicalAuthority": False,
        "logicalLaneVote": "NONE",
        "residency": residency,
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
