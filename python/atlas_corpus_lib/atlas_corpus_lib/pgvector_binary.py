from __future__ import annotations

import math
import struct

PGVECTOR_768_DIM = 768
PGVECTOR_768_BINARY_BYTES = 4 + PGVECTOR_768_DIM * 4


def unpack_pgvector_binary_768(raw: bytes) -> list[float]:
    if not isinstance(raw, bytes) or len(raw) != PGVECTOR_768_BINARY_BYTES:
        raise ValueError("PGVECTOR_768_BINARY_LENGTH_INVALID")
    dimension, reserved = struct.unpack_from(">HH", raw)
    if dimension != PGVECTOR_768_DIM or reserved != 0:
        raise ValueError("PGVECTOR_768_BINARY_HEADER_INVALID")
    values = list(struct.unpack_from(">768f", raw, 4))
    if not all(math.isfinite(value) for value in values):
        raise ValueError("PGVECTOR_768_BINARY_NONFINITE_VALUE")
    return values
