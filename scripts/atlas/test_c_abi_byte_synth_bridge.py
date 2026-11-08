#!/usr/bin/env python3
"""
scripts/atlas/test_c_abi_byte_synth_bridge.py

Unit tests for the pure C-ABI zero-dependency byte synthesizer bridge.
Tests 64-byte record packing, morton radix sorting, LSB0 bitset synthesis,
and Crockford Base32 / Hex / Base64 encoders.
"""

import struct
import unittest
from pathlib import Path
from c_abi_byte_synth_bridge import AtlasByteSynthBridge, RECORD_SIZE_V2, RECORD_FORMAT_V2


class TestAtlasByteSynthBridge(unittest.TestCase):
    def setUp(self):
        self.bridge = AtlasByteSynthBridge()

    def _make_record(self, morton: int, ordinal: int, score: float) -> bytes:
        return struct.pack(
            RECORD_FORMAT_V2,
            morton,
            ordinal,
            3,  # cluster
            0.1, 0.2, 0.3,  # pos
            score,          # final_score
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0,  # features
        )

    def test_record_size_invariants(self):
        self.assertEqual(struct.calcsize(RECORD_FORMAT_V2), RECORD_SIZE_V2)
        rec = self._make_record(100, 0, 0.8)
        self.assertEqual(len(rec), 64)

    def test_radix_sort_records(self):
        # Create records with out-of-order morton keys
        r1 = self._make_record(3000, 0, 0.4)
        r2 = self._make_record(100, 1, 0.8)
        r3 = self._make_record(500, 2, 0.6)
        raw = r1 + r2 + r3

        sorted_raw = self.bridge.radix_sort_records(raw)
        self.assertEqual(len(sorted_raw), 3 * 64)

        # Check sorted order: 100 -> 500 -> 3000
        m0 = struct.unpack_from("<I", sorted_raw, 0)[0]
        m1 = struct.unpack_from("<I", sorted_raw, 64)[0]
        m2 = struct.unpack_from("<I", sorted_raw, 128)[0]

        self.assertEqual(m0, 100)
        self.assertEqual(m1, 500)
        self.assertEqual(m2, 3000)

    def test_bitset_synthesis(self):
        r1 = self._make_record(1, 0, 0.9)  # bit 0 = 1
        r2 = self._make_record(2, 1, 0.3)  # bit 1 = 0
        r3 = self._make_record(3, 2, 0.7)  # bit 2 = 1
        r4 = self._make_record(4, 3, 0.2)  # bit 3 = 0
        raw = r1 + r2 + r3 + r4

        bitset_bytes, count = self.bridge.synthesize_lsb0_bitset(raw, threshold=0.5)
        self.assertEqual(count, 2)
        self.assertEqual(len(bitset_bytes), 1)
        # bit 0 (1) + bit 2 (4) = 5 = 0x05
        self.assertEqual(bitset_bytes[0], 0x05)

    def test_crockford_base32(self):
        data = b"\x01\x02\x03\x04\x05"
        b32 = self.bridge.encode_crockford_base32(data)
        self.assertTrue(len(b32) > 0)
        # Verify valid Crockford charset
        valid_chars = set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
        for ch in b32:
            self.assertIn(ch, valid_chars)

    def test_hex_and_base64(self):
        data = b"\xde\xad\xbe\xef"
        self.assertEqual(self.bridge.encode_hex(data), "deadbeef")
        self.assertEqual(self.bridge.encode_base64(data), "3q2+7w==")


if __name__ == "__main__":
    unittest.main()
