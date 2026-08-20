"""Exact low-dimensional nearest-neighbor challengers for Parent Atlas.

This module is intentionally CPU/reference-oriented. It does not replace the
semantic_768 cuVS oracle or CAGRA path. KD-tree/Ball-tree are useful tournament
contestants for low-dimensional derived representations such as PCA/latent,
pose features, and physical unit quaternions.

All returned rows are deterministically sorted by (distance, canonical_id,
ordinal) so backend tie ordering never becomes canonical Atlas ordering.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import acos
from typing import Iterable, Literal, Sequence

import numpy as np

Algorithm = Literal["brute", "scipy_ckdtree", "sklearn_kdtree", "sklearn_balltree"]
Metric = Literal["euclidean", "manhattan", "chebyshev", "minkowski", "haversine", "quaternion_angular"]


@dataclass(frozen=True)
class Neighbor:
    canonical_id: str
    ordinal: int
    distance: float


@dataclass(frozen=True)
class ExactSearchReceipt:
    algorithm: Algorithm
    metric: Metric
    dimensions: int
    corpus_size: int
    query_count: int
    k: int
    exact: bool
    post_verified: bool
    canonical_tie_break: bool


def _as_matrix(x: np.ndarray | Sequence[Sequence[float]], *, name: str) -> np.ndarray:
    out = np.asarray(x, dtype=np.float64)
    if out.ndim != 2 or out.shape[0] == 0 or out.shape[1] == 0:
        raise ValueError(f"{name} must be a non-empty rank-2 matrix")
    if not np.isfinite(out).all():
        raise ValueError(f"{name} must contain only finite values")
    return np.ascontiguousarray(out)


def _metric_name_for_sklearn(metric: Metric) -> str:
    return {
        "euclidean": "euclidean",
        "manhattan": "manhattan",
        "chebyshev": "chebyshev",
        "minkowski": "minkowski",
        "haversine": "haversine",
    }[metric]


def _stable_neighbors(
    distances: Iterable[float],
    ordinals: Iterable[int],
    canonical_ids: Sequence[str],
    k: int,
) -> list[Neighbor]:
    rows = [
        Neighbor(canonical_id=canonical_ids[int(i)], ordinal=int(i), distance=float(d))
        for d, i in zip(distances, ordinals, strict=True)
    ]
    rows.sort(key=lambda row: (row.distance, row.canonical_id, row.ordinal))
    return rows[:k]


def _pairwise_distance(q: np.ndarray, x: np.ndarray, metric: Metric) -> np.ndarray:
    delta = x - q[None, :]
    if metric == "euclidean":
        return np.linalg.norm(delta, axis=1)
    if metric == "manhattan":
        return np.abs(delta).sum(axis=1)
    if metric == "chebyshev":
        return np.abs(delta).max(axis=1)
    if metric == "minkowski":
        # Parent Atlas reference defaults to p=2 until p becomes an explicit
        # revisioned hyperparameter in the operation contract.
        return np.linalg.norm(delta, ord=2, axis=1)
    if metric == "haversine":
        if x.shape[1] != 2:
            raise ValueError("haversine requires [lat, lon] radians")
        lat1, lon1 = q
        lat2, lon2 = x[:, 0], x[:, 1]
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
        return 2.0 * np.arcsin(np.minimum(1.0, np.sqrt(a)))
    raise ValueError(f"unsupported direct metric {metric}")


def _normalize_quaternions(x: np.ndarray) -> np.ndarray:
    if x.shape[1] != 4:
        raise ValueError("physical quaternion search requires dimension 4")
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    if np.any(norms <= 0):
        raise ValueError("quaternions must have non-zero norm")
    return x / norms


def quaternion_angular_distances(query: np.ndarray, corpus: np.ndarray) -> np.ndarray:
    q = _normalize_quaternions(query.reshape(1, 4))[0]
    x = _normalize_quaternions(corpus)
    dots = np.clip(np.abs(x @ q), 0.0, 1.0)
    return 2.0 * np.arccos(dots)


def _query_brute(
    corpus: np.ndarray,
    queries: np.ndarray,
    canonical_ids: Sequence[str],
    k: int,
    metric: Metric,
) -> list[list[Neighbor]]:
    result: list[list[Neighbor]] = []
    all_ordinals = np.arange(corpus.shape[0], dtype=np.int64)
    for query in queries:
        distances = (
            quaternion_angular_distances(query, corpus)
            if metric == "quaternion_angular"
            else _pairwise_distance(query, corpus, metric)
        )
        result.append(_stable_neighbors(distances, all_ordinals, canonical_ids, k))
    return result


def _query_scipy_ckdtree(
    corpus: np.ndarray,
    queries: np.ndarray,
    canonical_ids: Sequence[str],
    k: int,
    metric: Metric,
    leaf_size: int,
) -> tuple[list[list[Neighbor]], bool]:
    from scipy.spatial import cKDTree  # lazy capability dependency

    if metric == "haversine":
        raise ValueError("cKDTree does not directly own the haversine metric in this Atlas adapter")

    if metric == "quaternion_angular":
        corpus_n = _normalize_quaternions(corpus)
        queries_n = _normalize_quaternions(queries)
        tree = cKDTree(corpus_n, leafsize=leaf_size)
        out: list[list[Neighbor]] = []
        for query in queries_n:
            # Query both antipodes. For unit quaternions, physical angular
            # ordering is monotone with min(||q-r||, ||q+r||). Union of both
            # exact local top-k sets is sufficient for exact global top-k.
            d1, i1 = tree.query(query, k=k)
            d2, i2 = tree.query(-query, k=k)
            ordinals = np.unique(np.concatenate([np.atleast_1d(i1), np.atleast_1d(i2)])).astype(np.int64)
            angular = quaternion_angular_distances(query, corpus_n[ordinals])
            out.append(_stable_neighbors(angular, ordinals, canonical_ids, k))
        return out, True

    p = {"euclidean": 2, "manhattan": 1, "chebyshev": np.inf, "minkowski": 2}[metric]
    tree = cKDTree(corpus, leafsize=leaf_size)
    distances, indices = tree.query(queries, k=k, p=p)
    distances = np.atleast_2d(distances)
    indices = np.atleast_2d(indices)
    return [
        _stable_neighbors(distances[row], indices[row], canonical_ids, k)
        for row in range(queries.shape[0])
    ], False


def _query_sklearn_tree(
    algorithm: Algorithm,
    corpus: np.ndarray,
    queries: np.ndarray,
    canonical_ids: Sequence[str],
    k: int,
    metric: Metric,
    leaf_size: int,
) -> tuple[list[list[Neighbor]], bool]:
    if algorithm == "sklearn_kdtree":
        from sklearn.neighbors import KDTree as Tree
    elif algorithm == "sklearn_balltree":
        from sklearn.neighbors import BallTree as Tree
    else:
        raise ValueError(f"unsupported sklearn tree algorithm {algorithm}")

    if metric == "quaternion_angular":
        if algorithm != "sklearn_kdtree":
            raise ValueError("quaternion angular mode is admitted only for KD-tree antipodal search in this adapter")
        corpus_n = _normalize_quaternions(corpus)
        queries_n = _normalize_quaternions(queries)
        tree = Tree(corpus_n, leaf_size=leaf_size, metric="euclidean")
        out: list[list[Neighbor]] = []
        for query in queries_n:
            _, i1 = tree.query(query.reshape(1, -1), k=k, return_distance=True)
            _, i2 = tree.query((-query).reshape(1, -1), k=k, return_distance=True)
            ordinals = np.unique(np.concatenate([i1[0], i2[0]])).astype(np.int64)
            angular = quaternion_angular_distances(query, corpus_n[ordinals])
            out.append(_stable_neighbors(angular, ordinals, canonical_ids, k))
        return out, True

    tree = Tree(corpus, leaf_size=leaf_size, metric=_metric_name_for_sklearn(metric))
    distances, indices = tree.query(queries, k=k, return_distance=True, sort_results=True)
    return [
        _stable_neighbors(distances[row], indices[row], canonical_ids, k)
        for row in range(queries.shape[0])
    ], False


def exact_search(
    *,
    algorithm: Algorithm,
    corpus: np.ndarray | Sequence[Sequence[float]],
    queries: np.ndarray | Sequence[Sequence[float]],
    canonical_ids: Sequence[str],
    k: int,
    metric: Metric = "euclidean",
    leaf_size: int = 30,
) -> tuple[list[list[Neighbor]], ExactSearchReceipt]:
    x = _as_matrix(corpus, name="corpus")
    q = _as_matrix(queries, name="queries")
    if x.shape[1] != q.shape[1]:
        raise ValueError("corpus/query dimensions must match")
    if len(canonical_ids) != x.shape[0]:
        raise ValueError("canonical_ids length must equal corpus rows")
    if len(set(canonical_ids)) != len(canonical_ids):
        raise ValueError("canonical_ids must be unique")
    if not 1 <= k <= x.shape[0]:
        raise ValueError("k must be in [1, corpus_size]")
    if leaf_size <= 0:
        raise ValueError("leaf_size must be positive")

    post_verified = False
    if algorithm == "brute":
        rows = _query_brute(x, q, canonical_ids, k, metric)
    elif algorithm == "scipy_ckdtree":
        rows, post_verified = _query_scipy_ckdtree(x, q, canonical_ids, k, metric, leaf_size)
    elif algorithm in ("sklearn_kdtree", "sklearn_balltree"):
        rows, post_verified = _query_sklearn_tree(algorithm, x, q, canonical_ids, k, metric, leaf_size)
    else:
        raise ValueError(f"unknown algorithm {algorithm}")

    return rows, ExactSearchReceipt(
        algorithm=algorithm,
        metric=metric,
        dimensions=x.shape[1],
        corpus_size=x.shape[0],
        query_count=q.shape[0],
        k=k,
        exact=True,
        post_verified=post_verified,
        canonical_tie_break=True,
    )
