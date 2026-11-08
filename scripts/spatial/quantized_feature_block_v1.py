"""
quantized_feature_block_v1.py

Python reference implementation of atlas.quantized-feature-block.v1:
LSB-first bit-level packing and unpacking for 2-bit, 3-bit, and 4-bit quantization codes.
Must produce identical byte streams to the TypeScript reference under SHA-256.
"""

from typing import Literal

BitWidth = Literal[2, 3, 4]


def pack_codes(codes: list[int] | bytes | bytearray, bits: BitWidth) -> bytearray:
    mask = (1 << bits) - 1
    total_bits = len(codes) * bits
    total_bytes = (total_bits + 7) // 8
    out = bytearray(total_bytes)

    for i, val in enumerate(codes):
        if val > mask or val < 0:
            raise ValueError(f"QUANT_CODE_OUT_OF_RANGE: value {val} exceeds {bits}-bit mask {mask}")

        bit_offset = i * bits
        byte_index = bit_offset >> 3
        shift = bit_offset & 7

        out[byte_index] |= (val << shift) & 0xFF

        if shift + bits > 8:
            out[byte_index + 1] |= (val >> (8 - shift)) & 0xFF

    return out


def unpack_code(raw: bytes | bytearray, index: int, bits: BitWidth) -> int:
    bit_offset = index * bits
    if bit_offset + bits > len(raw) * 8:
        raise IndexError(f"QUANT_INDEX_OUT_OF_RANGE: index {index} at {bits}-bit exceeds buffer size")

    byte_index = bit_offset >> 3
    shift = bit_offset & 7

    b0 = raw[byte_index]
    b1 = raw[byte_index + 1] if byte_index + 1 < len(raw) else 0
    word = b0 | (b1 << 8)

    return (word >> shift) & ((1 << bits) - 1)


def unpack_codes(raw: bytes | bytearray, count: int, bits: BitWidth) -> list[int]:
    return [unpack_code(raw, i, bits) for i in range(count)]
