"""Deterministic self-organizing-map reference for Parent Atlas.

SOM coordinates are derived topology/routing features. Canonical identity stays
external and is joined by frozen ordinal. Training order, initialization and
decay schedule are deterministic so CPU/GPU challengers can compare receipts.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Sequence

import numpy as np

from .determinism import configure_torch_determinism
from .rapids_matrix import RapidsKMeansArtifact


@dataclass(frozen=True)
class SomReceipt:
    schema: str
    rows: int
    dimensions: int
    grid_rows: int
    grid_columns: int
    epochs: int
    learning_rate_start: float
    sigma_start: float
    quantization_error: float
    topology_checksum: str
    codebook_checksum: str
    initialization_method: str
    input_checksum: str
    initial_centroids_checksum: str
    initialization_receipt_checksum: str | None
    seed: int
    initialization_perturbation: float
    update_rule: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SomLatticeReceipt:
    schema: str
    rows: int
    grid_rows: int
    grid_columns: int
    value_dimensions: int
    occupied_cells: int
    occupancy_fraction: float
    field_checksum: str
    count_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def _farthest_seed_ordinals(matrix: np.ndarray, count: int) -> list[int]:
    if count <= 0:
        raise ValueError("count must be positive")
    if matrix.shape[0] < count:
        base = list(range(matrix.shape[0]))
        return [base[i % len(base)] for i in range(count)]
    chosen = [0]
    min_distance = np.sum((matrix - matrix[0]) ** 2, axis=1, dtype=np.float64)
    min_distance[0] = -np.inf
    while len(chosen) < count:
        maximum = float(np.max(min_distance))
        candidates = np.flatnonzero(min_distance == maximum)
        ordinal = int(candidates[0])
        chosen.append(ordinal)
        distance = np.sum((matrix - matrix[ordinal]) ** 2, axis=1, dtype=np.float64)
        min_distance = np.minimum(min_distance, distance)
        min_distance[np.asarray(chosen, dtype=np.int64)] = -np.inf
    return chosen


def _pca_lattice_seed_matrix(
    matrix: np.ndarray,
    grid_rows: int,
    grid_columns: int,
    *,
    seed: int,
    perturbation: float,
) -> np.ndarray:
    if matrix.shape[1] < 2:
        raise ValueError("PCA_LATTICE_REQUIRES_AT_LEAST_TWO_FEATURES")
    centered = matrix.astype(np.float64, copy=False) - matrix.mean(axis=0, dtype=np.float64)
    _, _, components = np.linalg.svd(centered, full_matrices=False)
    axes = components[:2].copy()
    scores = centered @ axes.T
    for index in range(2):
        anchor = int(np.argmax(np.abs(axes[index])))
        if axes[index, anchor] < 0:
            axes[index] *= -1
            scores[:, index] *= -1
    mean = matrix.mean(axis=0, dtype=np.float64)
    row_values = np.linspace(scores[:, 0].min(), scores[:, 0].max(), grid_rows)
    column_values = np.linspace(scores[:, 1].min(), scores[:, 1].max(), grid_columns)
    rng = np.random.default_rng(seed)
    noise = rng.normal(size=(grid_rows * grid_columns, 2))
    noise *= np.std(scores, axis=0, dtype=np.float64) * perturbation
    lattice = np.empty((grid_rows * grid_columns, matrix.shape[1]), dtype=np.float64)
    ordinal = 0
    for row_value in row_values:
        for column_value in column_values:
            lattice[ordinal] = (
                mean
                + (row_value + noise[ordinal, 0]) * axes[0]
                + (column_value + noise[ordinal, 1]) * axes[1]
            )
            ordinal += 1
    return np.asarray(lattice, dtype=np.float32, order="C")


def _batch_bmus(matrix: Any, codebook: Any, batch_rows: int):
    import torch

    code_norm = torch.sum(codebook * codebook, dim=1).reshape(1, -1)
    winners = []
    for start in range(0, int(matrix.shape[0]), batch_rows):
        batch = matrix[start : start + batch_rows]
        distances = (
            torch.sum(batch * batch, dim=1, keepdim=True)
            + code_norm
            - 2.0 * torch.matmul(batch, codebook.T)
        )
        winners.append(torch.argmin(distances, dim=1))
    return torch.cat(winners)


def train_deterministic_som(
    matrix: Sequence[Sequence[float]] | np.ndarray,
    *,
    grid_rows: int = 20,
    grid_columns: int = 20,
    epochs: int = 20,
    learning_rate: float = 0.4,
    sigma: float | None = None,
    device: str | None = None,
    seed: int = 0xA71A5,
    kmeans_artifact: RapidsKMeansArtifact | None = None,
    initialization: str = "deterministic_farthest_sample_rows",
    initialization_perturbation: float = 0.0,
    update_rule: str = "online_v1",
    assignment_batch_rows: int = 4096,
):
    """Train a deterministic online SOM and return BMU coordinates + receipt."""

    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if not np.isfinite(source).all():
        raise ValueError("matrix must contain only finite values")
    if grid_rows <= 0 or grid_columns <= 0 or epochs <= 0:
        raise ValueError("grid dimensions and epochs must be positive")
    if learning_rate <= 0:
        raise ValueError("learning_rate must be positive")
    if not np.isfinite(initialization_perturbation) or initialization_perturbation < 0:
        raise ValueError("initialization_perturbation must be finite and nonnegative")
    if initialization != "pca_lattice_v1" and initialization_perturbation != 0:
        raise ValueError("INITIALIZATION_PERTURBATION_REQUIRES_PCA_LATTICE")
    if update_rule not in {"online_v1", "batch_neighborhood_v1"}:
        raise ValueError(f"UNSUPPORTED_SOM_UPDATE_RULE:{update_rule}")
    if assignment_batch_rows <= 0:
        raise ValueError("assignment_batch_rows must be positive")

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    x = torch.as_tensor(source, dtype=torch.float32, device=resolved_device)
    unit_count = grid_rows * grid_columns
    input_checksum = _checksum(source)
    initialization_receipt_checksum = None
    if kmeans_artifact is None and initialization == "deterministic_farthest_sample_rows":
        initial_ordinals = _farthest_seed_ordinals(source, unit_count)
        seed_matrix = source[np.asarray(initial_ordinals)]
        initialization_method = "deterministic_farthest_sample_rows"
    elif kmeans_artifact is None and initialization == "pca_lattice_v1":
        seed_matrix = _pca_lattice_seed_matrix(
            source,
            grid_rows,
            grid_columns,
            seed=seed,
            perturbation=initialization_perturbation,
        )
        initialization_method = "pca_lattice_v1"
    elif kmeans_artifact is not None and initialization == "deterministic_farthest_sample_rows":
        seed_matrix = np.array(kmeans_artifact.centroids, dtype=np.float32, copy=True, order="C")
        if seed_matrix.shape != (unit_count, source.shape[1]):
            raise ValueError("KMEANS_CENTROID_SHAPE_MISMATCH")
        if not np.isfinite(seed_matrix).all():
            raise ValueError("KMEANS_CENTROIDS_NONFINITE")
        receipt = kmeans_artifact.receipt.to_dict()
        expected = {
            "schema": "atlas.rapids-kmeans-receipt.v2",
            "rows": int(source.shape[0]),
            "dimensions": int(source.shape[1]),
            "n_clusters": unit_count,
            "metric": "sqeuclidean",
            "input_checksum": input_checksum,
            "centroids_checksum": _checksum(seed_matrix),
            "canonical_authority": False,
        }
        for key, value in expected.items():
            if receipt.get(key) != value:
                raise ValueError(f"KMEANS_RECEIPT_MISMATCH:{key}")
        initialization_receipt_checksum = hashlib.sha256(
            json.dumps(receipt, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        ).hexdigest()
        initialization_method = "checksum_verified_cuvs_kmeans_centroids"
    elif kmeans_artifact is not None:
        raise ValueError("SOM_INITIALIZATION_CONFLICT")
    else:
        raise ValueError(f"UNSUPPORTED_SOM_INITIALIZATION:{initialization}")
    initial_centroids_checksum = _checksum(seed_matrix)
    codebook = torch.as_tensor(seed_matrix, dtype=torch.float32, device=resolved_device).clone()

    row_coords = torch.arange(grid_rows, device=resolved_device, dtype=torch.float32)
    col_coords = torch.arange(grid_columns, device=resolved_device, dtype=torch.float32)
    grid_y, grid_x = torch.meshgrid(row_coords, col_coords, indexing="ij")
    grid = torch.stack((grid_y.reshape(-1), grid_x.reshape(-1)), dim=1)
    sigma_start = float(sigma if sigma is not None else max(grid_rows, grid_columns) / 2.0)
    grid_delta = grid[:, None, :] - grid[None, :, :]
    grid_distance = torch.sum(grid_delta * grid_delta, dim=2)

    with torch.inference_mode():
        for epoch in range(epochs):
            progress = epoch / max(epochs - 1, 1)
            lr = float(learning_rate * (1.0 - 0.9 * progress))
            current_sigma = max(float(sigma_start * (1.0 - 0.9 * progress)), 0.5)
            denom = 2.0 * current_sigma * current_sigma
            if update_rule == "online_v1":
                for ordinal in range(int(x.shape[0])):
                    sample = x[ordinal]
                    distances = torch.sum((codebook - sample) ** 2, dim=1)
                    bmu = int(torch.argmin(distances).item())
                    neighborhood = torch.exp(-grid_distance[bmu] / denom).reshape(-1, 1)
                    codebook += lr * neighborhood * (sample - codebook)
            else:
                bmus = _batch_bmus(x, codebook, assignment_batch_rows)
                counts = torch.bincount(bmus, minlength=unit_count).to(dtype=x.dtype)
                sums = torch.zeros_like(codebook)
                sums.index_add_(0, bmus, x)
                neighborhood = torch.exp(-grid_distance / denom)
                weighted_counts = torch.matmul(neighborhood, counts).reshape(-1, 1)
                weighted_sums = torch.matmul(neighborhood, sums)
                targets = weighted_sums / weighted_counts.clamp_min(torch.finfo(x.dtype).tiny)
                codebook += lr * (targets - codebook)

        bmus = _batch_bmus(x, codebook, assignment_batch_rows)
        squared_minima = []
        for start in range(0, int(x.shape[0]), assignment_batch_rows):
            batch = x[start : start + assignment_batch_rows]
            batch_codebook = codebook.index_select(0, bmus[start : start + assignment_batch_rows])
            squared_minima.append(torch.sum((batch - batch_codebook) ** 2, dim=1))
        quantization_error = torch.sqrt(torch.cat(squared_minima).clamp_min(0)).mean()
        coordinates = grid.index_select(0, bmus)

    coords_host = coordinates.detach().cpu().numpy().astype(np.float32, copy=False)
    codebook_host = codebook.detach().cpu().numpy().astype(np.float32, copy=False)
    receipt = SomReceipt(
        schema="atlas.som-receipt.v2",
        rows=int(source.shape[0]),
        dimensions=int(source.shape[1]),
        grid_rows=grid_rows,
        grid_columns=grid_columns,
        epochs=epochs,
        learning_rate_start=float(learning_rate),
        sigma_start=sigma_start,
        quantization_error=float(quantization_error.detach().cpu()),
        topology_checksum=_checksum(coords_host),
        codebook_checksum=_checksum(codebook_host),
        initialization_method=initialization_method,
        input_checksum=input_checksum,
        initial_centroids_checksum=initial_centroids_checksum,
        initialization_receipt_checksum=initialization_receipt_checksum,
        seed=int(seed),
        initialization_perturbation=float(initialization_perturbation),
        update_rule=update_rule,
        canonical_authority=False,
    )
    return coordinates, codebook, receipt


def aggregate_som_lattice(
    coordinates: Any,
    values: Sequence[Sequence[float]] | Sequence[float] | np.ndarray,
    *,
    grid_rows: int,
    grid_columns: int,
):
    """Aggregate row-aligned values onto a SOM lattice for cubic interpolation.

    Empty cells remain zero and are accompanied by a count lattice, so callers
    can distinguish a true zero value from no observations.
    """

    coords = np.asarray(coordinates.detach().cpu().numpy() if hasattr(coordinates, "detach") else coordinates, dtype=np.int64)
    source = np.asarray(values, dtype=np.float32)
    if coords.ndim != 2 or coords.shape[1] != 2:
        raise ValueError("coordinates must have shape [N,2]")
    if source.ndim == 1:
        source = source[:, None]
    if source.ndim != 2 or source.shape[0] != coords.shape[0]:
        raise ValueError("values must have shape [N] or [N,D] aligned with coordinates")
    if grid_rows <= 0 or grid_columns <= 0:
        raise ValueError("grid dimensions must be positive")
    if np.any(coords[:, 0] < 0) or np.any(coords[:, 0] >= grid_rows) or np.any(coords[:, 1] < 0) or np.any(coords[:, 1] >= grid_columns):
        raise ValueError("SOM coordinate outside lattice bounds")

    sums = np.zeros((grid_rows, grid_columns, source.shape[1]), dtype=np.float64)
    counts = np.zeros((grid_rows, grid_columns), dtype=np.int64)
    for ordinal, (row, column) in enumerate(coords.tolist()):
        sums[row, column] += source[ordinal].astype(np.float64)
        counts[row, column] += 1
    field = np.zeros_like(sums, dtype=np.float32)
    occupied = counts > 0
    field[occupied] = (sums[occupied] / counts[occupied, None]).astype(np.float32)
    if field.shape[-1] == 1:
        field = field[..., 0]

    receipt = SomLatticeReceipt(
        schema="atlas.som-lattice-receipt.v1",
        rows=int(source.shape[0]),
        grid_rows=grid_rows,
        grid_columns=grid_columns,
        value_dimensions=int(source.shape[1]),
        occupied_cells=int(np.count_nonzero(occupied)),
        occupancy_fraction=float(np.mean(occupied)),
        field_checksum=_checksum(field.astype(np.float32, copy=False)),
        count_checksum=_checksum(counts),
        canonical_authority=False,
    )
    return field, counts, receipt
