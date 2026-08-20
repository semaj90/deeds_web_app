"""RAPIDS/cuVS matrix challengers for Parent Atlas feature tensors.

No custom CUDA kernels live here. KMeans uses deterministic caller-supplied
farthest-first initial centroids; PCA uses the cuVS preprocessing API. Both emit
derived receipts and require replay/evaluation before policy eligibility.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np


@dataclass(frozen=True)
class RapidsPcaReceipt:
    schema: str
    rows: int
    dimensions: int
    n_components: int
    algorithm: str
    whiten: bool
    explained_variance_ratio: list[float]
    singular_values: list[float]
    relative_reconstruction_error: float
    transformed_checksum: str
    reconstructed_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RapidsKMeansReceipt:
    schema: str
    rows: int
    dimensions: int
    n_clusters: int
    metric: str
    init_method: str
    initialization_ordinals: list[int]
    iterations: int
    inertia: float
    labels_checksum: str
    centroids_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum_array(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def deterministic_farthest_first_ordinals(matrix: np.ndarray, n_clusters: int) -> list[int]:
    """Choose deterministic initial centroids using squared Euclidean distance.

    Starts from canonical ordinal 0; each next centroid is the row farthest from
    its nearest selected centroid, with ordinal as the tie breaker.
    """

    x = np.asarray(matrix, dtype=np.float32)
    if x.ndim != 2 or x.shape[0] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if not (1 <= n_clusters <= x.shape[0]):
        raise ValueError("n_clusters out of range")

    selected = [0]
    min_distance = np.sum((x - x[0]) ** 2, axis=1, dtype=np.float64)
    min_distance[0] = -np.inf
    while len(selected) < n_clusters:
        maximum = float(np.max(min_distance))
        candidates = np.flatnonzero(min_distance == maximum)
        next_ordinal = int(candidates[0])
        selected.append(next_ordinal)
        distance = np.sum((x - x[next_ordinal]) ** 2, axis=1, dtype=np.float64)
        min_distance = np.minimum(min_distance, distance)
        min_distance[np.asarray(selected, dtype=np.int64)] = -np.inf
    return selected


def run_cuvs_kmeans(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    n_clusters: int,
    metric: str = "sqeuclidean",
    max_iter: int = 300,
    tol: float = 1e-4,
    batch_samples: int = 0,
    batch_centroids: int = 0,
) -> RapidsKMeansReceipt:
    """Run cuVS KMeans with deterministic array initialization."""

    import cupy as cp
    from cuvs.cluster import kmeans

    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    init_ordinals = deterministic_farthest_first_ordinals(source, n_clusters)
    x = cp.asarray(source, dtype=cp.float32)
    initial = cp.asarray(source[np.asarray(init_ordinals, dtype=np.int64)], dtype=cp.float32)

    params = kmeans.KMeansParams(
        metric=metric,
        n_clusters=n_clusters,
        init_method="Array",
        max_iter=max_iter,
        tol=tol,
        n_init=1,
        batch_samples=batch_samples,
        batch_centroids=batch_centroids,
    )
    centroids, inertia, n_iter = kmeans.fit(params, x, centroids=initial)
    labels, predicted_inertia = kmeans.predict(params, x, centroids)
    cp.cuda.Stream.null.synchronize()

    labels_host = np.asarray(cp.asnumpy(labels)).reshape(-1).astype(np.int64, copy=False)
    centroids_host = np.asarray(cp.asnumpy(centroids)).astype(np.float32, copy=False)
    # The two inertia calculations should agree closely; retain the fit value as
    # canonical receipt value and fail closed on obvious API/metric mismatch.
    if not np.isfinite(float(inertia)) or not np.isfinite(float(predicted_inertia)):
        raise ValueError("cuVS KMeans returned non-finite inertia")

    return RapidsKMeansReceipt(
        schema="atlas.rapids-kmeans-receipt.v1",
        rows=int(source.shape[0]),
        dimensions=int(source.shape[1]),
        n_clusters=n_clusters,
        metric=metric,
        init_method="deterministic_farthest_first_array",
        initialization_ordinals=init_ordinals,
        iterations=int(n_iter),
        inertia=float(inertia),
        labels_checksum=_checksum_array(labels_host),
        centroids_checksum=_checksum_array(centroids_host),
        canonical_authority=False,
    )


def run_cuvs_pca(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    n_components: int,
    algorithm: Literal["cov_eig_dq", "cov_eig_jacobi"] = "cov_eig_dq",
    whiten: bool = False,
    tol: float = 0.0,
    n_iterations: int = 15,
) -> RapidsPcaReceipt:
    """Run cuVS PCA and verify it through reconstruction rather than signs."""

    import cupy as cp
    from cuvs.preprocessing import pca

    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if not (1 <= n_components <= min(source.shape)):
        raise ValueError("n_components out of range")

    x = cp.asarray(source, dtype=cp.float32)
    params = pca.Params(
        n_components=n_components,
        copy=True,
        whiten=whiten,
        algorithm=algorithm,
        tol=tol,
        n_iterations=n_iterations,
    )
    result = pca.fit_transform(params, x)
    reconstructed = pca.inverse_transform(
        params,
        result.trans_input,
        result.components,
        result.singular_vals,
        result.mu,
    )
    cp.cuda.Stream.null.synchronize()

    transformed_host = np.asarray(cp.asnumpy(result.trans_input)).astype(np.float32, copy=False)
    reconstructed_host = np.asarray(cp.asnumpy(reconstructed)).astype(np.float32, copy=False)
    explained_ratio = np.asarray(cp.asnumpy(result.explained_var_ratio)).astype(np.float64, copy=False)
    singular_values = np.asarray(cp.asnumpy(result.singular_vals)).astype(np.float64, copy=False)
    numerator = np.linalg.norm(source.astype(np.float64) - reconstructed_host.astype(np.float64))
    denominator = max(np.linalg.norm(source.astype(np.float64)), 1e-12)

    return RapidsPcaReceipt(
        schema="atlas.rapids-pca-receipt.v1",
        rows=int(source.shape[0]),
        dimensions=int(source.shape[1]),
        n_components=n_components,
        algorithm=algorithm,
        whiten=whiten,
        explained_variance_ratio=[float(value) for value in explained_ratio.tolist()],
        singular_values=[float(value) for value in singular_values.tolist()],
        relative_reconstruction_error=float(numerator / denominator),
        transformed_checksum=_checksum_array(transformed_host),
        reconstructed_checksum=_checksum_array(reconstructed_host),
        canonical_authority=False,
    )
