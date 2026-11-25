"""Packed bit, nibble, and sliding-window contract (`PackedFeatureBlockV1` / `PFB1`).

Prevents feature bleed, word-boundary ambiguity, accidental width extension,
and cross-language shift divergence between Python, C++/CUDA, PG18 bytea, and TypeScript.
"""

from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

PFB1_MAGIC = b"PFB1"
PFB1_SCHEMA_VERSION = 1
BIT_ORDER_LSB0 = 0
NIBBLE_ORDER_LOW_THEN_HIGH = 0
INTEGER_ENDIAN_LITTLE = 0

# <4s I I I I B B B B Q Q 32s 32s  -> 4 + 16 + 4 + 16 + 64 = 104 bytes
PFB1_HEADER_STRUCT = struct.Struct("<4sIIIIBBBBQQ32s32s")
PFB1_HEADER_BYTES = PFB1_HEADER_STRUCT.size  # 104
VALID_ROTATION_WIDTHS = frozenset({8, 16, 32, 64})


@dataclass(frozen=True)
class FeatureMapEntryV1:
    ordinal: int
    key: str


@dataclass(frozen=True)
class FeatureMapSchemaV1:
    feature_map_revision: int
    features: tuple[FeatureMapEntryV1, ...]
    digest: str


def build_feature_map_schema_v1(
    *,
    feature_map_revision: int,
    features: Sequence[Mapping[str, Any]],
) -> FeatureMapSchemaV1:
    """Build a canonical, deterministic FeatureMapSchemaV1 (never runtime insertion order)."""
    if feature_map_revision <= 0:
        raise ValueError("FEATURE_MAP_REVISION_MUST_BE_POSITIVE")
    if not features:
        raise ValueError("FEATURE_MAP_EMPTY")

    entries = sorted(
        (FeatureMapEntryV1(ordinal=int(f["ordinal"]), key=str(f["key"]).strip()) for f in features),
        key=lambda e: e.ordinal,
    )
    for expected_ord, entry in enumerate(entries):
        if entry.ordinal != expected_ord:
            raise ValueError(f"FEATURE_MAP_NON_DENSE_ORDINAL:{entry.ordinal}!=expected:{expected_ord}")
        if not entry.key:
            raise ValueError(f"FEATURE_MAP_EMPTY_KEY:ordinal={expected_ord}")

    canonical = {
        "feature_map_revision": int(feature_map_revision),
        "features": [{"ordinal": e.ordinal, "key": e.key} for e in entries],
    }
    digest = hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    return FeatureMapSchemaV1(
        feature_map_revision=int(feature_map_revision),
        features=tuple(entries),
        digest=digest,
    )


