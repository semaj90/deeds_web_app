"""Deterministic self-organizing-map reference for Parent Atlas.

SOM coordinates are derived topology/routing features. Canonical identity stays
external and is joined by frozen ordinal. Training order, initialization and
decay schedule are deterministic so CPU/GPU challengers can compare receipts.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Sequence

import numpy as np

from .determinism import configure_torch_determinism


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
):
    """Train a deterministic online SOM and return BMU coordinates + receipt."""

    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if grid_rows <= 0 or grid_columns <= 0 or epochs <= 0:
        raise ValueError("grid dimensions and epochs must be positive")
    if learning_rate <= 0:
        raise ValueError("learning_rate must be positive")

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    x = torch.as_tensor(source, dtype=torch.float32, device=resolved_device)
    unit_count = grid_rows * grid_columns
    initial_ordinals = _farthest_seed_ordinals(source, unit_count)
    codebook = torch.as_tensor(source[np.asarray(initial_ordinals)], dtype=torch.float32, device=resolved_device).clone()

    row_coords = torch.arange(grid_rows, device=resolved_device, dtype=torch.float32)
    col_coords = torch.arange(grid_columns, device=resolved_device, dtype=torch.float32)
    grid_y, grid_x = torch.meshgrid(row_coords, col_coords, indexing="ij")
    grid = torch.stack((grid_y.reshape(-1), grid_x.reshape(-1)), dim=1)
    sigma_start = float(sigma if sigma is not None else max(grid_rows, grid_columns) / 2.0)

    with torch.inference_mode():
        for epoch in range(epochs):
            progress = epoch / max(epochs - 1, 1)
            lr = float(learning_rate * (1.0 - 0.9 * progress))
            current_sigma = max(float(sigma_start * (1.0 - 0.9 * progress)), 0.5)
            denom = 2.0 * current_sigma * current_sigma
            for ordinal in range(int(x.shape[0])):
                sample = x[ordinal]
                distances = torch.sum((codebook - sample) ** 2, dim=1)
                bmu = int(torch.argmin(distances).item())
                grid_distance = torch.sum((grid - grid[bmu]) ** 2, dim=1)
                neighborhood = torch.exp(-grid_distance / denom).reshape(-1, 1)
                codebook += lr * neighborhood * (sample - codebook)

        squared = torch.sum((x[:, None, :] - codebook[None, :, :]) ** 2, dim=2)
        bmus = torch.argmin(squared, dim=1)
        quantization_error = torch.sqrt(torch.gather(squared, 1, bmus[:, None]).squeeze(1)).mean()
        coordinates = grid.index_select(0, bmus)

    coords_host = coordinates.detach().cpu().numpy().astype(np.float32, copy=False)
    codebook_host = codebook.detach().cpu().numpy().astype(np.float32, copy=False)
    receipt = SomReceipt(
        schema="atlas.som-receipt.v1",
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
