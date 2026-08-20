"""CPU reference helpers for Parent Atlas contextual feature planes.

These helpers are deliberately small and deterministic. They provide parity
oracles for bit packing, sparse binary support, 4-D/S3 coordinate checks and
context/prefill identity operations before cuTile/cuGraph/cuVS/cuML challengers
are admitted.
"""

from __future__ import annotations

from hashlib import sha256
import json
import math
from typing import Any, Iterable, Sequence

import numpy as np


def stable_checksum(value: Any) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def pack_binary_rows(rows: np.ndarray, *, bitorder: str = "little") -> tuple[np.ndarray, dict[str, Any]]:
    source = np.asarray(rows)
    if source.ndim != 2:
        raise ValueError("binary rows must be rank-2")
    if bitorder not in {"little", "big"}:
        raise ValueError("bitorder must be little or big")
    if not np.isin(source, [0, 1]).all():
        raise ValueError("binary rows must contain exact 0/1 values")
    logical = np.ascontiguousarray(source.astype(np.uint8))
    packed = np.packbits(logical, axis=1, bitorder=bitorder)
    receipt = {
        "schema": "atlas.binary-pack-receipt.v1",
        "rows": int(logical.shape[0]),
        "dimensions": int(logical.shape[1]),
        "packed_bytes_per_row": int(packed.shape[1]),
        "bitorder": bitorder,
        "logical_checksum": sha256(logical.tobytes()).hexdigest(),
        "transport_checksum": sha256(np.ascontiguousarray(packed).tobytes()).hexdigest(),
        "canonical_authority": False,
    }
    return packed, receipt


def unpack_binary_rows(packed: np.ndarray, *, dimensions: int, bitorder: str = "little") -> np.ndarray:
    source = np.asarray(packed, dtype=np.uint8)
    if source.ndim != 2 or dimensions <= 0:
        raise ValueError("packed rows must be rank-2 and dimensions positive")
    return np.unpackbits(source, axis=1, count=dimensions, bitorder=bitorder).astype(np.uint8)


def sparse_binary_csr(rows: np.ndarray) -> dict[str, Any]:
    source = np.asarray(rows)
    if source.ndim != 2 or not np.isin(source, [0, 1]).all():
        raise ValueError("CSR reference requires rank-2 exact binary matrix")
    indices: list[int] = []
    indptr = [0]
    for row in source.astype(np.uint8):
        indices.extend(int(index) for index in np.flatnonzero(row))
        indptr.append(len(indices))
    return {
        "shape": [int(source.shape[0]), int(source.shape[1])],
        "indptr": indptr,
        "indices": indices,
        "values": [1] * len(indices),
        "support_checksum": stable_checksum({"shape": list(source.shape), "indptr": indptr, "indices": indices}),
        "canonical_authority": False,
    }


def normalize_s3(rows: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Normalize non-zero R4 rows onto the unit 3-sphere S3.

    The result is a derived coordinate system (useful for quaternion/topology
    experiments); it never mutates source identity or claims rotational meaning
    unless the producer contract explicitly supplies that meaning.
    """
    source = np.asarray(rows, dtype=np.float64)
    if source.ndim != 2 or source.shape[1] != 4:
        raise ValueError("S3 reference requires shape [N,4]")
    norms = np.linalg.norm(source, axis=1)
    if np.any(norms == 0) or not np.isfinite(source).all():
        raise ValueError("S3 rows must be finite and non-zero")
    coordinates = source / norms[:, None]
    receipt = {
        "schema": "atlas.s3-normalization-receipt.v1",
        "rows": int(source.shape[0]),
        "ambient_dimension": 4,
        "intrinsic_dimension": 3,
        "max_unit_norm_error": float(np.max(np.abs(np.linalg.norm(coordinates, axis=1) - 1.0))),
        "coordinate_checksum": sha256(np.ascontiguousarray(coordinates).tobytes()).hexdigest(),
        "canonical_authority": False,
    }
    return coordinates, receipt


def chord_distance_s3(left: Sequence[float], right: Sequence[float]) -> float:
    a = np.asarray(left, dtype=np.float64)
    b = np.asarray(right, dtype=np.float64)
    if a.shape != (4,) or b.shape != (4,):
        raise ValueError("S3 chord distance requires two R4 vectors")
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    return float(np.linalg.norm(a - b))


def geodesic_distance_s3(left: Sequence[float], right: Sequence[float]) -> float:
    a = np.asarray(left, dtype=np.float64)
    b = np.asarray(right, dtype=np.float64)
    if a.shape != (4,) or b.shape != (4,):
        raise ValueError("S3 geodesic distance requires two R4 vectors")
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    dot = float(np.clip(np.dot(a, b), -1.0, 1.0))
    return float(math.acos(dot))


def polynomial_features(values: Sequence[float], *, degree: int = 2) -> np.ndarray:
    source = np.asarray(values, dtype=np.float64)
    if source.ndim != 1 or degree not in {1, 2}:
        raise ValueError("reference supports one row and degree 1 or 2")
    if degree == 1:
        return source.copy()
    output = list(float(value) for value in source)
    for i, left in enumerate(source):
        for right in source[i:]:
            output.append(float(left * right))
    return np.asarray(output, dtype=np.float64)


def deduplicate_context(items: Iterable[dict[str, Any]]) -> tuple[dict[str, Any], ...]:
    """Reference dedup by logical checksum or source coordinate."""
    exact: set[str] = set()
    coordinates: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        policy = item.get("repeat_policy", "DEDUP_EXACT")
        if policy == "ALLOW_DUPLICATE":
            result.append(item)
            continue
        if policy == "DEDUP_EXACT":
            key = str(item["logical_checksum"])
            if key in exact:
                continue
            exact.add(key)
            result.append(item)
            continue
        if policy != "DEDUP_SOURCE_COORDINATE":
            raise ValueError(f"unknown repeat policy: {policy}")
        key = stable_checksum({
            "source_ref": item.get("source_ref"),
            "source_revision": item.get("source_revision"),
            "tree_node_id": item.get("tree_node_id"),
            "logical_checksum": item.get("logical_checksum"),
        })
        if key in coordinates:
            continue
        coordinates.add(key)
        result.append(item)
    return tuple(result)
