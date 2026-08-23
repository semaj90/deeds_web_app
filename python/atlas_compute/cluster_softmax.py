"""Soft cluster-assignment challenger for Parent Atlas feature tensors.

cuVS KMeans supplies deterministic hard centroids when initialized from frozen
ordinals. Host-data fit can stream batches to the GPU; prediction/distance is
then batched explicitly because current cuVS predict requires CUDA-array input.
Probabilities are derived; cluster IDs never become canonical concepts.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

from .determinism import configure_torch_determinism
from .rapids_matrix import deterministic_farthest_first_ordinals

DEFAULT_PREDICTION_BATCH_SIZE = 65536


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
    fit_input_residency: str
    streaming_batch_size: int
    prediction_batch_size: int
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


def resolve_prediction_batch_size(value: int) -> int:
    """Resolve the experiment-level ``0 = auto`` convention to a bounded batch."""
    if value < 0:
        raise ValueError("prediction_batch_size must be >=0")
    return DEFAULT_PREDICTION_BATCH_SIZE if value == 0 else value


def run_cuvs_soft_kmeans(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    n_clusters: int,
    temperature: float = 1.0,
    input_normalization: Literal["none", "l2_row"] = "none",
    max_iter: int = 300,
    tol: float = 1e-4,
    streaming_batch_size: int = 0,
    prediction_batch_size: int = DEFAULT_PREDICTION_BATCH_SIZE,
    device: str | None = None,
    seed: int = 0xA71A5,
):
    """Fit deterministic cuVS KMeans and return softmax(-distance/temperature).

    When ``streaming_batch_size > 0``, the normalized NumPy source remains on
    host for cuVS fit and is streamed to the GPU. Prediction and pairwise
    centroid distances are processed in device batches because cuVS predict is a
    CUDA-array API. ``prediction_batch_size=0`` selects the bounded automatic
    default. ``l2_row`` is a cosine-like proxy, not exact spherical KMeans.
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
    if streaming_batch_size < 0:
        raise ValueError("streaming_batch_size must be >=0")
    prediction_batch_size = resolve_prediction_batch_size(int(prediction_batch_size))

    if input_normalization == "l2_row":
        norms = np.linalg.norm(source.astype(np.float64), axis=1, keepdims=True)
        source = (source / np.maximum(norms, 1e-12)).astype(np.float32)
        semantic_mode = "l2_normalized_sqeuclidean_cosine_proxy"
    else:
        semantic_mode = "raw_sqeuclidean"
    source = np.ascontiguousarray(source, dtype=np.float32)

    init_ordinals = deterministic_farthest_first_ordinals(source, n_clusters)
    initial = cp.asarray(source[np.asarray(init_ordinals, dtype=np.int64)], dtype=cp.float32)
    params = kmeans.KMeansParams(
        metric="sqeuclidean", n_clusters=n_clusters, init_method="Array",
        max_iter=max_iter, tol=tol, n_init=1, streaming_batch_size=streaming_batch_size,
    )

    if streaming_batch_size > 0:
        fit_input = source
        fit_input_residency = "host_streamed"
    else:
        fit_input = cp.asarray(source, dtype=cp.float32)
        fit_input_residency = "device_resident"

    centroids, inertia, n_iter = kmeans.fit(params, fit_input, centroids=initial)
    cp.cuda.Stream.null.synchronize()
    centroids_host = cp.asnumpy(centroids).astype(np.float32, copy=False)

    labels_parts: list[np.ndarray] = []
    probability_parts: list[np.ndarray] = []
    entropy_values: list[np.ndarray] = []
    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")

    for start in range(0, source.shape[0], prediction_batch_size):
        end = min(source.shape[0], start + prediction_batch_size)
        batch_gpu = cp.asarray(source[start:end], dtype=cp.float32)
        labels, _ = kmeans.predict(params, batch_gpu, centroids)
        euclidean = pairwise_distance(batch_gpu, centroids, metric="euclidean")
        distances_host = cp.asnumpy(euclidean * euclidean).astype(np.float32, copy=False)
        labels_parts.append(cp.asnumpy(labels).reshape(-1).astype(np.int64, copy=False))

        distance_tensor = torch.as_tensor(distances_host, dtype=torch.float32, device=resolved_device)
        with torch.inference_mode():
            probabilities = torch.softmax(-distance_tensor / float(temperature), dim=1, dtype=torch.float32)
            safe = probabilities.clamp_min(1e-12)
            entropy = -(safe * safe.log()).sum(dim=1)
        probability_parts.append(probabilities.detach().cpu().numpy().astype(np.float32, copy=False))
        entropy_values.append(entropy.detach().cpu().numpy().astype(np.float32, copy=False))

    cp.cuda.Stream.null.synchronize()
    labels_host = np.ascontiguousarray(np.concatenate(labels_parts), dtype=np.int64)
    probabilities_host = np.ascontiguousarray(np.concatenate(probability_parts, axis=0), dtype=np.float32)
    entropy_host = np.concatenate(entropy_values).astype(np.float32, copy=False)
    sums = probabilities_host.sum(axis=1, dtype=np.float64)

    receipt = CuvsSoftKMeansReceipt(
        schema="atlas.cuvs-soft-kmeans-receipt.v2",
        rows=int(source.shape[0]), dimensions=int(source.shape[1]), n_clusters=n_clusters,
        metric="sqeuclidean", input_normalization=input_normalization, semantic_mode=semantic_mode,
        pairwise_metric="euclidean", pairwise_postprocess="square_distance", temperature=float(temperature),
        initialization_ordinals=init_ordinals, fit_input_residency=fit_input_residency,
        streaming_batch_size=int(streaming_batch_size), prediction_batch_size=int(prediction_batch_size),
        fit_iterations=int(n_iter), inertia=float(inertia), labels_checksum=_checksum(labels_host),
        centroids_checksum=_checksum(centroids_host), probabilities_checksum=_checksum(probabilities_host),
        max_probability_sum_error=float(np.max(np.abs(sums - 1.0))),
        mean_assignment_entropy=float(np.mean(entropy_host, dtype=np.float64)), canonical_authority=False,
    )
    return labels_host, centroids_host, probabilities_host, receipt
