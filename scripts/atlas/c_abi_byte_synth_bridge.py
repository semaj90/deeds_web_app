#!/usr/bin/env python3
"""
scripts/atlas/c_abi_byte_synth_bridge.py

Pure C-ABI Zero-Dependency Byte Synthesizer Bridge:
- Wraps simd-bridge/cpp/atlas_byte_synth_core.cpp via ctypes.
- Zero dependency on libtorch / PyTorch C++ ABI.
- Provides fallback pure-Python implementations when native library is unbuilt.
- Implements:
  1. 4-Pass 8-Bit LSD Radix Sort (morton_code).
  2. LSB0 Bitset Occupancy Synthesizer.
  3. Fast Hex, Crockford Base32, and Base64 wire encoding.
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
        root / "simd-bridge" / "build" / "Release" / "atlas_byte_synth.dll",
        root / "simd-bridge" / "build" / "atlas_byte_synth.dll",
        root / "simd-bridge" / "build" / "libatlas_byte_synth.so",
        root / "simd-bridge" / "cpp" / "atlas_byte_synth.dll",
        root / "build" / "Release" / "atlas_byte_synth.dll",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


class AtlasByteSynthBridge:
    def __init__(self, lib_path: Optional[Path] = None):
        self.lib_path = lib_path or find_native_byte_synth_lib()
        self._lib = None
        if self.lib_path and self.lib_path.is_file():
            try:
                lib = ctypes.CDLL(str(self.lib_path))
                lib.atlas_radix_sort_v2_records.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                ]
                lib.atlas_radix_sort_v2_records.restype = None

                lib.atlas_synthesize_lsb0_bitset.argtypes = [
                    ctypes.c_void_p,
                    ctypes.c_size_t,
                    ctypes.c_double,
                    ctypes.c_void_p,
                ]
                lib.atlas_synthesize_lsb0_bitset.restype = ctypes.c_size_t
                self._lib = lib
            except Exception:
                self._lib = None

    @property
    def has_native(self) -> bool:
        return self._lib is not None

    def radix_sort_records(self, record_bytes: bytes) -> bytes:
        """Sorts contiguous 64-byte records by morton_code in O(N) time."""
        count = len(record_bytes) // RECORD_SIZE_V2
        if count == 0:
            return b""
        if len(record_bytes) % RECORD_SIZE_V2 != 0:
            raise ValueError(f"Buffer size {len(record_bytes)} not a multiple of 64")

        if self._lib is not None:
            out_buf = bytearray(len(record_bytes))
            in_ptr = ctypes.cast(record_bytes, ctypes.c_void_p)
            out_ptr = (ctypes.c_char * len(out_buf)).from_buffer(out_buf)
            self._lib.atlas_radix_sort_v2_records(in_ptr, ctypes.byref(out_ptr), count)
            return bytes(out_buf)

        # Pure Python fallback: extract morton_code (uint32 at offset 0) and sort stably
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
            bits_set = self._lib.atlas_synthesize_lsb0_bitset(
                in_ptr, count, ctypes.c_double(threshold), ctypes.byref(out_ptr)
            )
            return bytes(out_bytes), bits_set

        # Fallback pure-Python:
        bits_set = 0
        for i in range(count):
            score = struct.unpack_from("<d", record_bytes, i * RECORD_SIZE_V2 + 24)[0]
            if score > threshold:
                out_bytes[i >> 3] |= 1 << (i & 7)
                bits_set += 1
        return bytes(out_bytes), bits_set

    @staticmethod
    def encode_hex(data: bytes) -> str:
        return data.hex()

    @staticmethod
    def encode_crockford_base32(data: bytes) -> str:
        CROCKFORD_LUT = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
        buffer = 0
        bits_left = 0
        chars = []
        for byte in data:
            buffer = (buffer << 8) | byte
            bits_left += 8
            while bits_left >= 5:
                chars.append(CROCKFORD_LUT[(buffer >> (bits_left - 5)) & 0x1F])
                bits_left -= 5
        if bits_left > 0:
            chars.append(CROCKFORD_LUT[(buffer << (5 - bits_left)) & 0x1F])
        return "".join(chars)

    @staticmethod
    def encode_base64(data: bytes) -> str:
        return base64.b64encode(data).decode("ascii")
