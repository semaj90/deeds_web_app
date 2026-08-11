"""
Parent Atlas Ampere / SM86 quantization tests.

Purpose
-------
These tests prove that the proposed cache policy is internally coherent on the
RTX 3060 Ti generation:

    canonical semantic_768 FP32
        -> packed symmetric blockwise INT4 cache
        -> dequantize on GPU
        -> FP16 candidate scoring
        -> FP32 exact/oracle scoring

They DO NOT promote INT4 as canonical ranking truth.

Important architecture constraints
----------------------------------
* semantic_768 remains the semantic representation.
* INT4 is a physical storage/residency encoding only.
* SM86 has native INT4 integer Tensor Core support, but this first gate does
  NOT require a custom INT4 MMA kernel.
* FP8 and floating-point FP4 are not native SM86 Tensor Core execution paths.
* The existing T3a FP32/cuVS path remains the real corpus-level oracle.

Run:
    pytest -q scripts/atlas/gpu/test_ampere_quantization.py -s

Optional live corpus gate:
    set ATLAS_SEMANTIC_768_NPY=C:\\path\\semantic_768.npy
    set ATLAS_QUERY_768_NPY=C:\\path\\queries_768.npy
    set ATLAS_INT4_MIN_RECALL10=0.80
    pytest -q scripts/atlas/gpu/test_ampere_quantization.py -s -k live
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

import numpy as np
import pytest
import torch
import torch.nn.functional as F


SEMANTIC_DIMENSION = 768
INT4_QMAX = 7


def _require_cuda() -> None:
    if not torch.cuda.is_available():
        pytest.skip("CUDA is not available in this Python environment.")


def _require_sm86() -> None:
    _require_cuda()
    capability = torch.cuda.get_device_capability()
    if capability != (8, 6):
        pytest.skip(
            f"This live hardware proof targets SM86; detected capability={capability}."
        )


def normalize_rows(x: torch.Tensor) -> torch.Tensor:
    return F.normalize(x.float(), p=2, dim=-1)


def quantize_symmetric_int4_blockwise(
    x: torch.Tensor,
    block_size: int = 64,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Quantize the final dimension to signed symmetric INT4.

    The returned q-values are still int8 tensors containing values [-7, 7].
    Packing to two nibbles per byte is handled separately so quantization math
    can be tested independently from byte layout.

    Scales are per row, per block.
    """
    if x.ndim != 2:
        raise ValueError(f"expected rank-2 [N,D] tensor, got shape={tuple(x.shape)}")
    if x.shape[1] != SEMANTIC_DIMENSION:
        raise ValueError(
            f"expected semantic_768 dimension {SEMANTIC_DIMENSION}, got {x.shape[1]}"
        )
    if block_size <= 0 or SEMANTIC_DIMENSION % block_size != 0:
        raise ValueError(
            f"block_size must divide {SEMANTIC_DIMENSION}, got {block_size}"
        )

    x32 = x.float()
    blocks = x32.reshape(x32.shape[0], -1, block_size)

    # Symmetric scale. Clamp protects all-zero blocks.
    scales = (
        blocks.abs().amax(dim=-1, keepdim=True).clamp_min(1e-12) / INT4_QMAX
    )

    q = torch.round(blocks / scales).clamp(-INT4_QMAX, INT4_QMAX)
    return q.to(torch.int8), scales.squeeze(-1).to(torch.float16)


def dequantize_symmetric_int4_blockwise(
    q: torch.Tensor,
    scales: torch.Tensor,
    *,
    block_size: int = 64,
    dtype: torch.dtype = torch.float32,
) -> torch.Tensor:
    """Dequantize blockwise signed INT4 values to FP16/FP32 scoring tensors."""
    if q.dtype != torch.int8:
        raise ValueError(f"expected int8 carrier for INT4 values, got {q.dtype}")

    if q.ndim != 3:
        raise ValueError(f"expected [N,blocks,block_size], got {tuple(q.shape)}")

    if q.shape[-1] != block_size:
        raise ValueError(
            f"q block dimension {q.shape[-1]} != block_size {block_size}"
        )

    if scales.shape != q.shape[:2]:
        raise ValueError(
            f"scale shape {tuple(scales.shape)} does not match q blocks {tuple(q.shape[:2])}"
        )

    x = q.float() * scales.float().unsqueeze(-1)
    return x.reshape(q.shape[0], -1).to(dtype)


def pack_signed_int4(q: torch.Tensor) -> torch.Tensor:
    """
    Pack two signed 4-bit values into each uint8 byte.

    q values are expected in [-8, 7]. Negative numbers are represented using
    the low four bits of two's-complement representation.
    """
    if q.dtype != torch.int8:
        raise ValueError("q must use int8 as the unpacked INT4 carrier")

    flat = q.reshape(q.shape[0], -1)
    if flat.shape[1] % 2 != 0:
        raise ValueError("INT4 packing requires an even number of values")

    if torch.any(flat < -8) or torch.any(flat > 7):
        raise ValueError("INT4 values must be in [-8, 7]")

    low = torch.bitwise_and(flat[:, 0::2].to(torch.int16), 0x0F).to(torch.uint8)
    high = torch.bitwise_and(flat[:, 1::2].to(torch.int16), 0x0F).to(torch.uint8)

    return low | (high << 4)


