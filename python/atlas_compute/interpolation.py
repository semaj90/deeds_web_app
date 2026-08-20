"""Deterministic tensor-product cubic interpolation for Atlas topology fields.

This is a derived routing/visualization primitive, never a retrieval lane and
never canonical evidence. It intentionally avoids torch.grid_sample so the
reference does not inherit CUDA backward nondeterminism from that operator.

For D spatial dimensions, cubic interpolation inspects at most 4**D lattice
samples (bicubic=16, tricubic=64, quadcubic=256).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import itertools
from typing import Any, Sequence

import numpy as np

from .determinism import configure_torch_determinism


@dataclass(frozen=True)
class TensorInterpolationReceipt:
    schema: str
    spatial_dimensions: int
    method: str
    coordinate_count: int
    maximum_samples_per_coordinate: int
    boundary_mode: str
    device: str
    output_shape: list[int]
    output_checksum: str
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _cubic_weights(torch: Any, t: Any) -> Any:
    """Catmull-Rom cubic convolution weights (a=-0.5) for offsets -1..2."""
    t2 = t * t
    t3 = t2 * t
    return torch.stack((
        -0.5 * t + t2 - 0.5 * t3,
        1.0 - 2.5 * t2 + 1.5 * t3,
        0.5 * t + 2.0 * t2 - 1.5 * t3,
        -0.5 * t2 + 0.5 * t3,
    ))


def interpolate_topology_field(
    field: Any,
    coordinates: Sequence[Sequence[float]] | np.ndarray,
    *,
    spatial_dimensions: int,
    device: str | None = None,
    seed: int = 0xA71A5,
):
    """Interpolate scalar or vector-valued 2D/3D/4D lattice fields.

    Field shape is ``[D0,...,D{n-1}]`` for scalar values or
    ``[D0,...,D{n-1},C]`` for C output channels. Coordinates are expressed in
    lattice-index units and clamped at field boundaries.

    Returns ``(output_tensor, TensorInterpolationReceipt)``.
    """

    import torch

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    if spatial_dimensions not in (2, 3, 4):
        raise ValueError("spatial_dimensions must be 2, 3, or 4")

    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    values = torch.as_tensor(field, dtype=torch.float32, device=resolved_device)
    coords = torch.as_tensor(np.asarray(coordinates, dtype=np.float32), dtype=torch.float32, device=resolved_device)

    if values.ndim not in (spatial_dimensions, spatial_dimensions + 1):
        raise ValueError("field rank must equal spatial_dimensions or spatial_dimensions+1 channels")
    if coords.ndim != 2 or coords.shape[1] != spatial_dimensions:
        raise ValueError(f"coordinates must have shape [N,{spatial_dimensions}]")
    if any(int(values.shape[axis]) <= 0 for axis in range(spatial_dimensions)):
        raise ValueError("all spatial field dimensions must be non-empty")

    has_channels = values.ndim == spatial_dimensions + 1
    output_channels = int(values.shape[-1]) if has_channels else 1
    outputs: list[Any] = []

    with torch.inference_mode():
        for point in coords:
            axis_indices: list[Any] = []
            axis_weights: list[Any] = []
            for axis in range(spatial_dimensions):
                coordinate = point[axis]
                base = torch.floor(coordinate).to(torch.int64)
                fraction = coordinate - base.to(torch.float32)
                indices = torch.stack((base - 1, base, base + 1, base + 2))
                indices = indices.clamp(0, int(values.shape[axis]) - 1)
                axis_indices.append(indices)
                axis_weights.append(_cubic_weights(torch, fraction))

            result = torch.zeros(output_channels, dtype=torch.float32, device=resolved_device)
            for offsets in itertools.product(range(4), repeat=spatial_dimensions):
                index_tuple = tuple(axis_indices[axis][offsets[axis]] for axis in range(spatial_dimensions))
                weight = torch.ones((), dtype=torch.float32, device=resolved_device)
                for axis in range(spatial_dimensions):
                    weight = weight * axis_weights[axis][offsets[axis]]
                sample = values[index_tuple]
                if not has_channels:
                    sample = sample.reshape(1)
                result = result + weight * sample
            outputs.append(result)

    output = torch.stack(outputs, dim=0)
    if not has_channels:
        output = output[:, 0]

    host = output.detach().cpu().numpy().astype(np.float32, copy=False)
    checksum = hashlib.sha256(np.ascontiguousarray(host).tobytes()).hexdigest()
    receipt = TensorInterpolationReceipt(
        schema="atlas.tensor-interpolation-receipt.v1",
        spatial_dimensions=spatial_dimensions,
        method="catmull_rom_tensor_product_cubic",
        coordinate_count=int(coords.shape[0]),
        maximum_samples_per_coordinate=4 ** spatial_dimensions,
        boundary_mode="clamp",
        device=resolved_device,
        output_shape=[int(value) for value in output.shape],
        output_checksum=checksum,
        canonical_authority=False,
    )
    return output, receipt
