"""Soft cluster-assignment challenger for Parent Atlas feature tensors.

cuVS KMeans supplies deterministic hard centroids when initialized from frozen
ordinals. This module converts squared distances to a temperature-controlled
softmax distribution for downstream policy/routing. Probabilities are derived;
cluster IDs never become canonical concepts or relationships.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

from .determinism import configure_torch_determinism
from .rapids_matrix import deterministic_farthest_first_ordinals


@dataclass(frozen=True)
class CuvsSoftKMeansReceipt:
    schema: str
    rows: int
    dimensions: int
    n_clusters: int
    metric: str
    input_normalization: str
    semantic_mode: str
    pairwise_metric: str
    pairwise_postprocess: str
    temperature: float
    initialization_ordinals: list[int]
    fit_iterations: int
    inertia: float
    labels_checksum: str
    centroids_checksum: str
    probabilities_checksum: str
    max_probability_sum_error: float
    mean_assignment_entropy: float
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def run_cuvs_soft_kmeans(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    n_clusters: int,
    temperature: float = 1.0,
    input_normalization: Literal["none", "l2_row"] = "none",
    max_iter: int = 300,
    tol: float = 1e-4,
    device: str | None = None,
    seed: int = 0xA71A5,
):
    """Fit deterministic cuVS KMeans and return a derived soft assignment.

    ``l2_row`` is the preferred semantic-vector experiment: normalize every row
    first, then use squared Euclidean KMeans. This is recorded as a cosine-like
    proxy and is not claimed to be an exact spherical-k-means implementation.
    """

    import cupy as cp
    import torch
    from cuvs.cluster import kmeans
    from cuvs.distance import pairwise_distance

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if not np.isfinite(source).all():
        raise ValueError("matrix contains non-finite values")
    if not (1 <= n_clusters <= source.shape[0]):
        raise ValueError("n_clusters out of range")
    if temperature <= 0 or not np.isfinite(temperature):
        raise ValueError("temperature must be finite and positive")

    if input_normalization == "l2_row":
        norms = np.linalg.norm(source.astype(np.float64), axis=1, keepdims=True)
        source = (source / np.maximum(norms, 1e-12)).astype(np.float32)
        semantic_mode = "l2_normalized_sqeuclidean_cosine_proxy"
    else:
        semantic_mode = "raw_sqeuclidean"

    init_ordinals = deterministic_farthest_first_ordinals(source, n_clusters)
    x = cp.asarray(source, dtype=cp.float32)
    initial = cp.asarray(source[np.asarray(init_ordinals, dtype=np.int64)], dtype=cp.float32)
    params = kmeans.KMeansParams(
        metric="sqeuclidean",
        n_clusters=n_clusters,
        init_method="Array",
        max_iter=max_iter,
        tol=tol,
        n_init=1,
    )
    centroids, inertia, n_iter = kmeans.fit(params, x, centroids=initial)
    labels, _ = kmeans.predict(params, x, centroids)
    euclidean = pairwise_distance(x, centroids, metric="euclidean")
    distances = euclidean * euclidean
    cp.cuda.Stream.null.synchronize()

    distances_host = cp.asnumpy(distances).astype(np.float32, copy=False)
    centroids_host = cp.asnumpy(centroids).astype(np.float32, copy=False)
    labels_host = cp.asnumpy(labels).reshape(-1).astype(np.int64, copy=False)

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    distance_tensor = torch.as_tensor(distances_host, dtype=torch.float32, device=resolved_device)
    with torch.inference_mode():
        probabilities = torch.softmax(-distance_tensor / float(temperature), dim=1, dtype=torch.float32)
        entropy = -(probabilities.clamp_min(1e-12) * probabilities.clamp_min(1e-12).log()).sum(dim=1)
    probabilities_host = probabilities.detach().cpu().numpy().astype(np.float32, copy=False)
    sums = probabilities_host.sum(axis=1, dtype=np.float64)

    receipt = CuvsSoftKMeansReceipt(
        schema="atlas.cuvs-soft-kmeans-receipt.v1",
        rows=int(source.shape[0]),
        dimensions=int(source.shape[1]),
        n_clusters=n_clusters,
        metric="sqeuclidean",
        input_normalization=input_normalization,
        semantic_mode=semantic_mode,
        pairwise_metric="euclidean",
        pairwise_postprocess="square_distance",
        temperature=float(temperature),
        initialization_ordinals=init_ordinals,
        fit_iterations=int(n_iter),
        inertia=float(inertia),
        labels_checksum=_checksum(labels_host),
        centroids_checksum=_checksum(centroids_host),
        probabilities_checksum=_checksum(probabilities_host),
        max_probability_sum_error=float(np.max(np.abs(sums - 1.0))),
        mean_assignment_entropy=float(entropy.mean().detach().cpu()),
        canonical_authority=False,
    )
    return labels_host, centroids_host, probabilities_host, receipt