def unpack_signed_int4(
    packed: torch.Tensor,
    *,
    values_per_row: int = SEMANTIC_DIMENSION,
) -> torch.Tensor:
    """Inverse of pack_signed_int4()."""
    if packed.dtype != torch.uint8:
        raise ValueError("packed INT4 tensor must be uint8")

    low = torch.bitwise_and(packed, 0x0F).to(torch.int16)
    high = torch.bitwise_and(packed >> 4, 0x0F).to(torch.int16)

    low = torch.where(low >= 8, low - 16, low)
    high = torch.where(high >= 8, high - 16, high)

    out = torch.empty(
        (packed.shape[0], packed.shape[1] * 2),
        dtype=torch.int16,
        device=packed.device,
    )
    out[:, 0::2] = low
    out[:, 1::2] = high

    return out[:, :values_per_row].to(torch.int8)


def topk_overlap(
    oracle_scores: torch.Tensor,
    candidate_scores: torch.Tensor,
    k: int,
) -> float:
    """Mean set overlap@k; used only as a quantization sanity metric."""
    oracle = torch.topk(oracle_scores, k, dim=-1).indices.cpu()
    candidate = torch.topk(candidate_scores, k, dim=-1).indices.cpu()

    overlaps = []
    for a, b in zip(oracle, candidate):
        overlaps.append(len(set(a.tolist()) & set(b.tolist())) / k)

    return float(np.mean(overlaps))


