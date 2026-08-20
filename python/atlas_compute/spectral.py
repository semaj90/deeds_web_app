"""Exact/small-graph spectral references for Parent Atlas.

Use these only on bounded symmetric matrices (adjacency, normalized Laplacian,
feature covariance). Eigenvectors are sign/phase ambiguous, so receipts compare
subspace/projector quantities instead of raw vector signs.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Sequence

import numpy as np


@dataclass(frozen=True)
class SpectralReceipt:
    schema: str
    matrix_size: int
    component_count: int
    eigenvalues: list[float]
    projector_checksum: str
    spectral_gap: float | None
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _projector_checksum(vectors: np.ndarray) -> str:
    projector = np.asarray(vectors @ vectors.T, dtype=np.float64)
    return hashlib.sha256(np.ascontiguousarray(projector).tobytes()).hexdigest()


def symmetric_eigenspace(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    component_count: int,
    largest: bool = True,
) -> tuple[np.ndarray, SpectralReceipt]:
    """Return a bounded eigenspace with sign-invariant receipt semantics."""

    values = np.asarray(matrix, dtype=np.float64)
    if values.ndim != 2 or values.shape[0] != values.shape[1]:
        raise ValueError("matrix must be square")
    if not np.allclose(values, values.T, rtol=1e-10, atol=1e-12):
        raise ValueError("matrix must be symmetric")
    if not (1 <= component_count <= values.shape[0]):
        raise ValueError("component_count out of range")

    eigenvalues, eigenvectors = np.linalg.eigh(values)
    order = np.argsort(eigenvalues, kind="stable")
    if largest:
        order = order[::-1]
    selected = order[:component_count]
    selected_values = eigenvalues[selected]
    selected_vectors = eigenvectors[:, selected]

    # Gap to the next excluded eigenvalue in the chosen ordering. A tiny gap
    # indicates an unstable individual eigenvector basis, even though the
    # invariant subspace/projector can still be meaningful.
    spectral_gap: float | None = None
    if component_count < values.shape[0]:
        included_edge = float(selected_values[-1])
        excluded_edge = float(eigenvalues[order[component_count]])
        spectral_gap = abs(included_edge - excluded_edge)

    receipt = SpectralReceipt(
        schema="atlas.spectral-receipt.v1",
        matrix_size=int(values.shape[0]),
        component_count=component_count,
        eigenvalues=[float(value) for value in selected_values.tolist()],
        projector_checksum=_projector_checksum(selected_vectors),
        spectral_gap=spectral_gap,
        canonical_authority=False,
    )
    return selected_vectors, receipt
