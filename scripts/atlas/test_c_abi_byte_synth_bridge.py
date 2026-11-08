#!/usr/bin/env python3
"""
scripts/atlas/test_c_abi_byte_synth_bridge.py

Production qualification test suite for pure C-ABI zero-dependency byte synthesizer:
- TestNativeByteSynthBridge: Validates atlas_byte_synth.dll (MSVC x64 C++20).
  - Verifies ABI version == 2001.
  - Verifies non-destructive Morton permutation (preserves canonical ordinal-position contract).
  - Verifies canonical 128-bit ULID encoding (16x 0xFF -> "7ZZZZZZZZZZZZZZZZZZZZZZZZZ").
  - Verifies ULID roundtrip decoding and Crockford aliasing (I/L -> 1, O -> 0).
  - Verifies overflow and invalid Crockford character rejection.
  - Verifies LSB0 bitset synthesis and Hex/Base64 wire encoders against Python stdlib.
  - Verifies 6,527-record (417,728-byte) OpenSpec lowrank task cohort permutation.
- TestFallbackByteSynthBridge: Validates pure-Python fallback path for 100% parity.
- TestNativeRequiredRejection: Validates fail-closed behavior when native binary is required but missing.
"""

from __future__ import annotations

import base64
import hashlib
import struct
import unittest
from pathlib import Path
from c_abi_byte_synth_bridge import (
    AtlasByteSynthBridge,
    RECORD_SIZE_V2,
    RECORD_FORMAT_V2,
    CROCKFORD_ALPHABET,
)


def make_record(morton: int, ordinal: int, score: float = 0.5) -> bytes:
    """Creates a single 64-byte record according to RECORD_FORMAT_V2."""
    return struct.pack(
        RECORD_FORMAT_V2,
        morton,
        ordinal,
        1,  # cluster_id
        0.1, 0.2, 0.3,  # position (3 floats)
        score,          # final_score (double)
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  # features (8 floats)
    )


