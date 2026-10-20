from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _tie_aware_sample_check(
    vectors: np.ndarray,
    knn_indices: np.ndarray,
    query_ordinals: list[int],
    *,
    batch_rows: int = 8192,
    tolerance: float = 1e-12,
) -> list[dict[str, Any]]:
    if vectors.ndim != 2 or vectors.shape[0] == 0 or vectors.shape[1] == 0:
        raise ValueError("VECTOR_MATRIX_MUST_BE_NONEMPTY_RANK2")
    if vectors.dtype != np.float32 or not np.isfinite(vectors).all():
        raise ValueError("VECTOR_MATRIX_MUST_BE_FINITE_FLOAT32")
    if knn_indices.ndim != 2 or knn_indices.shape[0] != vectors.shape[0] or knn_indices.shape[1] == 0:
        raise ValueError("KNN_MATRIX_SHAPE_MISMATCH")
    if not np.issubdtype(knn_indices.dtype, np.integer):
        raise ValueError("KNN_INDICES_MUST_BE_INTEGER")
    if np.any(knn_indices < 0) or np.any(knn_indices >= vectors.shape[0]):
        raise ValueError("KNN_ORDINAL_OUT_OF_RANGE")
    if batch_rows <= 0 or tolerance < 0:
        raise ValueError("INVALID_ORACLE_CONFIGURATION")

    row_ids = np.arange(vectors.shape[0], dtype=np.int64)
    for start in range(0, vectors.shape[0], batch_rows):
        block = np.asarray(knn_indices[start : start + batch_rows], dtype=np.int64)
        if np.any(block == row_ids[start : start + len(block), None]):
            raise ValueError("KNN_SELF_NEIGHBOR_PRESENT")
        if any(len(set(map(int, row))) != knn_indices.shape[1] for row in block):
            raise ValueError("KNN_DUPLICATE_NEIGHBOR_IN_ROW")

    matrix_norms = np.empty(vectors.shape[0], dtype=np.float64)
    for start in range(0, vectors.shape[0], batch_rows):
        block = np.asarray(vectors[start : start + batch_rows], dtype=np.float64)
        matrix_norms[start : start + len(block)] = np.linalg.norm(block, axis=1)
    if np.any(matrix_norms == 0):
        raise ValueError("ZERO_VECTOR_IN_CORPUS")

    checked: list[dict[str, Any]] = []
    for query_ordinal in query_ordinals:
        if not 0 <= query_ordinal < vectors.shape[0]:
            raise ValueError(f"QUERY_ORDINAL_OUT_OF_RANGE:{query_ordinal}")
        query = np.asarray(vectors[query_ordinal], dtype=np.float64)
        query_norm = float(np.linalg.norm(query))
        if query_norm == 0:
            raise ValueError(f"ZERO_QUERY_VECTOR:{query_ordinal}")
        exact_scores = np.empty(vectors.shape[0], dtype=np.float64)
        for start in range(0, vectors.shape[0], batch_rows):
            block = np.asarray(vectors[start : start + batch_rows], dtype=np.float64)
            exact_scores[start : start + len(block)] = (block @ query) / (matrix_norms[start : start + len(block)] * query_norm)
        exact_scores[query_ordinal] = -np.inf
        k = knn_indices.shape[1]
        cutoff = float(np.partition(exact_scores, -k)[-k])
        selected = np.asarray(knn_indices[query_ordinal], dtype=np.int64)
        selected_scores = exact_scores[selected]
        strict_top = set(map(int, np.flatnonzero(exact_scores > cutoff + tolerance)))
        if not strict_top.issubset(set(map(int, selected))):
            raise ValueError(f"KNN_MISSES_STRICT_TOP_CANDIDATE:{query_ordinal}")
        if np.any(selected_scores < cutoff - tolerance):
            raise ValueError(f"KNN_INCLUDES_NON_TOP_CANDIDATE:{query_ordinal}")
        checked.append({
            "queryOrdinal": int(query_ordinal),
            "neighbors": [int(value) for value in selected],
            "cutoffCosine": cutoff,
            "tieAwarePass": True,
        })
    return checked


