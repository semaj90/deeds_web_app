#!/usr/bin/env python3
"""
scripts/atlas/c_abi_byte_synth_bridge.py

Pure C-ABI Zero-Dependency Byte Synthesizer Bridge:
- Wraps simd-bridge/cpp/atlas_byte_synth.dll / libatlas_byte_synth.so via ctypes.
- Zero dependency on libtorch / PyTorch C++ ABI.
- Supports both strict Native C-ABI mode (require_native=True) and
  reference pure-Python fallback mode.
- Implements:
  1. atlas_morton_permutation_v2: Non-destructive 4-pass 8-bit LSD radix sort permutation.
  2. atlas_radix_sort_v2_records: Stable 64-byte record radix sort.
  3. atlas_synthesize_lsb0_bitset: LSB0 bitset occupancy synthesizer.
  4. atlas_encode_ulid128 & atlas_decode_ulid128: Canonical 128-bit Crockford ULID.
  5. Fast Hex, general Crockford Base32, and Base64 wire encoders.
"""

from __future__ import annotations

import base64
import ctypes
import os
import struct
from pathlib import Path
from typing import List, Optional, Tuple

RECORD_FORMAT_V2 = "<IIH2x3fd8f"
RECORD_SIZE_V2 = 64

# Crockford Base32 character set
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


class AtlasLowRankRecordV2(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("morton_code", ctypes.c_uint32),
        ("task_ordinal", ctypes.c_uint32),
        ("cluster_id", ctypes.c_uint16),
        ("reserved_zero", ctypes.c_uint16),
        ("position", ctypes.c_float * 3),
        ("final_score", ctypes.c_double),
        ("features", ctypes.c_float * 8),
    ]


assert ctypes.sizeof(AtlasLowRankRecordV2) == RECORD_SIZE_V2, "AtlasLowRankRecordV2 size must be 64 bytes"