def pack_bits_lsb0_v1(bits: Sequence[int | bool]) -> bytes:
    """Pack logical bits into LSB0 bytes with guaranteed zeroed unused tail bits."""
    logical_count = len(bits)
    out = bytearray((logical_count + 7) // 8)
    for i, bit in enumerate(bits):
        val = 1 if bit else 0
        if val:
            out[i >> 3] |= 1 << (i & 7)
    return bytes(out)


def unpack_bit_lsb0_v1(buf: bytes, index: int, logical_count: int) -> int:
    """Read a single logical bit bounded by `logical_count`."""
    if not 0 <= index < logical_count:
        raise IndexError(f"BIT_INDEX_OUT_OF_RANGE:{index}")
    return (buf[index >> 3] >> (index & 7)) & 1


def assert_unused_tail_bits_zero_v1(buf: bytes, logical_count: int) -> None:
    """Reject non-zero padding bits beyond `logical_count`."""
    expected_bytes = (logical_count + 7) // 8
    if len(buf) != expected_bytes:
        raise ValueError(f"BIT_BYTE_LENGTH_MISMATCH:{len(buf)}!={expected_bytes}")
    rem = logical_count & 7
    if rem != 0 and buf:
        unused_mask = (~((1 << rem) - 1)) & 0xFF
        if (buf[-1] & unused_mask) != 0:
            raise ValueError("UNUSED_TAIL_BITS_NON_ZERO")


def pack_nibbles_v1(values: Sequence[int]) -> bytes:
    """Pack 4-bit nibbles (element 0 in low nibble, element 1 in high nibble)."""
    out = bytearray((len(values) + 1) // 2)
    for i, v in enumerate(values):
        if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 0xF:
            raise ValueError(f"NIBBLE_OUT_OF_RANGE:{v}")
        j = i >> 1
        shift = 4 if (i & 1) else 0
        out[j] |= v << shift
    return bytes(out)


def unpack_nibble_v1(buf: bytes, i: int, logical_count: int) -> int:
    """Read a single 4-bit nibble bounded by `logical_count`."""
    if not 0 <= i < logical_count:
        raise IndexError(f"NIBBLE_INDEX_OUT_OF_RANGE:{i}")
    b = buf[i >> 1]
    return (b >> (4 if (i & 1) else 0)) & 0xF


def assert_unused_high_nibble_zero_v1(buf: bytes, logical_count: int) -> None:
    """Reject non-zero high nibble when `logical_count` is odd."""
    expected_bytes = (logical_count + 1) // 2
    if len(buf) != expected_bytes:
        raise ValueError(f"NIBBLE_BYTE_LENGTH_MISMATCH:{len(buf)}!={expected_bytes}")
    if (logical_count & 1) == 1 and buf:
        if (buf[-1] >> 4) != 0:
            raise ValueError("UNUSED_FINAL_HIGH_NIBBLE_NON_ZERO")


def rotl_w_v1(x: int, r: int, width: int) -> int:
    """Exact w-bit left rotation for w in {8, 16, 32, 64}."""
    if width not in VALID_ROTATION_WIDTHS:
        raise ValueError(f"ROTATION_WIDTH_UNSUPPORTED:{width}")
    mask = (1 << width) - 1
    x_masked = x & mask
    shift = r % width
    if shift == 0:
        return x_masked
    return ((x_masked << shift) | (x_masked >> (width - shift))) & mask


def read_bit_window_v1(buf: bytes, *, start: int, length: int, logical_count: int) -> list[int]:
    """Read a logical bit sliding window [start, start + length) spanning arbitrary byte boundaries."""
    if start < 0 or length < 0 or start + length > logical_count:
        raise ValueError(f"BIT_WINDOW_OUT_OF_BOUNDS:start={start}:len={length}:logical={logical_count}")
    return [unpack_bit_lsb0_v1(buf, i, logical_count) for i in range(start, start + length)]


def read_nibble_window_v1(buf: bytes, *, start: int, length: int, logical_count: int) -> list[int]:
    """Read a logical nibble sliding window [start, start + length) spanning arbitrary byte boundaries."""
    if start < 0 or length < 0 or start + length > logical_count:
        raise ValueError(f"NIBBLE_WINDOW_OUT_OF_BOUNDS:start={start}:len={length}:logical={logical_count}")
    return [unpack_nibble_v1(buf, i, logical_count) for i in range(start, start + length)]


@dataclass(frozen=True)
class PackedFeatureBlockV1:
    feature_map_rev: int
    candidate_count: int
    feature_count: int
    logical_bit_count: int
    nibble_count: int
    mask_bytes: bytes
    nibble_bytes: bytes
    mask_sha256: bytes
    nibble_sha256: bytes


def encode_packed_feature_block_v1(
    *,
    feature_map_rev: int,
    candidate_count: int,
    feature_count: int,
    bits: Sequence[int | bool],
    nibbles: Sequence[int],
) -> bytes:
    """Serialize a canonical `PFB1` block with strict capacity and zero-padding invariants."""
    capacity = candidate_count * feature_count
    logical_bit_count = len(bits)
    nibble_count = len(nibbles)
    if logical_bit_count > capacity or nibble_count > capacity:
        raise ValueError("LOGICAL_COUNT_EXCEEDS_CAPACITY")

    mask_bytes = pack_bits_lsb0_v1(bits)
    nibble_bytes = pack_nibbles_v1(nibbles)
    assert_unused_tail_bits_zero_v1(mask_bytes, logical_bit_count)
    assert_unused_high_nibble_zero_v1(nibble_bytes, nibble_count)

    mask_sha256 = hashlib.sha256(mask_bytes).digest()
    nibble_sha256 = hashlib.sha256(nibble_bytes).digest()

    header = PFB1_HEADER_STRUCT.pack(
        PFB1_MAGIC,
        PFB1_SCHEMA_VERSION,
        int(feature_map_rev),
        int(candidate_count),
        int(feature_count),
        BIT_ORDER_LSB0,
        NIBBLE_ORDER_LOW_THEN_HIGH,
        INTEGER_ENDIAN_LITTLE,
        0,
        logical_bit_count,
        nibble_count,
        mask_sha256,
        nibble_sha256,
    )
    return header + mask_bytes + nibble_bytes


def decode_packed_feature_block_v1(
    blob: bytes,
    *,
    expected_feature_map_rev: int | None = None,
) -> PackedFeatureBlockV1:
    """Decode and validate a `PFB1` block, failing closed on any invariant violation."""
    if len(blob) < PFB1_HEADER_BYTES:
        raise ValueError("PFB1_HEADER_TRUNCATED")

    (
        magic,
        schema_version,
        feature_map_rev,
        candidate_count,
        feature_count,
        bit_order,
        nibble_order,
        integer_endian,
        _reserved,
        logical_bit_count,
        nibble_count,
        mask_sha256,
        nibble_sha256,
    ) = PFB1_HEADER_STRUCT.unpack(blob[:PFB1_HEADER_BYTES])

    if magic != PFB1_MAGIC or schema_version != PFB1_SCHEMA_VERSION:
        raise ValueError("PFB1_INVALID_MAGIC_OR_VERSION")
    if bit_order != BIT_ORDER_LSB0 or nibble_order != NIBBLE_ORDER_LOW_THEN_HIGH or integer_endian != INTEGER_ENDIAN_LITTLE:
        raise ValueError("PFB1_UNSUPPORTED_ENCODING_FLAGS")
    if expected_feature_map_rev is not None and feature_map_rev != expected_feature_map_rev:
        raise ValueError(f"PFB1_FEATURE_MAP_REV_MISMATCH:{feature_map_rev}!={expected_feature_map_rev}")

    capacity = candidate_count * feature_count
    if logical_bit_count > capacity or nibble_count > capacity:
        raise ValueError("PFB1_LOGICAL_COUNT_EXCEEDS_CAPACITY")

    bit_bytes_len = (logical_bit_count + 7) // 8
    nibble_bytes_len = (nibble_count + 1) // 2
    expected_total = PFB1_HEADER_BYTES + bit_bytes_len + nibble_bytes_len
    if len(blob) != expected_total:
        raise ValueError(f"PFB1_PAYLOAD_LENGTH_MISMATCH:{len(blob)}!={expected_total}")

    mask_bytes = blob[PFB1_HEADER_BYTES : PFB1_HEADER_BYTES + bit_bytes_len]
    nibble_bytes = blob[PFB1_HEADER_BYTES + bit_bytes_len :]

    assert_unused_tail_bits_zero_v1(mask_bytes, logical_bit_count)
    assert_unused_high_nibble_zero_v1(nibble_bytes, nibble_count)

    if hashlib.sha256(mask_bytes).digest() != mask_sha256:
        raise ValueError("PFB1_MASK_SHA256_MISMATCH")
    if hashlib.sha256(nibble_bytes).digest() != nibble_sha256:
        raise ValueError("PFB1_NIBBLE_SHA256_MISMATCH")

    return PackedFeatureBlockV1(
        feature_map_rev=feature_map_rev,
        candidate_count=candidate_count,
        feature_count=feature_count,
        logical_bit_count=logical_bit_count,
        nibble_count=nibble_count,
        mask_bytes=mask_bytes,
        nibble_bytes=nibble_bytes,
        mask_sha256=mask_sha256,
        nibble_sha256=nibble_sha256,
    )