def _verify_knn_edge_vector_binding(
    vectors: np.ndarray,
    knn_indices: np.ndarray,
    knn_scores: np.ndarray,
    *,
    batch_rows: int = 1024,
    tolerance: float = 5e-6,
) -> dict[str, Any]:
    if vectors.ndim != 2 or vectors.dtype != np.float32 or not np.isfinite(vectors).all():
        raise ValueError("VECTOR_MATRIX_MUST_BE_FINITE_FLOAT32")
    if knn_indices.ndim != 2 or knn_indices.shape[0] != vectors.shape[0] or knn_indices.shape[1] == 0:
        raise ValueError("KNN_MATRIX_SHAPE_MISMATCH")
    if knn_scores.shape != knn_indices.shape or knn_scores.dtype != np.float32:
        raise ValueError("KNN_SCORE_SHAPE_OR_DTYPE_MISMATCH")
    if not np.isfinite(knn_scores).all():
        raise ValueError("KNN_SCORES_MUST_BE_FINITE")
    if batch_rows <= 0 or tolerance < 0:
        raise ValueError("INVALID_EDGE_BINDING_CONFIGURATION")

    maximum_absolute_error = 0.0
    for start in range(0, vectors.shape[0], batch_rows):
        end = min(start + batch_rows, vectors.shape[0])
        query_vectors = np.asarray(vectors[start:end], dtype=np.float64)
        neighbor_ordinals = np.asarray(knn_indices[start:end], dtype=np.int64)
        neighbor_vectors = np.asarray(vectors[neighbor_ordinals], dtype=np.float64)
        expected_scores = np.einsum("bd,bkd->bk", query_vectors, neighbor_vectors, optimize=True)
        observed_scores = np.asarray(knn_scores[start:end], dtype=np.float64)
        errors = np.abs(expected_scores - observed_scores)
        if np.any(errors > tolerance):
            local_row, neighbor_position = np.unravel_index(int(np.argmax(errors)), errors.shape)
            raise ValueError(
                "KNN_EDGE_SCORE_VECTOR_BINDING_MISMATCH:"
                f"{start + local_row}:{neighbor_position}:"
                f"{errors[local_row, neighbor_position]:.12g}"
            )
        maximum_absolute_error = max(maximum_absolute_error, float(errors.max(initial=0.0)))

    return {
        "verifiedEdges": int(knn_indices.size),
        "maximumAbsoluteScoreError": maximum_absolute_error,
        "tolerance": tolerance,
    }