def find_native_byte_synth_lib() -> Optional[Path]:
    """Finds the compiled atlas_byte_synth shared library or DLL."""
    root = Path(__file__).resolve().parents[2]
    candidates = [
        root / "simd-bridge" / "cpp" / "atlas_byte_synth.dll",
        root / "simd-bridge" / "build" / "Release" / "atlas_byte_synth.dll",
        root / "simd-bridge" / "build" / "atlas_byte_synth.dll",
        root / "simd-bridge" / "build" / "libatlas_byte_synth.so",
        root / "build" / "Release" / "atlas_byte_synth.dll",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


class AtlasByteSynthBridge:
    def __init__(self, lib_path: Optional[Path] = None, require_native: bool = False):
        self.lib_path = lib_path or find_native_byte_synth_lib()
        self._lib = None
        self._abi_version = 0

        if self.lib_path and self.lib_path.is_file():
            try:
                lib = ctypes.CDLL(str(self.lib_path))
                # atlas_byte_synth_abi_version
                lib.atlas_byte_synth_abi_version.argtypes = []
                lib.atlas_byte_synth_abi_version.restype = ctypes.c_uint32

                # atlas_morton_permutation_v2
                lib.atlas_morton_permutation_v2.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.POINTER(ctypes.c_uint32),
                    ctypes.c_size_t,
                ]
                lib.atlas_morton_permutation_v2.restype = ctypes.c_int

                # atlas_radix_sort_v2_records
                lib.atlas_radix_sort_v2_records.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.c_size_t,
                ]
                lib.atlas_radix_sort_v2_records.restype = ctypes.c_int

                # atlas_synthesize_lsb0_bitset
                lib.atlas_synthesize_lsb0_bitset.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.c_double,
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.POINTER(ctypes.c_size_t),
                ]
                lib.atlas_synthesize_lsb0_bitset.restype = ctypes.c_int

                # atlas_encode_hex
                lib.atlas_encode_hex.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.c_char_p,
                    ctypes.c_size_t,
                ]
                lib.atlas_encode_hex.restype = ctypes.c_int

                # atlas_encode_crockford_base32
                lib.atlas_encode_crockford_base32.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.c_char_p,
                    ctypes.c_size_t,
                    ctypes.POINTER(ctypes.c_size_t),
                ]
                lib.atlas_encode_crockford_base32.restype = ctypes.c_int

                # atlas_encode_ulid128
                lib.atlas_encode_ulid128.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_char_p,
                ]
                lib.atlas_encode_ulid128.restype = ctypes.c_int

                # atlas_decode_ulid128
                lib.atlas_decode_ulid128.argtypes = [
                    ctypes.c_char_p,
                    ctypes.c_void_p,
                ]
                lib.atlas_decode_ulid128.restype = ctypes.c_int

                # atlas_encode_base64
                lib.atlas_encode_base64.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.c_char_p,
                    ctypes.c_size_t,
                    ctypes.POINTER(ctypes.c_size_t),
                ]
                lib.atlas_encode_base64.restype = ctypes.c_int

                self._lib = lib
                self._abi_version = lib.atlas_byte_synth_abi_version()
            except Exception as e:
                self._lib = None
                if require_native:
                    raise RuntimeError(f"Failed to load native atlas_byte_synth DLL at {self.lib_path}: {e}")

        if require_native and self._lib is None:
            raise RuntimeError(f"Native atlas_byte_synth DLL required, but not found or failed to load from {self.lib_path}")

    @property
    def has_native(self) -> bool:
        return self._lib is not None

    @property
    def abi_version(self) -> int:
        return self._abi_version

    def morton_permutation(self, record_bytes: bytes) -> List[int]:
        """
        Generates Morton permutation indices WITHOUT reordering records in place.
        Returns list of original indices ordered by ascending morton_code.
        Preserves stable tie order.
        """
        count = len(record_bytes) // RECORD_SIZE_V2
        if count == 0:
            return []
        if len(record_bytes) % RECORD_SIZE_V2 != 0:
            raise ValueError(f"Buffer size {len(record_bytes)} not a multiple of 64")

        if self._lib is not None:
            out_perm = (ctypes.c_uint32 * count)()
            in_ptr = ctypes.cast(record_bytes, ctypes.c_void_p)
            status = self._lib.atlas_morton_permutation_v2(in_ptr, count, out_perm, count)
            if status != 0:
                raise RuntimeError(f"atlas_morton_permutation_v2 failed with status {status}")
            return list(out_perm)

        # Pure Python fallback: stable sort on morton_code (offset 0..3)
        indices = list(range(count))
        indices.sort(key=lambda idx: struct.unpack_from("<I", record_bytes, idx * RECORD_SIZE_V2)[0])
        return indices

    def radix_sort_records(self, record_bytes: bytes) -> bytes:
        """Sorts complete contiguous 64-byte records by morton_code in O(N) linear time."""
        count = len(record_bytes) // RECORD_SIZE_V2
        if count == 0:
            return b""
        if len(record_bytes) % RECORD_SIZE_V2 != 0:
            raise ValueError(f"Buffer size {len(record_bytes)} not a multiple of 64")

        if self._lib is not None:
            out_buf = bytearray(len(record_bytes))
            in_ptr = ctypes.cast(record_bytes, ctypes.c_void_p)
            out_ptr = (ctypes.c_char * len(out_buf)).from_buffer(out_buf)
            status = self._lib.atlas_radix_sort_v2_records(in_ptr, ctypes.byref(out_ptr), count, count)
            if status != 0:
                raise RuntimeError(f"atlas_radix_sort_v2_records failed with status {status}")
            return bytes(out_buf)

        # Pure Python fallback
        chunks = [record_bytes[i * RECORD_SIZE_V2 : (i + 1) * RECORD_SIZE_V2] for i in range(count)]
        chunks.sort(key=lambda c: struct.unpack_from("<I", c, 0)[0])
        return b"".join(chunks)

    def synthesize_lsb0_bitset(self, record_bytes: bytes, threshold: float = 0.5) -> Tuple[bytes, int]:
        """Synthesizes LSB0 bitset from record final_scores."""
        count = len(record_bytes) // RECORD_SIZE_V2
        if count == 0:
            return b"", 0
        bitset_len = (count + 7) >> 3
        out_bytes = bytearray(bitset_len)

        if self._lib is not None:
            in_ptr = ctypes.cast(record_bytes, ctypes.c_void_p)
            out_ptr = (ctypes.c_char * len(out_bytes)).from_buffer(out_bytes)
            bits_set = ctypes.c_size_t(0)
            status = self._lib.atlas_synthesize_lsb0_bitset(
                in_ptr, count, threshold, ctypes.byref(out_ptr), bitset_len, ctypes.byref(bits_set)
            )
            if status != 0:
                raise RuntimeError(f"atlas_synthesize_lsb0_bitset failed with status {status}")
            return bytes(out_bytes), bits_set.value

        # Pure Python fallback
        bits_count = 0
        for i in range(count):
            score = struct.unpack_from("<d", record_bytes, i * RECORD_SIZE_V2 + 24)[0]
            if score > threshold:
                out_bytes[i >> 3] |= (1 << (i & 7))
                bits_count += 1
        return bytes(out_bytes), bits_count

    def encode_hex(self, src: bytes) -> str:
        """Fast lowercase hex encoding."""
        if self._lib is not None:
            out_len = len(src) * 2
            out_buf = ctypes.create_string_buffer(out_len)
            in_ptr = ctypes.cast(src, ctypes.c_void_p)
            status = self._lib.atlas_encode_hex(in_ptr, len(src), out_buf, out_len)
            if status != 0:
                raise RuntimeError(f"atlas_encode_hex failed with status {status}")
            return out_buf.value.decode("ascii")
        return src.hex()

    def encode_crockford_base32(self, src: bytes) -> str:
        """Arbitrary-length Crockford Base32 encoding."""
        if self._lib is not None:
            max_out = (len(src) * 8 + 4) // 5 + 1
            out_buf = ctypes.create_string_buffer(max_out)
            in_ptr = ctypes.cast(src, ctypes.c_void_p)
            written = ctypes.c_size_t(0)
            status = self._lib.atlas_encode_crockford_base32(in_ptr, len(src), out_buf, max_out, ctypes.byref(written))
            if status != 0:
                raise RuntimeError(f"atlas_encode_crockford_base32 failed with status {status}")
            return out_buf.raw[:written.value].decode("ascii")

        # Python fallback
        buffer = 0
        bits_left = 0
        out_chars = []
        for byte in src:
            buffer = (buffer << 8) | byte
            bits_left += 8
            while bits_left >= 5:
                out_chars.append(CROCKFORD_ALPHABET[(buffer >> (bits_left - 5)) & 0x1F])
                bits_left -= 5
        if bits_left > 0:
            out_chars.append(CROCKFORD_ALPHABET[(buffer << (5 - bits_left)) & 0x1F])
        return "".join(out_chars)

    def encode_ulid128(self, src_16b: bytes) -> str:
        """
        Encodes exactly 16 bytes (128 bits) into a canonical 26-character ULID string.
        First character is strictly in '0'..'7'.
        16 bytes of 0xFF -> "7ZZZZZZZZZZZZZZZZZZZZZZZZZ"
        16 bytes of 0x00 -> "00000000000000000000000000"
        """
        if len(src_16b) != 16:
            raise ValueError(f"ULID source must be exactly 16 bytes, got {len(src_16b)}")

        if self._lib is not None:
            out_buf = ctypes.create_string_buffer(26)
            in_ptr = ctypes.cast(src_16b, ctypes.c_void_p)
            status = self._lib.atlas_encode_ulid128(in_ptr, out_buf)
            if status != 0:
                raise RuntimeError(f"atlas_encode_ulid128 failed with status {status}")
            return out_buf.raw[:26].decode("ascii")

        # Python fallback: 130-bit field with 2 leading zeros
        val = int.from_bytes(src_16b, byteorder="big")
        chars = []
        for i in range(25, -1, -1):
            chars.append(CROCKFORD_ALPHABET[(val >> (i * 5)) & 0x1F])
        return "".join(chars)

    def decode_ulid128(self, ulid_str: str) -> bytes:
        """Decodes canonical 26-character ULID string into 16 bytes (128 bits)."""
        if len(ulid_str) != 26:
            raise ValueError(f"ULID string must be exactly 26 characters, got {len(ulid_str)}")

        if self._lib is not None:
            out_buf = ctypes.create_string_buffer(16)
            c_str = ulid_str.encode("ascii")
            status = self._lib.atlas_decode_ulid128(c_str, out_buf)
            if status != 0:
                raise ValueError(f"atlas_decode_ulid128 failed with status {status} for '{ulid_str}'")
            return out_buf.raw[:16]

        # Python fallback
        crockford_map = {
            "O": 0, "o": 0,
            "I": 1, "i": 1, "L": 1, "l": 1,
        }
        for idx, char in enumerate(CROCKFORD_ALPHABET):
            crockford_map[char] = idx
            crockford_map[char.lower()] = idx

        if crockford_map.get(ulid_str[0], 99) > 7:
            raise ValueError(f"First character of ULID must be 0-7, got '{ulid_str[0]}'")

        val = 0
        for char in ulid_str:
            if char not in crockford_map:
                raise ValueError(f"Invalid Crockford character '{char}'")
            val = (val << 5) | crockford_map[char]

        return val.to_bytes(16, byteorder="big")

    def encode_base64(self, src: bytes) -> str:
        """RFC 4648 Base64 encoding with '=' padding."""
        if self._lib is not None:
            max_out = ((len(src) + 2) // 3) * 4 + 4
            out_buf = ctypes.create_string_buffer(max_out)
            in_ptr = ctypes.cast(src, ctypes.c_void_p)
            written = ctypes.c_size_t(0)
            status = self._lib.atlas_encode_base64(in_ptr, len(src), out_buf, max_out, ctypes.byref(written))
            if status != 0:
                raise RuntimeError(f"atlas_encode_base64 failed with status {status}")
            return out_buf.raw[:written.value].decode("ascii")
        return base64.b64encode(src).decode("ascii")
