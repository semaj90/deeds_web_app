from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any, Sequence

import numpy as np


def _file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def find_candidate_file_pairs_v1(
    file_means: np.ndarray,
    row_file_ids: np.ndarray,
    knn_indices: np.ndarray,
    *,
    cosine_threshold: float = 0.96,
    shared_edge_threshold: int = 50,
    block_rows: int = 256,
) -> tuple[dict[tuple[int, int], float], dict[tuple[int, int], int]]:
    means = np.asarray(file_means, dtype=np.float32)
    file_ids = np.asarray(row_file_ids, dtype=np.int64)
    neighbors = np.asarray(knn_indices, dtype=np.int64)
    if means.ndim != 2 or means.shape[0] == 0 or not np.isfinite(means).all():
        raise ValueError("INVALID_FILE_MEAN_MATRIX")
    if file_ids.ndim != 1 or file_ids.size == 0 or np.any(file_ids < 0) or np.any(file_ids >= means.shape[0]):
        raise ValueError("INVALID_ROW_FILE_IDS")
    if neighbors.ndim != 2 or neighbors.shape[0] != file_ids.size or neighbors.shape[1] == 0:
        raise ValueError("INVALID_KNN_MATRIX_SHAPE")
    if np.any(neighbors < 0) or np.any(neighbors >= file_ids.size):
        raise ValueError("KNN_ORDINAL_OUT_OF_RANGE")
    if not np.isfinite(cosine_threshold) or not -1.0 <= cosine_threshold <= 1.0:
        raise ValueError("INVALID_COSINE_THRESHOLD")
    if shared_edge_threshold < 1 or block_rows < 1:
        raise ValueError("INVALID_REVIEW_LIMITS")

    cosine_pairs: dict[tuple[int, int], float] = {}
    for start in range(0, means.shape[0], block_rows):
        end = min(start + block_rows, means.shape[0])
        similarities = means[start:end] @ means.T
        local_rows, other_rows = np.where(similarities >= cosine_threshold)
        for local_row, other_row in zip(local_rows.tolist(), other_rows.tolist()):
            left = start + local_row
            right = other_row
            if left < right:
                cosine_pairs[(left, right)] = float(similarities[local_row, other_row])

    source_file_ids = np.repeat(file_ids, neighbors.shape[1])
    target_file_ids = file_ids[neighbors.reshape(-1)]
    valid_edges = source_file_ids != target_file_ids
    edge_left = np.minimum(source_file_ids[valid_edges], target_file_ids[valid_edges])
    edge_right = np.maximum(source_file_ids[valid_edges], target_file_ids[valid_edges])
    edge_codes, edge_frequencies = np.unique(edge_left * means.shape[0] + edge_right, return_counts=True)
    shared_edge_pairs = {
        (int(code // means.shape[0]), int(code % means.shape[0])): int(count)
        for code, count in zip(edge_codes, edge_frequencies)
        if count >= shared_edge_threshold
    }
    return cosine_pairs, shared_edge_pairs


def build_near_duplicate_review_v1(
    *,
    source_refs: Sequence[str],
    vectors_path: str | Path,
    knn_path: str | Path,
    manifest_sha256: str,
    source_revision_by_ref: dict[str, str],
    workspace_revision: str,
    cosine_threshold: float = 0.96,
    shared_edge_threshold: int = 50,
    block_rows: int = 256,
) -> dict[str, Any]:
    if len(source_refs) != 98_335:
        raise ValueError("FROZEN_CORPUS_ROW_COUNT_MISMATCH")
    if not np.isfinite(cosine_threshold) or not -1.0 <= cosine_threshold <= 1.0:
        raise ValueError("INVALID_COSINE_THRESHOLD")
    if shared_edge_threshold < 1 or block_rows < 1:
        raise ValueError("INVALID_REVIEW_LIMITS")
    normalized_refs = [value.strip().replace("\\", "/") if isinstance(value, str) else "" for value in source_refs]
    if any(not value for value in normalized_refs):
        raise ValueError("MISSING_SOURCE_IDENTITY")
    if not workspace_revision or any(not source_revision_by_ref.get(ref) for ref in set(normalized_refs)):
        raise ValueError("SOURCE_REVISION_BINDING_MISSING")

    vectors = np.load(vectors_path, mmap_mode="r")
    knn_indices = np.load(knn_path, mmap_mode="r")
    if vectors.shape != (len(normalized_refs), 768) or vectors.dtype != np.float32:
        raise ValueError("FROZEN_VECTOR_SHAPE_OR_DTYPE_MISMATCH")
    if knn_indices.ndim != 2 or knn_indices.shape[0] != len(normalized_refs) or knn_indices.shape[1] == 0:
        raise ValueError("FROZEN_KNN_SHAPE_MISMATCH")
    if np.any(knn_indices < 0) or np.any(knn_indices >= len(normalized_refs)):
        raise ValueError("FROZEN_KNN_ORDINAL_OUT_OF_RANGE")

    unique_refs = sorted(set(normalized_refs))
    file_id_by_ref = {source_ref: index for index, source_ref in enumerate(unique_refs)}
    row_file_ids = np.fromiter((file_id_by_ref[ref] for ref in normalized_refs), dtype=np.int32, count=len(normalized_refs))
    file_sums = np.zeros((len(unique_refs), vectors.shape[1]), dtype=np.float64)
    np.add.at(file_sums, row_file_ids, vectors)
    file_counts = np.bincount(row_file_ids, minlength=len(unique_refs)).astype(np.int64)
    file_means = (file_sums / file_counts[:, None]).astype(np.float32)
    mean_norms = np.linalg.norm(file_means, axis=1)
    if np.any(mean_norms <= 1e-12):
        raise ValueError("ZERO_NORM_FILE_MEAN_VECTOR")
    file_means /= mean_norms[:, None]
    if not np.isfinite(file_means).all():
        raise ValueError("NONFINITE_FILE_MEAN_VECTOR")

    cosine_pairs, shared_edge_pairs = find_candidate_file_pairs_v1(
        file_means,
        row_file_ids,
        knn_indices,
        cosine_threshold=cosine_threshold,
        shared_edge_threshold=shared_edge_threshold,
        block_rows=block_rows,
    )

    pair_keys = sorted(set(cosine_pairs) | set(shared_edge_pairs))
    candidates = []
    for left, right in pair_keys:
        left_ref = unique_refs[left]
        right_ref = unique_refs[right]
        candidates.append({
            "leftSourceRef": left_ref,
            "leftSourceRevision": source_revision_by_ref[left_ref],
            "rightSourceRef": right_ref,
            "rightSourceRevision": source_revision_by_ref[right_ref],
            "workspaceRevision": workspace_revision,
            "meanVectorCosine": cosine_pairs.get((left, right)),
            "sharedDirectedKnnEdges": shared_edge_pairs.get((left, right), 0),
            "matchedCosineThreshold": (left, right) in cosine_pairs,
            "matchedSharedEdgeThreshold": (left, right) in shared_edge_pairs,
            "suggestedRelation": "ALIAS_OF_REVIEW_ONLY",
            "requiresHumanReview": True,
        })

    candidates.sort(key=lambda row: (
        -(row["meanVectorCosine"] if row["meanVectorCosine"] is not None else -1.0),
        -row["sharedDirectedKnnEdges"],
        row["leftSourceRef"],
        row["rightSourceRef"],
    ))
    return {
        "schema": "atlas.frozen-corpus-near-duplicate-review.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifestSha256": manifest_sha256,
        "workspaceRevision": workspace_revision,
        "rowCount": len(normalized_refs),
        "fileCount": len(unique_refs),
        "vectorsSha256": _file_sha256(vectors_path),
        "knnIndicesSha256": _file_sha256(knn_path),
        "thresholds": {"fileMeanCosineAtLeast": cosine_threshold, "sharedDirectedKnnEdgesAtLeast": shared_edge_threshold},
        "edgeDefinition": "Each directed chunk-to-neighbor edge contributes once to its unordered cross-file pair count; same-file neighbors are excluded.",
        "candidatePairCount": len(candidates),
        "candidatePairs": candidates,
        "canonicalAuthority": False,
        "canonicalWritesPerformed": False,
        "filesDeleted": 0,
        "graphEdgesWritten": 0,
        "promotionStatus": "REVIEW_ONLY_NOT_ADMITTED",
    }


def main() -> None:
    import argparse
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument("--vectors", default=".tmp/atlas/frozen-corpus-03-768.npy")
    parser.add_argument("--knn", default=".tmp/atlas/frozen-corpus-03-knn10-idx.npy")
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--workspace-revision", required=True)
    parser.add_argument("--output", default=".tmp/atlas/frozen-corpus-03-near-duplicate-review-v1.json")
    parser.add_argument("--cosine-threshold", type=float, default=0.96)
    parser.add_argument("--shared-edge-threshold", type=int, default=50)
    args = parser.parse_args()
    payload = json.load(sys.stdin)
    report = build_near_duplicate_review_v1(
        source_refs=payload["sourceRefs"],
        source_revision_by_ref=payload["sourceRevisionByRef"],
        vectors_path=args.vectors,
        knn_path=args.knn,
        manifest_sha256=args.manifest_sha256,
        workspace_revision=args.workspace_revision,
        cosine_threshold=args.cosine_threshold,
        shared_edge_threshold=args.shared_edge_threshold,
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"reportPath": str(output_path), "candidatePairs": report["candidatePairCount"], "canonicalWritesPerformed": False}))


if __name__ == "__main__":
    main()
