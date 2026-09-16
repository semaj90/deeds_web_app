from __future__ import annotations

import json
from typing import Any, Mapping

import numpy as np

from .gpu_tile_cache import GpuTileCache


class UnifiedFeatureTileProvider:
    """Process-local provider for the shared unified-residency descriptor.

    The descriptor is the only cross-boundary value. Tensors remain owned by
    the existing GPU tile cache and are never returned in the receipt.
    """

    kind = "FEATURE_TILE"

    def __init__(self, max_bytes: int, device: str = "cuda") -> None:
        self.cache = GpuTileCache(max_bytes=max_bytes, device=device)

    def load(self, descriptor: Mapping[str, Any], host_matrix: np.ndarray) -> dict[str, Any]:
        if descriptor.get("kind") != self.kind:
            raise ValueError("UNIFIED_RESIDENCY_PROVIDER_KIND_MISMATCH")
        if descriptor.get("state") not in ("EMPTY", "EVICTED"):
            raise ValueError("UNIFIED_RESIDENCY_DESCRIPTOR_NOT_LOADABLE")
        key = descriptor.get("residencyKey")
        if not isinstance(key, str) or not key:
            raise ValueError("UNIFIED_RESIDENCY_KEY_REQUIRED")
        for field in (
            "workspaceRevision", "sourceRevision", "representationRevision",
            "featureRevision", "modelRevision", "tokenizerRevision",
            "ropeRevision", "artifactChecksum",
        ):
            if not isinstance(descriptor.get(field), str) or not descriptor[field].strip():
                raise ValueError(f"UNIFIED_RESIDENCY_{field.upper()}_REQUIRED")
        if not isinstance(descriptor.get("candidateOrdinal"), int) or descriptor["candidateOrdinal"] < 0:
            raise ValueError("UNIFIED_RESIDENCY_CANDIDATE_ORDINAL_INVALID")
        shape = descriptor.get("shape")
        if not isinstance(shape, list) or len(shape) != 2 or tuple(shape) != tuple(host_matrix.shape):
            raise ValueError("UNIFIED_RESIDENCY_SHAPE_MISMATCH")
        expected_bytes = int(descriptor.get("byteLength", -1))
        dtype = descriptor.get("dtype", "float32")
        if dtype == "float32":
            storage_dtype = np.float32
        else:
            raise ValueError("UNIFIED_RESIDENCY_DTYPE_UNSUPPORTED")
        matrix = np.ascontiguousarray(host_matrix, dtype=storage_dtype)
        if matrix.nbytes != expected_bytes:
            raise ValueError("UNIFIED_RESIDENCY_BYTE_LENGTH_MISMATCH")
        self.cache.promote(key, matrix)
        return {
            "schema": "atlas.unified-residency-provider-receipt.v1",
            "residencyKey": key,
            "kind": self.kind,
            "state": "RESIDENT",
            "byteLength": expected_bytes,
            "device": str(self.cache.device),
            "rawPointerExposed": False,
            "writesPerformed": False,
        }

    def load_control_envelope(self, control_json: str, host_matrix: np.ndarray) -> dict[str, Any]:
        """Parse descriptor control JSON; numeric values remain outside JSON."""
        try:
            descriptor = json.loads(control_json)
        except json.JSONDecodeError as exc:
            raise ValueError("UNIFIED_RESIDENCY_CONTROL_JSON_INVALID") from exc
        if not isinstance(descriptor, dict):
            raise ValueError("UNIFIED_RESIDENCY_CONTROL_ENVELOPE_INVALID")
        return self.load(descriptor, host_matrix)

    def load_control_buffer(self, control_json: str, numeric_buffer: bytes | bytearray | memoryview) -> dict[str, Any]:
        """Consume metadata JSON plus a separate little-endian Float32 buffer.

        This is the process-boundary shape for a future stdio/RPC adapter: JSON
        carries only the validated descriptor and the binary channel carries
        numeric data. The buffer is copied into a process-local NumPy view and
        is never returned or persisted in the receipt.
        """
        try:
            descriptor = json.loads(control_json)
        except json.JSONDecodeError as exc:
            raise ValueError("UNIFIED_RESIDENCY_CONTROL_JSON_INVALID") from exc
        if not isinstance(descriptor, dict):
            raise ValueError("UNIFIED_RESIDENCY_CONTROL_ENVELOPE_INVALID")
        if descriptor.get("dtype", "float32") != "float32":
            raise ValueError("UNIFIED_RESIDENCY_DTYPE_UNSUPPORTED")
        shape = descriptor.get("shape")
        if not isinstance(shape, list) or len(shape) != 2 or any(not isinstance(v, int) or v < 0 for v in shape):
            raise ValueError("UNIFIED_RESIDENCY_SHAPE_INVALID")
        raw = memoryview(numeric_buffer)
        if raw.nbytes % np.dtype(np.float32).itemsize != 0:
            raise ValueError("UNIFIED_RESIDENCY_TYPED_BUFFER_ALIGNMENT_INVALID")
        matrix = np.frombuffer(raw, dtype="<f4").copy().reshape(tuple(shape))
        return self.load(descriptor, matrix)
