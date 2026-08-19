"""Compare derived latent representations against an exact semantic reference.

This module does not train or own an autoencoder. It evaluates already-produced
representations (AE/PCA/SVD/etc.) against the frozen canonical semantic matrix.
The main metrics are neighborhood preservation and distance correlation, because
low reconstruction loss alone does not prove retrieval usefulness.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Mapping, Sequence

import numpy as np


@dataclass(frozen=True)
class RepresentationMetric:
    name: str
    dimensions: int
    mean_neighbor_overlap_at_k: float
    mean_distance_correlation: float
    latent_checksum: str


@dataclass(frozen=True)
class RepresentationComparisonReceipt:
    schema: str
    reference_dimensions: int
    row_count: int
    k: int
    reference_checksum: str
    representations: list[RepresentationMetric]
    recommended_representation: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(matrix: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(matrix, dtype=np.float32).tobytes()).hexdigest()


def _pairwise_sqeuclidean(matrix: np.ndarray) -> np.ndarray:
    values = np.asarray(matrix, dtype=np.float64)
    norms = np.sum(values * values, axis=1, keepdims=True)
    dist = norms + norms.T - 2.0 * (values @ values.T)
    np.maximum(dist, 0.0, out=dist)
    np.fill_diagonal(dist, np.inf)
    return dist


def _neighbors(distances: np.ndarray, k: int) -> list[list[int]]:
    rows: list[list[int]] = []
    for row in distances:
        # Stable full sort: ordinal is the secondary key for equal distances.
        ordinal = np.arange(row.shape[0], dtype=np.int64)
        order = np.lexsort((ordinal, row))[:k]
        rows.append([int(value) for value in order.tolist()])
    return rows


def _row_distance_correlation(reference: np.ndarray, challenger: np.ndarray) -> float:
    mask = np.isfinite(reference) & np.isfinite(challenger)
    if np.count_nonzero(mask) < 2:
        return 1.0
    left = reference[mask]
    right = challenger[mask]
    if np.std(left) == 0 or np.std(right) == 0:
        return 1.0 if np.allclose(left, right) else 0.0
    return float(np.corrcoef(left, right)[0, 1])


def compare_representations(
    reference: Sequence[Sequence[float]] | np.ndarray,
    representations: Mapping[str, Sequence[Sequence[float]] | np.ndarray],
    *,
    k: int = 10,
) -> RepresentationComparisonReceipt:
    ref = np.asarray(reference, dtype=np.float32)
    if ref.ndim != 2 or ref.shape[0] < 2:
        raise ValueError("reference must be rank-2 with at least two rows")
    if not (1 <= k < ref.shape[0]):
        raise ValueError("k must be in [1, row_count-1]")
    if not representations:
        raise ValueError("at least one challenger representation is required")

    ref_dist = _pairwise_sqeuclidean(ref)
    ref_neighbors = _neighbors(ref_dist, k)
    metrics: list[RepresentationMetric] = []

    for name in sorted(representations):
        latent = np.asarray(representations[name], dtype=np.float32)
        if latent.ndim != 2 or latent.shape[0] != ref.shape[0]:
            raise ValueError(f"{name}: row count mismatch")
        latent_dist = _pairwise_sqeuclidean(latent)
        latent_neighbors = _neighbors(latent_dist, k)

        overlaps = [
            len(set(ref_neighbors[row]) & set(latent_neighbors[row])) / float(k)
            for row in range(ref.shape[0])
        ]
        correlations = [
            _row_distance_correlation(ref_dist[row], latent_dist[row])
            for row in range(ref.shape[0])
        ]
        metrics.append(RepresentationMetric(
            name=name,
            dimensions=int(latent.shape[1]),
            mean_neighbor_overlap_at_k=float(np.mean(overlaps)),
            mean_distance_correlation=float(np.mean(correlations)),
            latent_checksum=_checksum(latent),
        ))

    # Preserve retrieval neighborhoods first, then distance geometry, then use
    # fewer dimensions as a resource tie-breaker, then lexical name.
    metrics.sort(key=lambda item: (
        -item.mean_neighbor_overlap_at_k,
        -item.mean_distance_correlation,
        item.dimensions,
        item.name,
    ))
    return RepresentationComparisonReceipt(
        schema="atlas.representation-comparison-receipt.v1",
        reference_dimensions=int(ref.shape[1]),
        row_count=int(ref.shape[0]),
        k=k,
        reference_checksum=_checksum(ref),
        representations=metrics,
        recommended_representation=metrics[0].name,
        canonical_authority=False,
    )
