"""Portable inference helpers for the offline domain classifier."""

from __future__ import annotations

import numpy as np


class NumpyCentroidKMeans:
    """Small inference-only KMeans view backed by portable centroid arrays.

    CUDA training can save centroids without requiring RAPIDS in the serving
    process. Distances match the Euclidean distance-to-centroid feature used by
    the sklearn KMeans path.
    """

    def __init__(self, cluster_centers: np.ndarray) -> None:
        centers = np.asarray(cluster_centers, dtype=np.float32)
        if centers.ndim != 2 or centers.shape[0] < 1 or centers.shape[1] < 1:
            raise ValueError("cluster_centers must be a non-empty 2D matrix")
        if not np.isfinite(centers).all():
            raise ValueError("cluster_centers must contain only finite values")
        self.cluster_centers_ = np.ascontiguousarray(centers)
        self.n_clusters = int(centers.shape[0])

    def transform(self, features: np.ndarray) -> np.ndarray:
        values = np.asarray(features, dtype=np.float32)
        if values.ndim != 2 or values.shape[1] != self.cluster_centers_.shape[1]:
            raise ValueError("features must be 2D and match the centroid width")
        if not np.isfinite(values).all():
            raise ValueError("features must contain only finite values")
        # ||x-c||^2 = ||x||^2 + ||c||^2 - 2x·c; clamp round-off before sqrt.
        distances_squared = (
            np.sum(values * values, axis=1, keepdims=True)
            + np.sum(self.cluster_centers_ * self.cluster_centers_, axis=1)[None, :]
            - 2.0 * values @ self.cluster_centers_.T
        )
        return np.sqrt(np.maximum(distances_squared, 0.0)).astype(np.float32, copy=False)

    def predict(self, features: np.ndarray) -> np.ndarray:
        return np.argmin(self.transform(features), axis=1).astype(np.int32)


def cluster_distance_features(kmeans: object, embeddings: np.ndarray) -> dict[str, float]:
    """Build the shared training/serving feature row from successfully embedded chunks."""
    values = np.asarray(embeddings, dtype=np.float32)
    if values.ndim != 2 or values.shape[0] < 1:
        raise ValueError("embeddings must be a non-empty 2D matrix")
    transform = getattr(kmeans, "transform", None)
    predict = getattr(kmeans, "predict", None)
    if not callable(transform) or not callable(predict):
        raise ValueError("kmeans must provide transform() and predict()")

    distances = np.asarray(transform(values), dtype=np.float32)
    assignments = np.asarray(predict(values), dtype=np.int64).reshape(-1)
    n_clusters = int(getattr(kmeans, "n_clusters", 0) or 0)
    if n_clusters < 1:
        centers = getattr(kmeans, "cluster_centers_", None)
        n_clusters = int(np.asarray(centers).shape[0]) if centers is not None else 0
    if (
        distances.ndim != 2
        or distances.shape[0] != values.shape[0]
        or distances.shape[1] != n_clusters
        or assignments.shape[0] != values.shape[0]
        or np.any(assignments < 0)
        or np.any(assignments >= n_clusters)
        or not np.isfinite(distances).all()
    ):
        raise ValueError("kmeans output does not match the embedded chunk matrix")

    nearest = distances[np.arange(len(assignments)), assignments]
    return {
        "cluster_mean_distance": float(np.mean(nearest)),
        "cluster_distance_std": float(np.std(nearest)) if len(nearest) > 1 else 0.0,
        "cluster_diversity": float(len(set(assignments.tolist()))) / float(n_clusters),
        # Match training: failed embedding requests do not become classifier features.
        "chunk_count": float(values.shape[0]),
    }
