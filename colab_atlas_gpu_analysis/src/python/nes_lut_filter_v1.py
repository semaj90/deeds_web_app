"""Scalar reference (oracle) for NES LUT byte filtering (NLUT-07).

Given a frozen array of lutByte values and a small allow-list of bytes, emit a packed
match mask: bit i (LSB-first within each little-endian uint32 word) is 1 when lut[i] is
allowed. This is the oracle the AVX2 challenger in simd-bridge/cpp/nes_lut_filter.h must
match bit-for-bit. CPU only; no GPU claim.

Fail-closed: values outside 0..255, an empty or >16-entry allow-list, and duplicates raise.
0x00 (unresolved) is an ordinary byte here: it only matches if the caller allows it.
"""

from __future__ import annotations

from typing import Sequence

MAX_ALLOWED = 16


def _validate_allowed(allowed: Sequence[int]) -> list[int]:
    values = list(allowed)
    if not 1 <= len(values) <= MAX_ALLOWED:
        raise ValueError("NES_LUT_FILTER_ALLOWED_COUNT_INVALID")
    for v in values:
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 0xFF:
            raise ValueError("NES_LUT_FILTER_ALLOWED_BYTE_INVALID")
    if len(set(values)) != len(values):
        raise ValueError("NES_LUT_FILTER_ALLOWED_DUPLICATE")
    return values


def _validate_lut(lut: Sequence[int]) -> None:
    for v in lut:
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 0xFF:
            raise ValueError("NES_LUT_FILTER_LUT_BYTE_INVALID")


def match_mask_scalar(lut: Sequence[int], allowed: Sequence[int]) -> list[int]:
    """Return ceil(len(lut)/32) uint32 words; bit i set iff lut[i] is in allowed."""
    allowed_set = set(_validate_allowed(allowed))
    _validate_lut(lut)
    n = len(lut)
    words = [0] * ((n + 31) // 32)
    for i, value in enumerate(lut):
        if value in allowed_set:
            words[i >> 5] |= 1 << (i & 31)
    return words


def expected_mask_hex(lut: Sequence[int], allowed: Sequence[int]) -> list[str]:
    """Same mask as 8-hex-digit little-endian-word strings, for cross-language comparison."""
    return [f"{w:08x}" for w in match_mask_scalar(lut, allowed)]
