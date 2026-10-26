"""Bounded MRL projection and exact-recall evaluation over a frozen 768-D artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path
from typing import Any

import numpy as np


MATRIX_DIMENSIONS = 768
MRL_DIMENSIONS = (512, 256, 128)
EXPECTED_CANONICAL_COLUMN = "codebase_chunk_index.content_embedding_768"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _within_root(root: Path, relative_path: str) -> Path:
    resolved_root = root.resolve()
    resolved = (resolved_root / relative_path).resolve()
    if resolved != resolved_root and resolved_root not in resolved.parents:
        raise ValueError("ARTIFACT_PATH_OUTSIDE_REPOSITORY")
    return resolved


def load_frozen_training_snapshot(
    manifest_path: str | Path,
    *,
    repository_root: str | Path | None = None,
) -> tuple[np.memmap, dict[str, Any], list[dict[str, Any]], list[str]]:
    manifest_file = Path(manifest_path).resolve()
    root = Path(repository_root).resolve() if repository_root else manifest_file.parents[2]
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("schema") != "atlas.frozen-semantic768-training-snapshot.v1":
        raise ValueError("UNSUPPORTED_FROZEN_SNAPSHOT_SCHEMA")
    if manifest.get("embeddingDim") != MATRIX_DIMENSIONS:
        raise ValueError("FROZEN_SNAPSHOT_MUST_BE_SEMANTIC_768")
    if manifest.get("matrixEncoding") != "IEEE754_F32LE":
        raise ValueError("UNSUPPORTED_MATRIX_ENCODING")
    if manifest.get("matrixLayout") != "row-major, shape [N, 768], no header":
        raise ValueError("UNSUPPORTED_MATRIX_LAYOUT")

    row_count = manifest.get("rowCount")
    if not isinstance(row_count, int) or row_count <= 1:
        raise ValueError("INVALID_FROZEN_ROW_COUNT")
    matrix_path = _within_root(root, str(manifest.get("matrixPath") or ""))
    ordinal_path = _within_root(root, str(manifest.get("ordinalMapPath") or ""))
    expected_size = row_count * MATRIX_DIMENSIONS * np.dtype("<f4").itemsize
    if matrix_path.stat().st_size != expected_size:
        raise ValueError("FROZEN_MATRIX_BYTE_LENGTH_MISMATCH")
    matrix_checksum = _sha256_file(matrix_path)
    if matrix_checksum != manifest.get("matrixChecksum"):
        raise ValueError("FROZEN_MATRIX_CHECKSUM_MISMATCH")

    ordinal_bytes = ordinal_path.read_bytes()
    if hashlib.sha256(ordinal_bytes).hexdigest() != manifest.get("ordinalMapChecksum"):
        raise ValueError("FROZEN_ORDINAL_MAP_CHECKSUM_MISMATCH")
    ordinal_rows = json.loads(ordinal_bytes.decode("utf-8"))
    if not isinstance(ordinal_rows, list) or len(ordinal_rows) != row_count:
        raise ValueError("FROZEN_ORDINAL_MAP_ROW_COUNT_MISMATCH")
    ids: list[str] = []
    for expected_ordinal, row in enumerate(ordinal_rows):
        if not isinstance(row, dict) or row.get("ordinal") != expected_ordinal:
            raise ValueError("FROZEN_ORDINAL_MAP_NOT_DENSE_OR_ORDERED")
        identity = row.get("id")
        if not isinstance(identity, str) or not identity:
            raise ValueError("FROZEN_ORDINAL_ID_MISSING")
        ids.append(identity)
    if len(set(ids)) != row_count:
        raise ValueError("FROZEN_ORDINAL_IDS_NOT_UNIQUE")

    matrix = np.memmap(matrix_path, mode="r", dtype="<f4", shape=(row_count, MATRIX_DIMENSIONS))
    for start in range(0, row_count, 8192):
        if not np.isfinite(matrix[start : start + 8192]).all():
            raise ValueError("FROZEN_MATRIX_HAS_NONFINITE_VALUES")
    return matrix, manifest, ordinal_rows, ids


def _stable_topk(scores: np.ndarray, excluded_ordinal: int, k: int) -> list[int]:
    values = np.asarray(scores, dtype=np.float32).copy()
    values[excluded_ordinal] = -np.inf
    ordinals = np.arange(values.shape[0], dtype=np.int64)
    return np.lexsort((ordinals, -values))[:k].astype(np.int64).tolist()


def evaluate_mrl_snapshot_v1(
    manifest_path: str | Path,
    *,
    repository_root: str | Path | None = None,
    device: str = "cuda",
    query_count: int = 16,
    top_k: int = 10,
    batch_rows: int = 2048,
) -> dict[str, Any]:
    import torch
    import torch.nn.functional as functional

    matrix, manifest, ordinal_rows, ids = load_frozen_training_snapshot(
        manifest_path,
        repository_root=repository_root,
    )
    resolved_device = torch.device(device)
    if resolved_device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA_DEVICE_UNAVAILABLE")
    if query_count < 1 or top_k < 1 or top_k >= matrix.shape[0] or batch_rows < 1:
        raise ValueError("INVALID_EVALUATION_BOUNDS")

    started = time.perf_counter()
    torch.manual_seed(0xA71A5)
    torch.use_deterministic_algorithms(True)
    if resolved_device.type == "cuda":
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.cuda.reset_peak_memory_stats(resolved_device)

    source = torch.as_tensor(np.array(matrix, dtype=np.float32, copy=True, order="C"), dtype=torch.float32, device=resolved_device)
    normalized_768 = functional.normalize(source, p=2, dim=1)
    query_ordinals = np.linspace(
        0,
        matrix.shape[0] - 1,
        num=min(query_count, matrix.shape[0]),
        dtype=np.int64,
    )
    def score_view(view: Any) -> list[list[int]]:
        rankings: list[list[int]] = []
        for query_start in range(0, query_ordinals.size, batch_rows):
            batch_ordinals = query_ordinals[query_start : query_start + batch_rows]
            batch_indices = torch.as_tensor(batch_ordinals, dtype=torch.long, device=resolved_device)
            query_vectors = view.index_select(0, batch_indices)
            scores = torch.matmul(query_vectors, view.transpose(0, 1)).detach().cpu().numpy()
            for local_index, scores_row in enumerate(scores):
                query_ordinal = int(batch_ordinals[local_index])
                rankings.append(_stable_topk(scores_row, query_ordinal, top_k))
        return rankings

    baseline_rankings = score_view(normalized_768)
    dimensions: dict[str, Any] = {}
    source_host = np.asarray(matrix)
    cpu_check_rows = min(1024, matrix.shape[0])
    cpu_checks: dict[str, Any] = {}

    for dimension in MRL_DIMENSIONS:
        projected_batches: list[Any] = []
        cpu_projection = np.empty((cpu_check_rows, dimension), dtype=np.float32)
        max_projection_error = 0.0
        for start in range(0, matrix.shape[0], batch_rows):
            end = min(start + batch_rows, matrix.shape[0])
            prefix = source[start:end, :dimension]
            if bool(torch.any(torch.linalg.vector_norm(prefix, dim=1) <= 1e-12)):
                raise ValueError(f"MRL_{dimension}_PREFIX_HAS_ZERO_NORM")
            projected = functional.normalize(prefix, p=2, dim=1)
            projected_batches.append(projected)
            check_end = min(end, cpu_check_rows)
            if start < check_end:
                cpu_values = source_host[start:check_end, :dimension].copy()
                cpu_norms = np.linalg.norm(cpu_values, axis=1, keepdims=True)
                cpu_projection[start:check_end] = cpu_values / np.maximum(cpu_norms, 1e-12)
                gpu_projection = projected[: check_end - start].detach().cpu().numpy()
                max_projection_error = max(
                    max_projection_error,
                    float(np.max(np.abs(cpu_projection[start:check_end] - gpu_projection))),
                )
        projected_view = torch.cat(projected_batches, dim=0)
        projected_rankings = score_view(projected_view)
        per_query_recall = [
            len(set(baseline).intersection(projected)) / top_k
            for baseline, projected in zip(baseline_rankings, projected_rankings, strict=True)
        ]
        dimensions[str(dimension)] = {
            "representationId": f"semantic_mrl_{dimension}",
            "dimension": dimension,
            "perVectorBytesF32": dimension * 4,
            "relativeVectorBytesVs768F32": dimension / MATRIX_DIMENSIONS,
            "meanRecallAtKAgainst768": float(np.mean(per_query_recall)),
            "queryCount": len(per_query_recall),
            "topK": top_k,
            "cpuGpuProjectionMaxAbsError": max_projection_error,
            "projectionChecksum": hashlib.sha256(
                np.ascontiguousarray(projected_view.detach().cpu().numpy(), dtype="<f4").tobytes()
            ).hexdigest(),
        }
        cpu_checks[str(dimension)] = max_projection_error <= 2e-6
        del projected_view, projected_batches

    cpu_query_count = min(4, query_ordinals.size)
    cpu_rank_parity = True
    cpu_scores = source_host
    cpu_norms = np.linalg.norm(cpu_scores, axis=1, keepdims=True)
    cpu_normalized = cpu_scores / np.maximum(cpu_norms, 1e-12)
    for query_index in range(cpu_query_count):
        ordinal = int(query_ordinals[query_index])
        cpu_rank = _stable_topk(cpu_normalized @ cpu_normalized[ordinal], ordinal, top_k)
        cpu_rank_parity = cpu_rank_parity and cpu_rank == baseline_rankings[query_index]

    torch.cuda.synchronize(resolved_device) if resolved_device.type == "cuda" else None
    peak_vram = int(torch.cuda.max_memory_allocated(resolved_device)) if resolved_device.type == "cuda" else None
    lineage_blockers = []
    if manifest.get("canonicalSourceColumn") != EXPECTED_CANONICAL_COLUMN:
        lineage_blockers.append("CANONICAL_SOURCE_COLUMN_NOT_CONFIRMED")
    canonical_identity_fields = {
        field
        for row in ordinal_rows
        for field in ("canonicalId", "canonical_id", "packetKey", "packet_key")
        if row.get(field)
    }
    if not any(field in canonical_identity_fields for field in ("canonicalId", "canonical_id", "packetKey", "packet_key")):
        lineage_blockers.append("CANONICAL_PACKET_ID_NOT_PRESENT_IN_ORDINAL_MAP")
    if manifest.get("lineageQualification") != "PROVEN":
        lineage_blockers.append("SOURCE_LINEAGE_NOT_PROVEN")
    if manifest.get("modelIdentityQualification") != "PROVEN":
        lineage_blockers.append("MODEL_IDENTITY_NOT_PROVEN")
    if not all(isinstance(row.get("sourceRevision"), str) and row.get("sourceRevision") for row in ordinal_rows):
        lineage_blockers.append("PER_ROW_SOURCE_REVISION_MISSING")
    if not all(isinstance(row.get("workspaceRevision"), str) and row.get("workspaceRevision") for row in ordinal_rows):
        lineage_blockers.append("PER_ROW_WORKSPACE_REVISION_MISSING")
    actual_source_ref_coverage = sum(bool(row.get("sourceRef")) for row in ordinal_rows)
    if manifest.get("sourceRefCoverage") != actual_source_ref_coverage:
        lineage_blockers.append("SOURCE_REF_COVERAGE_MANIFEST_MISMATCH")

    body = {
        "schema": "atlas.embeddinggemma-mrl-gpu-fanout-evaluation.v1",
        "status": "EVALUATED_FANOUT_BLOCKED" if lineage_blockers else "EVALUATED_CANDIDATE_ONLY",
        "canonicalAuthority": False,
        "fanoutEligible": False,
        "databaseWrites": 0,
        "vectorWrites": 0,
        "cacheWrites": 0,
        "input": {
            "manifestPath": str(Path(manifest_path)),
            "snapshotSchema": manifest["schema"],
            "sourceColumn": manifest.get("sourceColumn"),
            "canonicalSourceColumn": manifest.get("canonicalSourceColumn"),
            "lineageQualification": manifest.get("lineageQualification"),
            "modelIdentityQualification": manifest.get("modelIdentityQualification"),
            "matrixChecksum": manifest["matrixChecksum"],
            "ordinalMapChecksum": manifest["ordinalMapChecksum"],
            "rowCount": int(matrix.shape[0]),
            "sourceRefCoverage": actual_source_ref_coverage,
            "sourceRefCoverageManifest": manifest.get("sourceRefCoverage"),
            "canonicalIdentityFields": sorted(canonical_identity_fields),
            "dimensions": MATRIX_DIMENSIONS,
            "representation": "semantic_768",
        },
        "execution": {
            "device": str(resolved_device),
            "torchVersion": torch.__version__,
            "cudaVersion": torch.version.cuda,
            "gpuName": torch.cuda.get_device_name(resolved_device) if resolved_device.type == "cuda" else None,
            "queryOrdinals": query_ordinals.tolist(),
            "topK": top_k,
            "batchRows": batch_rows,
            "elapsedSeconds": time.perf_counter() - started,
            "peakAllocatedVramBytes": peak_vram,
            "cpuExactTopKParity": cpu_rank_parity,
            "cpuProjectionParity": cpu_checks,
        },
        "projections": dimensions,
        "lineageBlockers": lineage_blockers,
        "indexPlan": {
            "status": "PROPOSAL_ONLY_NOT_APPLIED",
            "target": "public.codebase_chunk_index.content_embedding_768",
            "method": "HNSW cosine expression index over the 256-D prefix cast to halfvec",
            "ddl": "CREATE INDEX CONCURRENTLY codebase_chunk_semantic_mrl_256_hnsw ON public.codebase_chunk_index USING hnsw ((subvector(content_embedding_768, 1, 256)::halfvec(256)) halfvec_cosine_ops) WHERE content_embedding_768 IS NOT NULL;",
            "queryExpression": "subvector(content_embedding_768, 1, 256)::halfvec(256) <=> $1::halfvec(256)",
            "preconditions": [
                "Verify the live column and pgvector version in a read-only transaction",
                "Measure existing indexes and total table/index bytes",
                "Compare exact MRL-256 Recall@K with the 768-D baseline",
                "Review a concurrent-index migration and operator-approved deployment window",
            ],
            "storageNote": "This reduces the candidate index footprint versus a full 768-D float32 index, but adds storage while the canonical 768-D index is retained.",
        },
    }
    stable = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    body["receiptChecksum"] = hashlib.sha256(stable).hexdigest()
    return body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="docs/reports/semantic768-ae-training-snapshot-v4.json")
    parser.add_argument("--output", default=".tmp/atlas/embeddinggemma-mrl-gpu-fanout-evaluation-v1.json")
    parser.add_argument("--repository-root", default=".")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--queries", type=int, default=16)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--batch-rows", type=int, default=2048)
    args = parser.parse_args()
    receipt = evaluate_mrl_snapshot_v1(
        args.manifest,
        repository_root=args.repository_root,
        device=args.device,
        query_count=args.queries,
        top_k=args.top_k,
        batch_rows=args.batch_rows,
    )
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({key: receipt[key] for key in ("schema", "status", "fanoutEligible", "input", "execution", "lineageBlockers", "indexPlan")}, indent=2))
    return 0 if receipt["status"] == "EVALUATED_CANDIDATE_ONLY" else 2


if __name__ == "__main__":
    raise SystemExit(main())