class TestNativeByteSynthBridge(unittest.TestCase):
    """Tests executing directly against native atlas_byte_synth.dll."""

    def setUp(self):
        self.bridge = AtlasByteSynthBridge(require_native=True)
        self.assertTrue(self.bridge.has_native, "Native DLL must be loaded for TestNativeByteSynthBridge")

    def test_abi_version(self):
        self.assertEqual(self.bridge.abi_version, 2001, "ABI version must match ATLAS_BYTE_SYNTH_ABI_VERSION (2001)")

    def test_record_size_invariants(self):
        self.assertEqual(struct.calcsize(RECORD_FORMAT_V2), RECORD_SIZE_V2)
        rec = make_record(100, 0, 0.8)
        self.assertEqual(len(rec), 64)

    def test_non_destructive_morton_permutation(self):
        """
        Gate 1: Radix sorting must not reorder 64-byte records in place.
        It must generate a separate Morton-sorted index permutation,
        preserving record.ordinal === rowIndex.
        """
        r0 = make_record(3000, 0, 0.4)
        r1 = make_record(100, 1, 0.8)
        r2 = make_record(500, 2, 0.6)
        raw = r0 + r1 + r2
        raw_copy = bytes(raw)

        perm = self.bridge.morton_permutation(raw)
        # Expected sorted order by morton: 100 (index 1) -> 500 (index 2) -> 3000 (index 0)
        self.assertEqual(perm, [1, 2, 0])

        # Underlying buffer MUST NOT be mutated
        self.assertEqual(raw, raw_copy)

        # Canonical ordinals in raw buffer must remain strictly [0, 1, 2]
        o0 = struct.unpack_from("<I", raw, 0 * 64 + 4)[0]
        o1 = struct.unpack_from("<I", raw, 1 * 64 + 4)[0]
        o2 = struct.unpack_from("<I", raw, 2 * 64 + 4)[0]
        self.assertEqual((o0, o1, o2), (0, 1, 2))

    def test_canonical_ulid128(self):
        """
        Gate 2: Canonical 128-bit ULID specification.
        16x 0xFF strictly produces 7ZZZZZZZZZZZZZZZZZZZZZZZZZ (first char in 0..7).
        16x 0x00 strictly produces 00000000000000000000000000.
        """
        all_ones = b"\xff" * 16
        ulid_max = self.bridge.encode_ulid128(all_ones)
        self.assertEqual(ulid_max, "7ZZZZZZZZZZZZZZZZZZZZZZZZZ")
        self.assertEqual(self.bridge.decode_ulid128(ulid_max), all_ones)

        all_zeros = b"\x00" * 16
        ulid_min = self.bridge.encode_ulid128(all_zeros)
        self.assertEqual(ulid_min, "00000000000000000000000000")
        self.assertEqual(self.bridge.decode_ulid128(ulid_min), all_zeros)

        # Roundtrip random bytes
        test_data = bytes(range(16))
        encoded = self.bridge.encode_ulid128(test_data)
        self.assertEqual(len(encoded), 26)
        self.assertEqual(self.bridge.decode_ulid128(encoded), test_data)

    def test_ulid128_crockford_aliasing_and_case(self):
        """ULID decoder must normalize lowercase and Crockford aliases (I/L -> 1, O -> 0)."""
        test_data = b"0123456789abcdef"
        canonical_ulid = self.bridge.encode_ulid128(test_data)
        aliased = canonical_ulid.replace("0", "O").replace("1", "I").lower()
        decoded = self.bridge.decode_ulid128(aliased)
        self.assertEqual(decoded, test_data)

    def test_ulid128_rejection(self):
        """ULID decoder must reject overflow (first char > '7') and illegal characters."""
        # First char '8' exceeds 128 bits
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("80000000000000000000000000")

        # First char 'Z' exceeds 128 bits
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("ZZZZZZZZZZZZZZZZZZZZZZZZZZ")

        # Invalid characters ('U', '!', etc.)
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("01AN4Z07BY79KA1307SR9X4MVU")

        # Wrong length
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("01AN4Z07BY79KA1307SR9X4MV")

    def test_lsb0_bitset_synthesis(self):
        """LSB0 bitset occupancy generation."""
        r0 = make_record(1, 0, 0.9)  # bit 0 = 1
        r1 = make_record(2, 1, 0.3)  # bit 1 = 0
        r2 = make_record(3, 2, 0.7)  # bit 2 = 1
        r3 = make_record(4, 3, 0.2)  # bit 3 = 0
        raw = r0 + r1 + r2 + r3

        bitset_bytes, count = self.bridge.synthesize_lsb0_bitset(raw, threshold=0.5)
        self.assertEqual(count, 2)
        self.assertEqual(len(bitset_bytes), 1)
        # bit 0 (1) + bit 2 (4) = 5 = 0x05
        self.assertEqual(bitset_bytes[0], 0x05)

    def test_hex_and_base64_against_stdlib(self):
        """Verifies fast Hex and Base64 wire encoders against Python standard library."""
        payload = b"\x00\x01\x02\x03\xde\xad\xbe\xef\xca\xfe\xba\xbe\xff"
        self.assertEqual(self.bridge.encode_hex(payload), payload.hex())
        self.assertEqual(self.bridge.encode_base64(payload), base64.b64encode(payload).decode("ascii"))

    def test_crockford_base32_general(self):
        data = b"\x01\x02\x03\x04\x05"
        b32 = self.bridge.encode_crockford_base32(data)
        self.assertTrue(len(b32) > 0)
        valid_chars = set(CROCKFORD_ALPHABET)
        for ch in b32:
            self.assertIn(ch, valid_chars)

    def test_openspec_6527_cohort_permutation(self):
        """
        Production qualification on the 6,527-task OpenSpec cohort (417,728 bytes).
        Ensures permutation correctly sorts Morton keys and underlying data is untouched.
        """
        repo_root = Path(__file__).resolve().parents[2]
        fixture_path = repo_root / ".tmp" / "atlas" / "openspec-task-lowrank-keyframes.bin"
        if not fixture_path.is_file():
            self.skipTest(f"Fixture {fixture_path} not found")

        raw_data = fixture_path.read_bytes()
        self.assertEqual(len(raw_data), 417728, "Fixture byte length must be 417,728")
        expected_sha = "a40abeb1f5f6ec953cf2cc4b05c80b82f85b174f763429e3ae9ba634c2b91bee"
        self.assertEqual(hashlib.sha256(raw_data).hexdigest(), expected_sha)

        perm = self.bridge.morton_permutation(raw_data)
        self.assertEqual(len(perm), 6527)

        # Verify permutation produces non-decreasing morton_code sequence
        morton_keys = [struct.unpack_from("<I", raw_data, idx * 64)[0] for idx in perm]
        self.assertEqual(morton_keys, sorted(morton_keys))

        # Verify raw data in memory is completely untouched
        self.assertEqual(hashlib.sha256(raw_data).hexdigest(), expected_sha)

        # Verify ordinals in raw data match index
        for i in range(100):
            ord_val = struct.unpack_from("<I", raw_data, i * 64 + 4)[0]
            self.assertEqual(ord_val, i, f"Record {i} task_ordinal must remain {i}")