def audit_frozen_knn_artifacts_v1(
    *,
    manifest_path: Path,
    vectors_path: Path,
    knn_path: Path,
    knn_scores_path: Path,
    expected_manifest_sha256: str,
    expected_vectors_sha256: str,
    expected_knn_sha256: str,
    expected_knn_scores_sha256: str,
    sample_size: int = 32,
    seed: int = 20261019,
    batch_rows: int = 8192,
) -> dict[str, Any]:
    manifest_digest = _sha256(manifest_path)
    vectors_digest = _sha256(vectors_path)
    knn_digest = _sha256(knn_path)
    knn_scores_digest = _sha256(knn_scores_path)
    if manifest_digest != expected_manifest_sha256:
        raise ValueError("MANIFEST_CHECKSUM_MISMATCH")
    if vectors_digest != expected_vectors_sha256:
        raise ValueError("VECTOR_CHECKSUM_MISMATCH")
    if knn_digest != expected_knn_sha256:
        raise ValueError("KNN_CHECKSUM_MISMATCH")
    if knn_scores_digest != expected_knn_scores_sha256:
        raise ValueError("KNN_SCORE_CHECKSUM_MISMATCH")

    rows = manifest_path.read_text(encoding="utf-8").splitlines()
    ids: list[str] = []
    for ordinal, line in enumerate(rows):
        fields = line.split("\t")
        if len(fields) < 7 or fields[0] != str(ordinal) or not fields[1]:
            raise ValueError(f"INVALID_MANIFEST_ROW:{ordinal}")
        ids.append(fields[1])
    if len(set(ids)) != len(ids):
        raise ValueError("DUPLICATE_MANIFEST_CHUNK_ID")

    vectors = np.load(vectors_path, mmap_mode="r", allow_pickle=False)
    knn_indices = np.load(knn_path, mmap_mode="r", allow_pickle=False)
    knn_scores = np.load(knn_scores_path, mmap_mode="r", allow_pickle=False)
    if vectors.shape != (len(ids), 768) or vectors.dtype != np.float32:
        raise ValueError("VECTOR_SHAPE_OR_DTYPE_MISMATCH")
    if knn_indices.shape != (len(ids), 10):
        raise ValueError("KNN_SHAPE_MISMATCH")
    if knn_scores.shape != knn_indices.shape or knn_scores.dtype != np.float32:
        raise ValueError("KNN_SCORE_SHAPE_OR_DTYPE_MISMATCH")
    edge_binding = _verify_knn_edge_vector_binding(vectors, knn_indices, knn_scores)
    if sample_size < 1 or sample_size > len(ids):
        raise ValueError("INVALID_SAMPLE_SIZE")

    ranked_ordinals = sorted(
        range(len(ids)),
        key=lambda ordinal: hashlib.sha256(f"{seed}\0{ordinal}".encode("ascii")).digest(),
    )
    query_ordinals = sorted(ranked_ordinals[:sample_size])
    sample = _tie_aware_sample_check(vectors, knn_indices, query_ordinals, batch_rows=batch_rows)
    return {
        "schema": "atlas.frozen-corpus-knn-artifact-audit.v1",
        "status": "SAMPLED_TIE_AWARE_ORACLE_AND_FULL_EDGE_BINDING_PASS",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifestSha256": manifest_digest,
        "vectorsSha256": vectors_digest,
        "knnIndicesSha256": knn_digest,
        "knnScoresSha256": knn_scores_digest,
        "rows": len(ids),
        "dimensions": int(vectors.shape[1]),
        "neighborsPerRow": int(knn_indices.shape[1]),
        "allRowsStructuralChecks": ["manifest_ordinal_and_unique_chunk_ids", "finite_float32_vectors", "knn_index_bounds", "no_self_neighbors", "no_duplicate_neighbors_per_row"],
        "exactOracle": "float64 cosine; cutoff ties accepted; bounded deterministic query sample",
        "fullEdgeVectorBinding": edge_binding,
        "sampleSize": len(sample),
        "sampleSeed": seed,
        "sample": [
            {
                **entry,
                "queryChunkId": ids[entry["queryOrdinal"]],
                "neighborChunkIds": [ids[ordinal] for ordinal in entry["neighbors"]],
            }
            for entry in sample
        ],
        "fullKnnRowIdentityVerified": False,
        "fullExactTopKVerified": False,
        "canonicalCandidateOrdinalBinding": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path(".tmp/atlas/frozen-corpus-03-manifest.tsv"))
    parser.add_argument("--vectors", type=Path, default=Path(".tmp/atlas/frozen-corpus-03-768.npy"))
    parser.add_argument("--knn", type=Path, default=Path(".tmp/atlas/frozen-corpus-03-knn10-idx.npy"))
    parser.add_argument("--knn-scores", type=Path, default=Path(".tmp/atlas/frozen-corpus-03-knn10-score.npy"))
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--vectors-sha256", required=True)
    parser.add_argument("--knn-sha256", required=True)
    parser.add_argument("--knn-scores-sha256", required=True)
    parser.add_argument("--sample-size", type=int, default=32)
    parser.add_argument("--seed", type=int, default=20261019)
    parser.add_argument("--batch-rows", type=int, default=8192)
    parser.add_argument("--output", type=Path, default=Path(".tmp/atlas/frozen-corpus-03-knn-artifact-audit-v1.json"))
    args = parser.parse_args()
    report = audit_frozen_knn_artifacts_v1(
        manifest_path=args.manifest,
        vectors_path=args.vectors,
        knn_path=args.knn,
        knn_scores_path=args.knn_scores,
        expected_manifest_sha256=args.manifest_sha256,
        expected_vectors_sha256=args.vectors_sha256,
        expected_knn_sha256=args.knn_sha256,
        expected_knn_scores_sha256=args.knn_scores_sha256,
        sample_size=args.sample_size,
        seed=args.seed,
        batch_rows=args.batch_rows,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "rows": report["rows"], "sampleSize": report["sampleSize"], "verifiedEdges": report["fullEdgeVectorBinding"]["verifiedEdges"], "fullKnnRowIdentityVerified": False, "writesPerformed": False}))


if __name__ == "__main__":
    main()
