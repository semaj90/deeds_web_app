"""Deterministic exact-KNN result ordering for the GPU executor.

Single owner of the exact-KNN selection and normalization helpers. Imported by
python/atlas_rapids_sidecar.py and services/atlas-gpu-8098/app.py. Keep one copy.
"""
from __future__ import annotations

import math
from collections.abc import Callable, Sequence


def l2_normalize_f32(rows: "numpy.ndarray") -> "numpy.ndarray":
    """L2-normalize rows into a float32 copy. Raises ValueError on zero or nonfinite norms.

    The input is never mutated; callers keep the canonical embeddings unchanged.
    """
    import numpy

    norms = numpy.linalg.norm(rows, axis=1, keepdims=True)
    if not numpy.all(numpy.isfinite(norms)) or numpy.any(norms == 0):
        raise ValueError("ZERO_OR_NONFINITE_NORM")
    return (rows / norms).astype(numpy.float32)


def canonical_candidate_ordinals(identities: Sequence[tuple[str, str]]) -> list[int]:
    """Assign each row a snapshot-scoped ordinal = its rank in (packetKey, sourceRevision) order.

    The ordinal is independent of request order. Ties in distance are then broken by
    canonical identity via this rank. Ordinals are only comparable within one snapshot.
    """
    if len(set(identities)) != len(identities):
        raise ValueError("DUPLICATE_CANDIDATE_IDENTITY")
    ranked_positions = sorted(range(len(identities)), key=lambda position: identities[position])
    ordinals = [0] * len(identities)
    for rank, position in enumerate(ranked_positions):
        ordinals[position] = rank
    return ordinals


def _validate_ordinals(candidate_ordinals: Sequence[int]) -> None:
    if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in candidate_ordinals):
        raise ValueError("INVALID_CANDIDATE_ORDINAL")
    if len(set(candidate_ordinals)) != len(candidate_ordinals):
        raise ValueError("DUPLICATE_CANDIDATE_ORDINAL")


def deterministic_topk_from_scores(
    scores: Sequence[float], candidate_ordinals: Sequence[int], *, limit: int
) -> list[tuple[float, int, int]]:
    """Rank complete higher-is-better scores by score descending then ordinal."""
    if len(scores) != len(candidate_ordinals):
        raise ValueError("SCORE_ORDINAL_LENGTH_MISMATCH")
    if not scores:
        raise ValueError("EMPTY_CORPUS")
    if limit < 1:
        raise ValueError("INVALID_LIMIT")
    _validate_ordinals(candidate_ordinals)
    numeric_scores = [float(score) for score in scores]
    if any(not math.isfinite(score) for score in numeric_scores):
        raise ValueError("NONFINITE_SCORE")
    ranked = [
        (score, candidate_ordinals[index], index)
        for index, score in enumerate(numeric_scores)
    ]
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return ranked[: min(limit, len(ranked))]


def deterministic_topk_with_boundary(
    search: Callable[[int], tuple[Sequence[float], Sequence[int]]],
    candidate_ordinals: Sequence[int],
    *,
    limit: int,
) -> list[tuple[float, int, int]]:
    """Fetch the complete Kth-distance tie group, then order by distance/ordinal."""
    row_count = len(candidate_ordinals)
    if row_count == 0:
        raise ValueError("EMPTY_CORPUS")
    if limit < 1:
        raise ValueError("INVALID_LIMIT")
    _validate_ordinals(candidate_ordinals)

    k = min(limit, row_count)
    requested = min(row_count, max(k + 1, 2 * k))
    while True:
        distances, indices = search(requested)
        if len(distances) != requested or len(indices) != requested:
            raise ValueError("SEARCH_RESULT_LENGTH_MISMATCH")
        numeric_distances = [float(distance) for distance in distances]
        if any(not math.isfinite(distance) for distance in numeric_distances):
            raise ValueError("NONFINITE_DISTANCE")
        if any(not isinstance(index, int) or index < 0 or index >= row_count for index in indices):
            raise ValueError("SEARCH_INDEX_OUT_OF_RANGE")
        if len(set(indices)) != len(indices):
            raise ValueError("DUPLICATE_SEARCH_INDEX")
        if any(left > right for left, right in zip(numeric_distances, numeric_distances[1:])):
            raise ValueError("SEARCH_DISTANCES_NOT_ASCENDING")

        boundary_distance = numeric_distances[k - 1]
        if requested == row_count or numeric_distances[-1] > boundary_distance:
            ranked = [
                (distance, candidate_ordinals[index], index)
                for distance, index in zip(numeric_distances, indices, strict=True)
            ]
            ranked.sort(key=lambda row: (row[0], row[1]))
            return ranked[:k]

        requested = min(row_count, max(requested + 1, requested * 2))
