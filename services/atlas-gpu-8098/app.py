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
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


RUNTIME_ROOT = Path(__file__).resolve().parents[2] / "python"
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

from atlas_rapids_graph_runtime import install_graph_routes  # noqa: E402


ARTIFACT_ROOT = Path(os.getenv("ATLAS_GPU_ARTIFACT_ROOT", "/mnt/c/Users/james/Videos/deeds-web-app")).resolve()
PORT = int(os.getenv("ATLAS_GPU_8098_PORT", "8098"))


class ArtifactRequest(BaseModel):
    artifactPath: str = Field(min_length=1)


class ExactScanRequest(ArtifactRequest):
    query: list[float] = Field(min_length=768, max_length=768)
    limit: int = Field(default=10, ge=1, le=128)


class EnrichmentRequest(ArtifactRequest):
    featurePath: str = Field(min_length=1)


app = FastAPI(title="Parent Atlas GPU Executor", version="1.0.0")

GRAPH_RESIDENT: dict[str, Any] = {}

# Graph execution is owned by the revision-aware runtime. Tile endpoints below
# remain in this host, but graph load/PageRank must share one validated manager.
GRAPH_RUNTIME = install_graph_routes(app)


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


def vectors_on_cuda(table: Any) -> torch.Tensor:
    if not torch.cuda.is_available():
        raise HTTPException(status_code=503, detail="CUDA_DEVICE_UNAVAILABLE")
    blobs = table.column("vector_f32").to_pylist()
    if not blobs:
        raise HTTPException(status_code=400, detail="ARROW_TILE_ARTIFACT_EMPTY")
    rows = []
    for blob in blobs:
        if blob is None or len(blob) != 768 * 4:
            raise HTTPException(status_code=400, detail="ARROW_TILE_VECTOR_BYTES_INVALID")
        rows.append(torch.frombuffer(bytearray(blob), dtype=torch.float32).clone())
    return torch.stack(rows, dim=0).to(device="cuda", dtype=torch.float32)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "atlas-gpu-8098",
        "executionOnly": True,
        "cudaAvailable": bool(torch.cuda.is_available()),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
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
    path = resolve_artifact(request.artifactPath)
    table, checksum = load_table(path)
    vectors = vectors_on_cuda(table)
    query = torch.tensor(request.query, dtype=torch.float32, device="cuda")
    query = query / torch.linalg.vector_norm(query)
    scores = torch.mv(vectors, query)
    limit = min(request.limit, int(scores.numel()))
    values, indices = torch.topk(scores, k=limit, largest=True, sorted=True)
    ordinals = table.column("candidate_ordinal").to_pylist()
    tiles = table.column("tile_index").to_pylist()
    rows = [
        {"candidateOrdinal": int(ordinals[int(index)]), "tileIndex": int(tiles[int(index)]), "score": float(value)}
        for value, index in zip(values.cpu().tolist(), indices.cpu().tolist(), strict=True)
    ]
    return {
        "status": "CUDA_EXACT_TILE_SCAN_PROVEN",
        "artifactChecksum": checksum,
        "executionBackend": "PYTORCH_CUDA_EXACT_TILE_SCAN",
        "rows": rows,
        "canonicalAuthority": False,
        "logicalLaneVote": "NONE",
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


@app.post("/v1/tile-artifact/cuvs-exact-scan")
def cuvs_exact_scan(request: ExactScanRequest) -> dict[str, Any]:
    """Run cuVS brute-force search; this is one semantic executor result."""
    try:
        from cuvs.neighbors import brute_force
    except Exception as exc:  # pragma: no cover - depends on WSL RAPIDS image
        raise HTTPException(status_code=503, detail=f"CUVS_UNAVAILABLE:{exc}") from exc

    path = resolve_artifact(request.artifactPath)
    table, checksum = load_table(path)
    dataset = vectors_on_cuda(table)
    query = torch.tensor(request.query, dtype=torch.float32, device="cuda")
    query = query / torch.linalg.vector_norm(query)
    index = brute_force.build(dataset, metric="cosine")
    distances, neighbors = brute_force.search(index, query.reshape(1, -1), min(request.limit, int(dataset.shape[0])))
    if hasattr(distances, "copy_to_host"):
        distances = distances.copy_to_host()
    elif hasattr(distances, "get"):
        distances = distances.get()
    if hasattr(neighbors, "copy_to_host"):
        neighbors = neighbors.copy_to_host()
    elif hasattr(neighbors, "get"):
        neighbors = neighbors.get()
    distance_values = distances[0].tolist()
    neighbor_values = neighbors[0].tolist()
    ordinals = table.column("candidate_ordinal").to_pylist()
    tiles = table.column("tile_index").to_pylist()
    rows = [
        {"candidateOrdinal": int(ordinals[int(index)]), "tileIndex": int(tiles[int(index)]), "distance": float(distance), "score": float(1 - distance)}
        for distance, index in zip(distance_values, neighbor_values, strict=True)
    ]
    return {
        "status": "CUVS_EXACT_TILE_SCAN_PROVEN",
        "artifactChecksum": checksum,
        "executionBackend": "CUVS_BRUTE_FORCE",
        "rows": rows,
        "canonicalAuthority": False,
        "logicalLaneVote": "NONE",
        "writes": {"postgres": False, "qdrant": False, "valkey": False},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