def test_int4_pack_roundtrip_is_lossless_for_quantized_values() -> None:
    torch.manual_seed(7)
    q = torch.randint(-7, 8, (4, SEMANTIC_DIMENSION), dtype=torch.int8)

    packed = pack_signed_int4(q)
    unpacked = unpack_signed_int4(packed)

    assert packed.shape == (4, SEMANTIC_DIMENSION // 2)
    assert torch.equal(q, unpacked)


def test_int4_payload_is_half_an_int8_payload_before_scale_overhead() -> None:
    rows = 10
    q = torch.zeros((rows, SEMANTIC_DIMENSION), dtype=torch.int8)

    packed = pack_signed_int4(q)

    int8_payload_bytes = q.numel()  # one byte/value
    int4_payload_bytes = packed.numel()  # two values/byte

    assert int4_payload_bytes * 2 == int8_payload_bytes
    assert packed.shape[1] == 384


def test_quantization_is_deterministic() -> None:
    torch.manual_seed(42)
    x = normalize_rows(torch.randn(16, SEMANTIC_DIMENSION))

    q1, s1 = quantize_symmetric_int4_blockwise(x, block_size=64)
    q2, s2 = quantize_symmetric_int4_blockwise(x, block_size=64)

    assert torch.equal(q1, q2)
    assert torch.equal(s1, s2)
    assert torch.equal(pack_signed_int4(q1.reshape(16, -1)),
                       pack_signed_int4(q2.reshape(16, -1)))


def test_dimension_drift_is_rejected() -> None:
    bad = torch.randn(2, 384)

    with pytest.raises(ValueError, match="semantic_768"):
        quantize_symmetric_int4_blockwise(bad)


@pytest.mark.gpu_ampere
def test_live_device_is_sm86_and_fp32_fp16_paths_execute() -> None:
    _require_sm86()

    device = torch.device("cuda")
    assert torch.cuda.get_device_capability(device) == (8, 6)

    # This test verifies the actual FP32/FP16 execution lanes we intend to use.
    # It does NOT claim PyTorch itself provides packed INT4 GEMM.
    a32 = torch.randn(32, SEMANTIC_DIMENSION, device=device, dtype=torch.float32)
    b32 = torch.randn(SEMANTIC_DIMENSION, 64, device=device, dtype=torch.float32)

    out32 = a32 @ b32
    out16 = a32.half() @ b32.half()

    torch.cuda.synchronize()

    assert out32.dtype == torch.float32
    assert out16.dtype == torch.float16
    assert torch.isfinite(out32).all()
    assert torch.isfinite(out16).all()


@pytest.mark.gpu_ampere
def test_int4_cache_dequantizes_on_gpu_and_preserves_768_shape() -> None:
    _require_sm86()

    device = torch.device("cuda")
    torch.manual_seed(123)

    x = normalize_rows(
        torch.randn(128, SEMANTIC_DIMENSION, device=device, dtype=torch.float32)
    )

    q, scales = quantize_symmetric_int4_blockwise(x, block_size=64)
    packed = pack_signed_int4(q.reshape(q.shape[0], -1))

    # Simulate the packed cache path: packed bytes -> signed INT4 carrier ->
    # block structure -> dequantize to FP16 hot scoring tensor.
    unpacked = unpack_signed_int4(packed)
    unpacked_blocks = unpacked.reshape(q.shape)

    hot_fp16 = dequantize_symmetric_int4_blockwise(
        unpacked_blocks,
        scales,
        block_size=64,
        dtype=torch.float16,
    )

    assert hot_fp16.shape == (128, SEMANTIC_DIMENSION)
    assert hot_fp16.dtype == torch.float16
    assert torch.isfinite(hot_fp16).all()


@pytest.mark.gpu_ampere
def test_int4_synthetic_recall_is_only_a_sanity_check() -> None:
    """
    Synthetic deterministic check.

    This threshold is intentionally weak. It only catches a broken pack,
    scale, dequant, or scoring implementation.

    DO NOT use this result to promote INT4. Real promotion must compare the
    frozen Parent Atlas semantic_768 corpus against the existing T3a FP32/cuVS
    oracle and persist a receipt.
    """
    _require_sm86()

    device = torch.device("cuda")
    torch.manual_seed(42)

    corpus = normalize_rows(
        torch.randn(2048, SEMANTIC_DIMENSION, device=device, dtype=torch.float32)
    )
    queries = normalize_rows(
        torch.randn(8, SEMANTIC_DIMENSION, device=device, dtype=torch.float32)
    )

    oracle_scores = queries @ corpus.T

    q, scales = quantize_symmetric_int4_blockwise(corpus, block_size=64)
    dequant = dequantize_symmetric_int4_blockwise(
        q,
        scales,
        block_size=64,
        dtype=torch.float32,
    )
    dequant = normalize_rows(dequant)

    int4_scores = queries @ dequant.T

    recall10 = topk_overlap(oracle_scores, int4_scores, 10)
    mean_abs_error = float((oracle_scores - int4_scores).abs().mean().item())

    print(
        {
            "synthetic_recall10": recall10,
            "mean_abs_score_error": mean_abs_error,
        }
    )

    # Seeded random 768d data normally clears this comfortably. The threshold
    # is deliberately not a production quality gate.
    assert recall10 >= 0.75
    assert mean_abs_error < 0.01


@pytest.mark.gpu_ampere
@pytest.mark.live
def test_live_semantic_768_int4_recall_against_fp32() -> None:
    """
    Optional real-corpus quantization gate.

    Required:
        ATLAS_SEMANTIC_768_NPY=/path/to/corpus.npy
        ATLAS_QUERY_768_NPY=/path/to/queries.npy

    Optional:
        ATLAS_INT4_MIN_RECALL10=0.0

    The default minimum is zero on purpose: this test first measures and
    reports the real distribution. Raise the environment threshold only after
    an evaluation decision has been made and versioned.
    """
    _require_sm86()

    corpus_path = os.getenv("ATLAS_SEMANTIC_768_NPY")
    query_path = os.getenv("ATLAS_QUERY_768_NPY")

    if not corpus_path or not query_path:
        pytest.skip(
            "Set ATLAS_SEMANTIC_768_NPY and ATLAS_QUERY_768_NPY for live corpus proof."
        )

    corpus_np = np.load(Path(corpus_path))
    query_np = np.load(Path(query_path))

    if corpus_np.ndim != 2 or corpus_np.shape[1] != SEMANTIC_DIMENSION:
        raise AssertionError(f"bad corpus shape: {corpus_np.shape}")
    if query_np.ndim != 2 or query_np.shape[1] != SEMANTIC_DIMENSION:
        raise AssertionError(f"bad query shape: {query_np.shape}")

    device = torch.device("cuda")

    corpus = normalize_rows(
        torch.from_numpy(corpus_np).to(device=device, dtype=torch.float32)
    )
    queries = normalize_rows(
        torch.from_numpy(query_np).to(device=device, dtype=torch.float32)
    )

    # FP32 GPU baseline. In Parent Atlas this still does not replace T3a/cuVS;
    # use the existing T3a receipt as the external oracle for promotion.
    oracle_scores = queries @ corpus.T

    q, scales = quantize_symmetric_int4_blockwise(corpus, block_size=64)
    dequant = normalize_rows(
        dequantize_symmetric_int4_blockwise(
            q,
            scales,
            block_size=64,
            dtype=torch.float32,
        )
    )
    int4_scores = queries @ dequant.T

    metrics = {
        "gpu": torch.cuda.get_device_name(),
        "capability": torch.cuda.get_device_capability(),
        "rows": int(corpus.shape[0]),
        "queries": int(queries.shape[0]),
        "dimension": int(corpus.shape[1]),
        "recall1": topk_overlap(oracle_scores, int4_scores, 1),
        "recall10": topk_overlap(oracle_scores, int4_scores, 10),
        "recall100": topk_overlap(
            oracle_scores,
            int4_scores,
            min(100, corpus.shape[0]),
        ),
        "mean_abs_score_error": float(
            (oracle_scores - int4_scores).abs().mean().item()
        ),
        "max_abs_score_error": float(
            (oracle_scores - int4_scores).abs().max().item()
        ),
    }

    print(metrics)

    required_recall10 = float(os.getenv("ATLAS_INT4_MIN_RECALL10", "0.0"))
    assert metrics["recall10"] >= required_recall10
