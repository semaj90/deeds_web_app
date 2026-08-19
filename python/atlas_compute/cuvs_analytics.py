"""cuVS data-analytics wrappers for Parent Atlas frozen tensors.

These wrappers expose library-owned exact KNN, all-neighbors, pairwise-distance,
and binary-quantized search as revision-friendly receipts. They never create a
new logical semantic vote or canonical relationship.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

Metric = Literal["cosine", "inner_product", "sqeuclidean"]


@dataclass(frozen=True)
class CuvsExactKnnReceipt:
    schema: str
    rows: int
    dimensions: int
    queries: int
    top_k: int
    metric: str
    neighbors_checksum: str
    distances_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CuvsPairwiseReceipt:
    schema: str
    rows_a: int
    rows_b: int
    dimensions: int
    metric: str
    cuvs_metric: str
    postprocess: str
    distances_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CuvsAllNeighborsReceipt:
    schema: str
    rows: int
    dimensions: int
    top_k: int
    algorithm: str
    metric: str
    neighbors_checksum: str
    distances_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CuvsBinaryQuantizationReceipt:
    schema: str
    rows: int
    source_dimensions: int
    encoded_bytes_per_row: int
    search_metric: str
    encoded_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def _matrix(value: Sequence[Sequence[float]] | np.ndarray, *, name: str) -> np.ndarray:
    out = np.asarray(value, dtype=np.float32)
    if out.ndim != 2 or out.shape[0] == 0 or out.shape[1] == 0:
        raise ValueError(f"{name} must be non-empty rank-2")
    if not np.isfinite(out).all():
        raise ValueError(f"{name} contains non-finite values")
    return np.ascontiguousarray(out)


def run_cuvs_exact_knn(
    corpus: Sequence[Sequence[float]] | np.ndarray,
    queries: Sequence[Sequence[float]] | np.ndarray,
    *,
    top_k: int,
    metric: Metric = "cosine",
):
    """Run cuVS brute-force KNN; equal-distance tie order remains noncanonical."""

    import cupy as cp
    from cuvs.neighbors import brute_force

    x = _matrix(corpus, name="corpus")
    q = _matrix(queries, name="queries")
    if q.shape[1] != x.shape[1]:
        raise ValueError("query and corpus dimensions must match")
    if not (1 <= top_k <= x.shape[0]):
        raise ValueError("top_k out of range")

    x_gpu = cp.asarray(x)
    q_gpu = cp.asarray(q)
    index = brute_force.build(x_gpu, metric=metric)
    distances, neighbors = brute_force.search(index, q_gpu, top_k)
    cp.cuda.Stream.null.synchronize()
    neighbors_host = cp.asnumpy(neighbors).astype(np.int64, copy=False)
    distances_host = cp.asnumpy(distances).astype(np.float32, copy=False)
    receipt = CuvsExactKnnReceipt(
        schema="atlas.cuvs-exact-knn-receipt.v1",
        rows=int(x.shape[0]),
        dimensions=int(x.shape[1]),
        queries=int(q.shape[0]),
        top_k=top_k,
        metric=metric,
        neighbors_checksum=_checksum(neighbors_host),
        distances_checksum=_checksum(distances_host),
        canonical_authority=False,
    )
    return neighbors_host, distances_host, receipt


def run_cuvs_pairwise_distance(
    a: Sequence[Sequence[float]] | np.ndarray,
    b: Sequence[Sequence[float]] | np.ndarray,
    *,
    metric: Metric = "sqeuclidean",
):
    """Compute cuVS pairwise distances with an explicit Atlas metric mapping.

    The stable Python pairwise API documents ``euclidean`` rather than a
    ``sqeuclidean`` spelling. Atlas therefore computes Euclidean through cuVS
    and squares it when the higher-level contract requests squared L2.
    """

    import cupy as cp
    from cuvs.distance import pairwise_distance

    left = _matrix(a, name="a")
    right = _matrix(b, name="b")
    if left.shape[1] != right.shape[1]:
        raise ValueError("pairwise matrices must share dimensions")
    left_gpu = cp.asarray(left)
    right_gpu = cp.asarray(right)
    cuvs_metric = "euclidean" if metric == "sqeuclidean" else metric
    distances = pairwise_distance(left_gpu, right_gpu, metric=cuvs_metric)
    if metric == "sqeuclidean":
        distances = distances * distances
    cp.cuda.Stream.null.synchronize()
    host = cp.asnumpy(distances).astype(np.float32, copy=False)
    receipt = CuvsPairwiseReceipt(
        schema="atlas.cuvs-pairwise-receipt.v1",
        rows_a=int(left.shape[0]),
        rows_b=int(right.shape[0]),
        dimensions=int(left.shape[1]),
        metric=metric,
        cuvs_metric=cuvs_metric,
        postprocess="square_distance" if metric == "sqeuclidean" else "none",
        distances_checksum=_checksum(host),
        canonical_authority=False,
    )
    return host, receipt


def run_cuvs_all_neighbors(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    top_k: int,
    algorithm: Literal["brute_force", "nn_descent", "ivf_pq"] = "nn_descent",
    metric: str = "sqeuclidean",
):
    """Build a data-analytics KNN graph; this is not an application relation graph."""

    import cupy as cp
    from cuvs.neighbors import all_neighbors

    source = _matrix(matrix, name="matrix")
    if not (1 <= top_k < source.shape[0]):
        raise ValueError("top_k must be >=1 and < row_count")
    x = cp.asarray(source)
    params = all_neighbors.AllNeighborsParams(algo=algorithm, metric=metric)
    indices_buffer = cp.empty((source.shape[0], top_k), dtype=cp.int64)
    distances_buffer = cp.empty((source.shape[0], top_k), dtype=cp.float32)
    result = all_neighbors.build(
        x,
        top_k,
        params,
        indices=indices_buffer,
        distances=distances_buffer,
    )
    # Current Python builds return indices/distances/core_distances, while the
    # caller-provided buffers are the durable output contract. Prefer returned
    # objects when present but remain compatible with an in-place wrapper.
    if isinstance(result, tuple) and len(result) >= 2:
        indices, distances = result[0], result[1]
    else:
        indices, distances = indices_buffer, distances_buffer
    cp.cuda.Stream.null.synchronize()
    neighbors_host = cp.asnumpy(indices).astype(np.int64, copy=False)
    distances_host = cp.asnumpy(distances).astype(np.float32, copy=False)
    receipt = CuvsAllNeighborsReceipt(
        schema="atlas.cuvs-all-neighbors-receipt.v1",
        rows=int(source.shape[0]),
        dimensions=int(source.shape[1]),
        top_k=top_k,
        algorithm=algorithm,
        metric=metric,
        neighbors_checksum=_checksum(neighbors_host),
        distances_checksum=_checksum(distances_host),
        canonical_authority=False,
    )
    return neighbors_host, distances_host, receipt


def run_cuvs_binary_quantization(matrix: Sequence[Sequence[float]] | np.ndarray):
    """Create a 1-bit sign projection suitable for bitwise-Hamming challengers."""

    import cupy as cp
    from cuvs.preprocessing.quantize import binary

    source = _matrix(matrix, name="matrix")
    transformed = binary.transform(cp.asarray(source))
    cp.cuda.Stream.null.synchronize()
    encoded = cp.asnumpy(transformed).astype(np.uint8, copy=False)
    receipt = CuvsBinaryQuantizationReceipt(
        schema="atlas.cuvs-binary-quantization-receipt.v1",
        rows=int(source.shape[0]),
        source_dimensions=int(source.shape[1]),
        encoded_bytes_per_row=int(encoded.shape[1]),
        search_metric="bitwise_hamming",
        encoded_checksum=_checksum(encoded),
        canonical_authority=False,
    )
    return encoded, receipt
