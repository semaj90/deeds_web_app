"""L1 (Manhattan) KNN over 768D vectors (NumPy / optional GPU challenger).

Neo4j GDS KNN supports cosine/euclidean/pearson/jaccard/overlap but not L1.
This challenger-only helper provides deterministic L1 distance Top-K expansion
over hydrated 768D candidate matrices without modifying canonical authority or
adding an independent RRF vote.
"""
from __future__ import annotations

from typing import Any, Sequence

import numpy as np


def manhattan_l1_knn_768(
    query_vec: Sequence[float] | np.ndarray,
    corpus_matrix: np.ndarray,
    candidate_ids: Sequence[str],
    top_k: int = 10,
) -> dict[str, Any]:
    if top_k <= 0:
        raise ValueError("top_k must be positive")
    q = np.asarray(query_vec, dtype=np.float32)
    m = np.asarray(corpus_matrix, dtype=np.float32)
    if q.ndim != 1:
        raise ValueError(f"query_vec must be 1D, got shape {q.shape}")
    if m.ndim != 2 or m.shape[1] != q.shape[0]:
        raise ValueError(f"corpus_matrix shape {m.shape} incompatible with query dim {q.shape[0]}")
    if len(candidate_ids) != m.shape[0]:
        raise ValueError("candidate_ids length must match corpus_matrix rows")
    if not np.isfinite(q).all() or not np.isfinite(m).all():
        raise ValueError("NON_FINITE_VECTOR_INPUT")

    if m.shape[0] == 0:
        return {
            "schema": "atlas.manhattan-l1-knn.v1",
            "metric": "manhattan_l1",
            "dim": int(q.shape[0]),
            "canonical_authority": False,
            "challenger_only": True,
            "hits": [],
        }

    dists = np.sum(np.abs(m - q[None, :]), axis=1)
    k = min(top_k, m.shape[0])
    # Deterministic tie-break: ascending L1 distance, then ascending candidate_id
    order = sorted(range(m.shape[0]), key=lambda idx: (float(dists[idx]), str(candidate_ids[idx])))[:k]
    hits = [
        {
            "candidate_id": str(candidate_ids[idx]),
            "l1_distance": round(float(dists[idx]), 6),
            "l1_similarity": round(float(1.0 / (1.0 + dists[idx])), 6),
            "rank": rank + 1,
        }
        for rank, idx in enumerate(order)
    ]
    return {
        "schema": "atlas.manhattan-l1-knn.v1",
        "metric": "manhattan_l1",
        "dim": int(q.shape[0]),
        "canonical_authority": False,
        "challenger_only": True,
        "hits": hits,
    }
