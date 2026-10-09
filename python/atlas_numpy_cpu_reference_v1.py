"""NumPy-only exact cosine reference for a frozen vector cohort."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np


def exact_cosine_topk(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    query: Sequence[float] | np.ndarray,
    *,
    k: int,
    row_ids: Sequence[str],
) -> list[tuple[str, float]]:
    """Return exact cosine Top-K with row ID as the deterministic tie-break."""
    try:
        vectors = np.asarray(matrix, dtype=np.float64)
        query_vector = np.asarray(query, dtype=np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError("INVALID_VECTOR_DATA") from error

    if vectors.size == 0:
        raise ValueError("EMPTY_VECTOR_MATRIX")
    if vectors.ndim != 2 or query_vector.ndim != 1 or vectors.shape[1] != query_vector.size:
        raise ValueError("EMBEDDING_SHAPE_MISMATCH")
    if vectors.shape[1] == 0:
        raise ValueError("EMPTY_VECTOR_MATRIX")
    if isinstance(k, bool) or not isinstance(k, int) or not 1 <= k <= vectors.shape[0]:
        raise ValueError("TOPK_INVALID")
    if len(row_ids) != vectors.shape[0] or any(not isinstance(row_id, str) or not row_id for row_id in row_ids):
        raise ValueError("ROW_IDENTITY_INVALID")
    if len(set(row_ids)) != len(row_ids):
        raise ValueError("DUPLICATE_ROW_ID")
    if not np.isfinite(vectors).all() or not np.isfinite(query_vector).all():
        raise ValueError("NONFINITE_VECTOR")

    vector_norms = np.linalg.norm(vectors, axis=1)
    query_norm = np.linalg.norm(query_vector)
    if not np.isfinite(vector_norms).all() or not np.isfinite(query_norm):
        raise ValueError("UNREPRESENTABLE_VECTOR_NORM")
    if not np.all(vector_norms > 0) or not query_norm > 0:
        raise ValueError("ZERO_NORM_VECTOR")

    scores = (vectors @ query_vector) / (vector_norms * query_norm)
    if not np.isfinite(scores).all():
        raise ValueError("NONFINITE_COSINE_SCORE")
    order = sorted(range(len(row_ids)), key=lambda index: (-float(scores[index]), row_ids[index]))
    return [(row_ids[index], float(scores[index])) for index in order[:k]]