class TestFallbackByteSynthBridge(unittest.TestCase):
    """Tests pure-Python fallback execution paths, ensuring 100% parity."""

    def setUp(self):
        self.bridge = AtlasByteSynthBridge(require_native=False)
        # Explicitly disable native library to test fallback logic
        self.bridge._lib = None
        self.assertFalse(self.bridge.has_native)

    def test_fallback_non_destructive_morton_permutation(self):
        r0 = make_record(3000, 0, 0.4)
        r1 = make_record(100, 1, 0.8)
        r2 = make_record(500, 2, 0.6)
        raw = r0 + r1 + r2
        perm = self.bridge.morton_permutation(raw)
        self.assertEqual(perm, [1, 2, 0])

    def test_fallback_canonical_ulid128(self):
        all_ones = b"\xff" * 16
        ulid_max = self.bridge.encode_ulid128(all_ones)
        self.assertEqual(ulid_max, "7ZZZZZZZZZZZZZZZZZZZZZZZZZ")
        self.assertEqual(self.bridge.decode_ulid128(ulid_max), all_ones)

        all_zeros = b"\x00" * 16
        ulid_min = self.bridge.encode_ulid128(all_zeros)
        self.assertEqual(ulid_min, "00000000000000000000000000")
        self.assertEqual(self.bridge.decode_ulid128(ulid_min), all_zeros)

    def test_fallback_ulid128_crockford_aliasing(self):
        test_data = b"0123456789abcdef"
        canonical_ulid = self.bridge.encode_ulid128(test_data)
        aliased = canonical_ulid.replace("0", "O").replace("1", "I").lower()
        decoded = self.bridge.decode_ulid128(aliased)
        self.assertEqual(decoded, test_data)

    def test_fallback_ulid128_rejection(self):
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("80000000000000000000000000")
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("ZZZZZZZZZZZZZZZZZZZZZZZZZZ")
        with self.assertRaises(ValueError):
            self.bridge.decode_ulid128("01AN4Z07BY79KA1307SR9X4MVU")

    def test_fallback_lsb0_bitset_synthesis(self):
        r0 = make_record(1, 0, 0.9)
        r1 = make_record(2, 1, 0.3)
        r2 = make_record(3, 2, 0.7)
        r3 = make_record(4, 3, 0.2)
        raw = r0 + r1 + r2 + r3
        bitset_bytes, count = self.bridge.synthesize_lsb0_bitset(raw, threshold=0.5)
        self.assertEqual(count, 2)
        self.assertEqual(bitset_bytes[0], 0x05)

    def test_fallback_hex_and_base64(self):
        payload = b"\x00\x01\x02\x03\xde\xad\xbe\xef\xca\xfe\xba\xbe\xff"
        self.assertEqual(self.bridge.encode_hex(payload), payload.hex())
        self.assertEqual(self.bridge.encode_base64(payload), base64.b64encode(payload).decode("ascii"))


class TestNativeRequiredRejection(unittest.TestCase):
    """Tests fail-closed behavior when native binary is required but missing."""

    def test_require_native_missing_file_raises(self):
        bogus_path = Path("nonexistent_dll_dir/bogus_atlas_byte_synth.dll")
        with self.assertRaises(RuntimeError) as ctx:
            AtlasByteSynthBridge(lib_path=bogus_path, require_native=True)
        self.assertIn("Native atlas_byte_synth DLL required", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
