"""
cuml_executor.py
----------------
GPU-accelerated clustering (KMeans) and manifold projection (UMAP) for Parent Atlas.
Executes within RAPIDS cu13 environment (WSL2) with automatic CPU fallback
for development and dry-run environments.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Runtime probe for cuML
_CUML_AVAILABLE = False
_CUML_VERSION: str | None = None
_CUML_ERROR: str | None = None

try:
    import cuml
    from cuml.cluster import KMeans as cuKMeans
    from cuml.manifold import UMAP as cuUMAP
    import cupy as cp

    _CUML_AVAILABLE = True
    _CUML_VERSION = getattr(cuml, "__version__", "unknown")
except Exception as exc:
    _CUML_AVAILABLE = False
    _CUML_ERROR = f"{type(exc).__name__}: {exc}"
    cuKMeans = None
    cuUMAP = None
    cp = None


@dataclass(frozen=True)
class ClusterResultV1:
    labels: np.ndarray
    n_clusters: int
    backend: str
    inertia: float | None = None


@dataclass(frozen=True)
class ManifoldResultV1:
    embedding: np.ndarray
    n_components: int
    backend: str


def is_cuml_available() -> bool:
    """Returns True if RAPIDS cuML is installed and CUDA device is accessible."""
    return _CUML_AVAILABLE


def cuml_kmeans_fit_predict(
    features: np.ndarray,
    n_clusters: int = 256,
    random_state: int = 42,
    prefer_gpu: bool = True,
) -> ClusterResultV1:
    """
    Fits KMeans clustering on candidate feature array.
    Uses cuML KMeans on GPU if available, falls back to scikit-learn on CPU.
    """
    if features.ndim != 2:
        raise ValueError(f"Features must be 2D array, got shape {features.shape}")

    n_samples = features.shape[0]
    actual_clusters = min(n_clusters, n_samples)
    if actual_clusters < 1:
        raise ValueError("Cannot cluster empty feature set")

    if prefer_gpu and _CUML_AVAILABLE and cuKMeans is not None and cp is not None:
        try:
            gpu_data = cp.asarray(features, dtype=cp.float32)
            model = cuKMeans(n_clusters=actual_clusters, random_state=random_state)
            labels_gpu = model.fit_predict(gpu_data)
            labels_np = cp.asnumpy(labels_gpu).astype(np.int32)
            inertia = float(model.inertia_) if hasattr(model, "inertia_") else None
            return ClusterResultV1(
                labels=labels_np,
                n_clusters=actual_clusters,
                backend=f"cuml.cluster.KMeans-{_CUML_VERSION}",
                inertia=inertia,
            )
        except Exception as err:
            logger.warning("cuML KMeans execution failed, falling back to CPU: %s", err)

    # CPU Fallback via scikit-learn
    from sklearn.cluster import KMeans as skKMeans

    model = skKMeans(
        n_clusters=actual_clusters,
        random_state=random_state,
        n_init="auto",
    )
    labels = model.fit_predict(features)
    return ClusterResultV1(
        labels=labels.astype(np.int32),
        n_clusters=actual_clusters,
        backend="sklearn.cluster.KMeans",
        inertia=float(model.inertia_),
    )


def cuml_umap_transform(
    features: np.ndarray,
    n_components: int = 2,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    random_state: int = 42,
    prefer_gpu: bool = True,
) -> ManifoldResultV1:
    """
    Computes UMAP manifold projection on feature array.
    Uses cuML UMAP on GPU if available, falls back to umap-learn or TruncatedSVD on CPU.
    """
    if features.ndim != 2:
        raise ValueError(f"Features must be 2D array, got shape {features.shape}")

    n_samples = features.shape[0]
    actual_neighbors = min(n_neighbors, max(2, n_samples - 1))

    if prefer_gpu and _CUML_AVAILABLE and cuUMAP is not None and cp is not None:
        try:
            gpu_data = cp.asarray(features, dtype=cp.float32)
            model = cuUMAP(
                n_components=n_components,
                n_neighbors=actual_neighbors,
                min_dist=min_dist,
                random_state=random_state,
            )
            embedding_gpu = model.fit_transform(gpu_data)
            embedding_np = cp.asnumpy(embedding_gpu).astype(np.float32)
            return ManifoldResultV1(
                embedding=embedding_np,
                n_components=n_components,
                backend=f"cuml.manifold.UMAP-{_CUML_VERSION}",
            )
        except Exception as err:
            logger.warning("cuML UMAP execution failed, falling back to CPU: %s", err)

    # CPU Fallback
    try:
        import umap

        reducer = umap.UMAP(
            n_components=n_components,
            n_neighbors=actual_neighbors,
            min_dist=min_dist,
            random_state=random_state,
        )
        embedding = reducer.fit_transform(features).astype(np.float32)
        return ManifoldResultV1(
            embedding=embedding,
            n_components=n_components,
            backend="umap.UMAP",
        )
    except ImportError:
        from sklearn.decomposition import TruncatedSVD

        svd = TruncatedSVD(n_components=n_components, random_state=random_state)
        embedding = svd.fit_transform(features).astype(np.float32)
        return ManifoldResultV1(
            embedding=embedding,
            n_components=n_components,
            backend="sklearn.decomposition.TruncatedSVD-fallback",
        )
