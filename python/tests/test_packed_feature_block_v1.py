"""Unit tests for PackedFeatureBlockV1 (PFB1) bit, nibble, and sliding-window contract."""

from __future__ import annotations

import pytest

from python.atlas_graph_runtime.packed_feature_block_v1 import (
    PFB1_HEADER_BYTES,
    build_feature_map_schema_v1,
    decode_packed_feature_block_v1,
    encode_packed_feature_block_v1,
    read_bit_window_v1,
    read_nibble_window_v1,
    rotl_w_v1,
)


def test_pfb1_roundtrip_and_sliding_windows():
    # 2 candidates x 9 features = 18 capacity; use 17 bits & 5 nibbles (odd counts test tail zeroing)
    bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1]  # 17 bits -> 3 bytes, 7 tail bits must be 0
    nibbles = [3, 12, 7, 15, 5]  # 5 nibbles -> 3 bytes, final high nibble must be 0

    blob = encode_packed_feature_block_v1(
        feature_map_rev=17,
        candidate_count=2,
        feature_count=9,
        bits=bits,
        nibbles=nibbles,
    )
    decoded = decode_packed_feature_block_v1(blob, expected_feature_map_rev=17)

    assert decoded.feature_map_rev == 17
    assert decoded.logical_bit_count == 17
    assert decoded.nibble_count == 5

    # Cross-byte sliding windows
    assert read_bit_window_v1(decoded.mask_bytes, start=5, length=12, logical_count=17) == bits[5:17]
    assert read_nibble_window_v1(decoded.nibble_bytes, start=1, length=4, logical_count=5) == nibbles[1:5]


def test_pfb1_rejects_nonzero_tail_padding_and_rev_drift():
    bits = [1, 0, 1]  # 3 bits -> unused upper 5 bits in byte 0 must be 0
    nibbles = [2, 9, 4]  # 3 nibbles -> unused high nibble in byte 1 must be 0
    blob = bytearray(
        encode_packed_feature_block_v1(
            feature_map_rev=17,
            candidate_count=1,
            feature_count=4,
            bits=bits,
            nibbles=nibbles,
        )
    )

    # Corrupt unused tail bit in mask byte
    tampered_bit = bytearray(blob)
    tampered_bit[PFB1_HEADER_BYTES] |= 0x80
    with pytest.raises(ValueError, match="UNUSED_TAIL_BITS_NON_ZERO"):
        decode_packed_feature_block_v1(bytes(tampered_bit))

    # Corrupt unused high nibble in nibble byte
    tampered_nib = bytearray(blob)
    tampered_nib[-1] |= 0xA0
    with pytest.raises(ValueError, match="UNUSED_FINAL_HIGH_NIBBLE_NON_ZERO"):
        decode_packed_feature_block_v1(bytes(tampered_nib))

    # Revision mismatch
    with pytest.raises(ValueError, match="PFB1_FEATURE_MAP_REV_MISMATCH"):
        decode_packed_feature_block_v1(bytes(blob), expected_feature_map_rev=18)


def test_rotl_w_and_feature_map_schema():
    assert rotl_w_v1(0x81, 1, 8) == 0x03
    assert rotl_w_v1(0x8001, 1, 16) == 0x0003
    assert rotl_w_v1(0x80000001, 1, 32) == 0x00000003

    # Boundary rotations r in {0, w-1, w, w+1}
    for w in (8, 16, 32, 64):
        assert rotl_w_v1(1, 0, w) == 1
        assert rotl_w_v1(1, w, w) == 1
        assert rotl_w_v1(1, w + 1, w) == 2
        assert rotl_w_v1(1, w - 1, w) == (1 << (w - 1))

    # P0 Golden-vector interoperability fixture:
    # logical_bits=10, bits_set=[0, 5, 8] -> mask_hex="2101" (LSB0)
    # nibbles=[0, 1, 15, 7, 3] -> nibble_hex="107f03" (LOW_THEN_HIGH)
    golden_bits = [1 if i in (0, 5, 8) else 0 for i in range(10)]
    golden_nibbles = [0, 1, 15, 7, 3]
    golden_blob = encode_packed_feature_block_v1(
        feature_map_rev=1,
        candidate_count=1,
        feature_count=10,
        bits=golden_bits,
        nibbles=golden_nibbles,
    )
    decoded_golden = decode_packed_feature_block_v1(golden_blob, expected_feature_map_rev=1)
    assert decoded_golden.mask_bytes.hex() == "2101"
    assert decoded_golden.nibble_bytes.hex() == "107f03"
    assert rotl_w_v1(129, 1, 8) == 3

    schema = build_feature_map_schema_v1(
        feature_map_revision=17,
        features=[
            {"ordinal": 2, "key": "domain:graphics"},
            {"ordinal": 0, "key": "lang:cuda_cpp"},
            {"ordinal": 1, "key": "kind:function"},
        ],
    )
    assert [f.key for f in schema.features] == ["lang:cuda_cpp", "kind:function", "domain:graphics"]
    assert len(schema.digest) == 64
