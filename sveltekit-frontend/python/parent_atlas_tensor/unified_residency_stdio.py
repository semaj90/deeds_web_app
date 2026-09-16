"""Length-framed local handoff for unified residency metadata and typed data.

Frame format: uint32-big-endian JSON length, JSON descriptor bytes,
uint64-big-endian numeric-buffer length, little-endian Float32 bytes. An
optional EXACT_COSINE_V1 descriptor operation appends a second uint64 length
and little-endian Float32 query buffer.
The process returns one JSON receipt and never serializes its tensor/cache.
"""

from __future__ import annotations

import hashlib
import json
import os
import struct
import sys

import numpy as np

from .unified_residency_provider import UnifiedFeatureTileProvider


def _read_exact(stream, size: int) -> bytes:
    value = stream.read(size)
    if value is None or len(value) != size:
        raise ValueError("UNIFIED_RESIDENCY_FRAME_TRUNCATED")
    return value


def serve_one(stream_in, stream_out, *, device: str = "cpu", max_bytes: int = 256 * 1024 * 1024) -> None:
    header = stream_in.read(4)
    if not header:
        return
    if len(header) != 4:
        raise ValueError("UNIFIED_RESIDENCY_FRAME_TRUNCATED")
    control_size = struct.unpack(">I", header)[0]
    if control_size <= 0 or control_size > 1024 * 1024:
        raise ValueError("UNIFIED_RESIDENCY_CONTROL_SIZE_INVALID")
    control = _read_exact(stream_in, control_size).decode("utf-8")
    buffer_size = struct.unpack(">Q", _read_exact(stream_in, 8))[0]
    if buffer_size > max_bytes:
        raise ValueError("UNIFIED_RESIDENCY_TYPED_BUFFER_TOO_LARGE")
    numeric_buffer = _read_exact(stream_in, buffer_size)
    provider = UnifiedFeatureTileProvider(max_bytes=max_bytes, device=device)
    receipt = provider.load_control_buffer(control, numeric_buffer)
    descriptor = json.loads(control)
    if descriptor.get("operation") == "EXACT_COSINE_V1":
        query_size = struct.unpack(">Q", _read_exact(stream_in, 8))[0]
        if query_size > max_bytes:
            raise ValueError("UNIFIED_RESIDENCY_QUERY_BUFFER_TOO_LARGE")
        query_buffer = _read_exact(stream_in, query_size)
        if query_size % np.dtype(np.float32).itemsize != 0:
            raise ValueError("UNIFIED_RESIDENCY_QUERY_BUFFER_ALIGNMENT_INVALID")
        query = np.frombuffer(memoryview(query_buffer), dtype="<f4").copy()
        query_shape = descriptor.get("queryShape")
        if query_shape is not None and query_shape != [int(query.size)]:
            raise ValueError("UNIFIED_RESIDENCY_QUERY_SHAPE_MISMATCH")
        k = descriptor.get("topK", 1)
        if not isinstance(k, int) or k <= 0:
            raise ValueError("UNIFIED_RESIDENCY_TOPK_INVALID")
        indices, scores = provider.cache.exact_cosine(descriptor["residencyKey"], query, k)
        result = {
            "indices": indices.astype(np.int64).tolist(),
            "scores": np.asarray(scores, dtype=np.float32).round(6).tolist(),
        }
        receipt = {
            **receipt,
            "operation": "EXACT_COSINE_V1",
            "topK": min(k, int(np.asarray(scores).size)),
            "resultChecksum": hashlib.sha256(
                json.dumps(result, separators=(",", ":"), sort_keys=True).encode("utf-8")
            ).hexdigest(),
            **result,
        }
    stream_out.write((json.dumps(receipt, separators=(",", ":")) + "\n").encode("utf-8"))
    stream_out.flush()


def main() -> int:
    try:
        device = os.environ.get("ATLAS_UNIFIED_RESIDENCY_DEVICE", "cpu")
        max_bytes = int(os.environ.get("ATLAS_UNIFIED_RESIDENCY_MAX_BYTES", str(256 * 1024 * 1024)))
        serve_one(sys.stdin.buffer, sys.stdout.buffer, device=device, max_bytes=max_bytes)
    except Exception as exc:  # keep the transport response machine-readable
        sys.stdout.write(json.dumps({
            "schema": "atlas.unified-residency-provider-receipt.v1",
            "state": "FAILED",
            "error": str(exc),
            "writesPerformed": False,
            "rawPointerExposed": False,
        }, separators=(",", ":")) + "\n")
        sys.stdout.flush()
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
