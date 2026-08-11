#!/usr/bin/env python3
"""
ampere_quantization.py — Production INT4 Pack/Dequant Quantization Module

Implements INT4 packing (two 4-bit signed/unsigned integers per byte) and
dequantization scaling for NVIDIA Ampere tensor cores.
"""

import numpy as np

SEMANTIC_DIMENSION = 768

def pack_int4(vector: np.ndarray) -> np.ndarray:
    """
    Pack float32 vector of dimension 768 into int4 packed bytes (384 bytes).
    Scales float values [-1.0, 1.0] to int4 range [-8, 7], then packs pairs into uint8.
    """
    if vector.shape[-1] != SEMANTIC_DIMENSION:
        raise ValueError(f"Input vector dimension must be {SEMANTIC_DIMENSION}, got {vector.shape[-1]}")

    # Quantize to int4 range [-8, 7]
    clipped = np.clip(vector, -1.0, 1.0)
    q = np.round(clipped * 7.5).astype(np.int8)
    q = np.clip(q, -8, 7)

    # Convert signed int4 to 4-bit unsigned representation (0-15)
    u4 = (q + 8).astype(np.uint8)

    # Pack even and odd indices into single uint8 byte
    even = u4[..., 0::2]
    odd = u4[..., 1::2]
    packed = (even << 4) | (odd & 0x0F)
    return packed

def unpack_int4(packed: np.ndarray) -> np.ndarray:
    """
    Unpack int4 bytes (384 bytes) back to 768 float32 values.
    """
    high = (packed >> 4) & 0x0F
    low = packed & 0x0F

    # Reconstruct 768 length array
    unpacked_u4 = np.empty((packed.shape[0], SEMANTIC_DIMENSION), dtype=np.uint8) if packed.ndim > 1 else np.empty(SEMANTIC_DIMENSION, dtype=np.uint8)

    if packed.ndim > 1:
        unpacked_u4[:, 0::2] = high
        unpacked_u4[:, 1::2] = low
    else:
        unpacked_u4[0::2] = high
        unpacked_u4[1::2] = low

    # Dequantize uint8 (0-15) -> int4 (-8 to 7) -> float32 (-1.0 to 1.0)
    q = unpacked_u4.astype(np.float32) - 8.0
    floats = q / 7.5
    return floats
