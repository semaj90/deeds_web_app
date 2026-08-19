"""Frozen-snapshot cuVS brute-force versus CAGRA evaluator.

The evaluator compares identity sets rather than raw tie ordering. cuVS documents
that brute-force is exact but equal-distance neighbors can be ordered differently
between runs, especially near k.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import time
from typing import Any, Literal, Sequence

import numpy as np

Metric = Literal["cosine", "inner_product", "sqeuclidean"]


@dataclass(frozen=True)
class AnnQueryComparison:
    query_ordinal: int
    recall_at_k: float
    exact_ordinals: list[int]
    cagra_ordinals: list[int]


@dataclass(frozen=True)
class AnnComparisonReceipt:
    schema: str
    metric: Metric
    dimensions: int
    corpus_rows: int
    query_rows: int
    k: int
    graph_degree: int
    intermediate_graph_degree: int
    build_algo: str
    search_width: int
    itopk_size: int
    mean_recall_at_k: float
    exact_build_ms: float
    exact_search_ms: float
    cagra_build_ms: float
    cagra_search_ms: float
    gpu_free_mb_before: float | None
    gpu_free_mb_after: float | None
    exact_checksum: str
    cagra_checksum: str
    comparisons: list[AnnQueryComparison]
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _memory_mb(cp: Any) -> float | None:
    try:
        free_bytes, _ = cp.cuda.Device().mem_info
        return float(free_bytes) / (1024.0 * 1024.0)
    except Exception:
        return None


def _host_rows(cp: Any, value: Any) -> np.ndarray:
    return np.asarray(cp.asnumpy(value))


def compare_cuvs_exact_and_cagra(
    corpus_vectors: Sequence[Sequence[float]] | np.ndarray,
    query_vectors: Sequence[Sequence[float]] | np.ndarray,
    *,
    metric: Metric = "cosine",
    k: int = 10,
    graph_degree: int = 64,
    intermediate_graph_degree: int = 128,
    build_algo: str = "ivf_pq",
    search_width: int = 1,
    itopk_size: int = 64,
) -> AnnComparisonReceipt:
    """Run cuVS exact and CAGRA on the same FP32 frozen tensor snapshot."""

    import cupy as cp
    from cuvs.neighbors import brute_force, cagra

    corpus_np = np.asarray(corpus_vectors, dtype=np.float32)
    query_np = np.asarray(query_vectors, dtype=np.float32)
    if corpus_np.ndim != 2 or query_np.ndim != 2 or corpus_np.shape[1] != query_np.shape[1]:
        raise ValueError("corpus/query must be rank-2 with matching dimensions")
    if corpus_np.shape[0] == 0 or query_np.shape[0] == 0:
        raise ValueError("corpus/query must be non-empty")
    if corpus_np.shape[0] < 3:
        raise ValueError("CAGRA comparison requires at least 3 corpus rows; use brute-force only for smaller fixtures")
    if not (1 <= k <= corpus_np.shape[0]):
        raise ValueError("k out of range")

    graph_degree = max(2, min(int(graph_degree), corpus_np.shape[0] - 1))
    intermediate_graph_degree = max(
        graph_degree,
        min(int(intermediate_graph_degree), corpus_np.shape[0]),
    )
    itopk_size = max(int(itopk_size), k)
    search_width = max(1, int(search_width))

    corpus = cp.asarray(corpus_np, dtype=cp.float32)
    queries = cp.asarray(query_np, dtype=cp.float32)
    mem_before = _memory_mb(cp)

    t0 = time.perf_counter()
    exact_index = brute_force.build(corpus, metric=metric)
    cp.cuda.Stream.null.synchronize()
    exact_build_ms = (time.perf_counter() - t0) * 1000.0

    t0 = time.perf_counter()
    exact_dist, exact_idx = brute_force.search(exact_index, queries, k=k)
    cp.cuda.Stream.null.synchronize()
    exact_search_ms = (time.perf_counter() - t0) * 1000.0

    params = cagra.IndexParams(
        metric=metric,
        graph_degree=graph_degree,
        intermediate_graph_degree=intermediate_graph_degree,
        build_algo=build_algo,
    )
    t0 = time.perf_counter()
    cagra_index = cagra.build(params, corpus)
    cp.cuda.Stream.null.synchronize()
    cagra_build_ms = (time.perf_counter() - t0) * 1000.0

    search_params = cagra.SearchParams(search_width=search_width, itopk_size=itopk_size)
    t0 = time.perf_counter()
    cagra_dist, cagra_idx = cagra.search(search_params, cagra_index, queries, k=k)
    cp.cuda.Stream.null.synchronize()
    cagra_search_ms = (time.perf_counter() - t0) * 1000.0

    exact_idx_host = _host_rows(cp, exact_idx).astype(np.int64, copy=False)
    cagra_idx_host = _host_rows(cp, cagra_idx).astype(np.int64, copy=False)
    exact_dist_host = _host_rows(cp, exact_dist).astype(np.float64, copy=False)
    cagra_dist_host = _host_rows(cp, cagra_dist).astype(np.float64, copy=False)

    comparisons: list[AnnQueryComparison] = []
    recalls: list[float] = []
    for query_ordinal in range(query_np.shape[0]):
        exact_ordinals = [int(v) for v in exact_idx_host[query_ordinal].tolist()]
        challenger_ordinals = [int(v) for v in cagra_idx_host[query_ordinal].tolist()]
        recall = len(set(exact_ordinals) & set(challenger_ordinals)) / float(k)
        recalls.append(recall)
        comparisons.append(AnnQueryComparison(
            query_ordinal=query_ordinal,
            recall_at_k=recall,
            exact_ordinals=exact_ordinals,
            cagra_ordinals=challenger_ordinals,
        ))

    exact_rows = [
        f"{q}\0{rank}\0{int(exact_idx_host[q, rank])}\0{exact_dist_host[q, rank]:.17g}"
        for q in range(query_np.shape[0]) for rank in range(k)
    ]
    cagra_rows = [
        f"{q}\0{rank}\0{int(cagra_idx_host[q, rank])}\0{cagra_dist_host[q, rank]:.17g}"
        for q in range(query_np.shape[0]) for rank in range(k)
    ]

    return AnnComparisonReceipt(
        schema="atlas.ann-comparison-receipt.v1",
        metric=metric,
        dimensions=int(corpus_np.shape[1]),
        corpus_rows=int(corpus_np.shape[0]),
        query_rows=int(query_np.shape[0]),
        k=k,
        graph_degree=graph_degree,
        intermediate_graph_degree=intermediate_graph_degree,
        build_algo=build_algo,
        search_width=search_width,
        itopk_size=itopk_size,
        mean_recall_at_k=float(np.mean(recalls)),
        exact_build_ms=exact_build_ms,
        exact_search_ms=exact_search_ms,
        cagra_build_ms=cagra_build_ms,
        cagra_search_ms=cagra_search_ms,
        gpu_free_mb_before=mem_before,
        gpu_free_mb_after=_memory_mb(cp),
        exact_checksum=_sha256("\n".join(exact_rows)),
        cagra_checksum=_sha256("\n".join(cagra_rows)),
        comparisons=comparisons,
        canonical_authority=False,
    )
