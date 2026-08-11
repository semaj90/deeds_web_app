"""
Fail-fast workstation smoke test for Parent Atlas Ampere quantization.

Unlike the pytest suite, this script intentionally FAILS when the workstation
is not SM86. Use it as a permanent local receipt before enabling the INT4 cache
lane.

Run:
    python scripts/atlas/gpu/smoke_ampere_quantization.py
"""

from __future__ import annotations

import sys

import torch

from test_ampere_quantization import (
    SEMANTIC_DIMENSION,
    dequantize_symmetric_int4_blockwise,
    normalize_rows,
    pack_signed_int4,
    quantize_symmetric_int4_blockwise,
    unpack_signed_int4,
)


def main() -> int:
    if not torch.cuda.is_available():
        print("FAIL: CUDA unavailable")
        return 2

    capability = torch.cuda.get_device_capability()
    gpu = torch.cuda.get_device_name()

    print(f"GPU: {gpu}")
    print(f"compute_capability: {capability}")
    print(f"torch_cuda: {torch.version.cuda}")

    if capability != (8, 6):
        print("FAIL: expected SM86 Ampere workstation")
        return 3

    device = torch.device("cuda")
    torch.manual_seed(20260811)

    x = normalize_rows(
        torch.randn(64, SEMANTIC_DIMENSION, device=device, dtype=torch.float32)
    )
    query = normalize_rows(
        torch.randn(4, SEMANTIC_DIMENSION, device=device, dtype=torch.float32)
    )

    q, scales = quantize_symmetric_int4_blockwise(x, block_size=64)
    packed = pack_signed_int4(q.reshape(q.shape[0], -1))
    unpacked = unpack_signed_int4(packed).reshape(q.shape)

    hot_fp16 = dequantize_symmetric_int4_blockwise(
        unpacked,
        scales,
        block_size=64,
        dtype=torch.float16,
    )

    # FP16 candidate scoring.
    score16 = query.half() @ hot_fp16.T

    # FP32 exact/reference scoring remains available.
    score32 = query @ x.T

    torch.cuda.synchronize()

    if not torch.isfinite(score16).all() or not torch.isfinite(score32).all():
        print("FAIL: non-finite scores")
        return 4

    if hot_fp16.shape != (64, SEMANTIC_DIMENSION):
        print(f"FAIL: shape drift {tuple(hot_fp16.shape)}")
        return 5

    print(f"packed_bytes_per_vector: {packed.shape[1]}")
    print("storage_encoding: int4_symmetric_blockwise")
    print("hot_score_dtype: fp16")
    print("exact_score_dtype: fp32")
    print("native_fp8_policy: false")
    print("native_fp4_policy: false")
    print("semantic_representation: semantic_768")
    print("PASS: AMPERE_SM86_INT4_CACHE_SMOKE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
