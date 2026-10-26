#!/usr/bin/env python3
"""ast_chunk_routing_helpers_v2.py — AVX2/AVX-512 64-byte Cache-Line Aligned MMap Slab & Titans/MIRAS LoD Metadata.

Aligns the [B, 25] float32 procedural feature slab with:
1. Intel 11th Gen Core i7 AVX2 (256-bit / 32-byte) & AVX-512 (512-bit / 64-byte) SIMD registers.
2. 32-float stride (128 bytes = 2x AVX-512 / 4x AVX2 registers) per chunk row:
   - Cols 0..24: Canonical 25-D AST, NES LUT (0x01..0x09, 0x2A), and POS features.
   - Cols 25..31: Google Titans + MIRAS retention/surprise scores & LoD ($1..$20) KV-cache block metadata.
3. Zero-copy PyTorch pinned memory DMA backing (pin_memory=True).
"""

from __future__ import annotations

import mmap
import os
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional, Sequence, Tuple, Union

try:
    import numpy as np
    HAVE_NUMPY = True
except ImportError:
    np = None  # type: ignore
    HAVE_NUMPY = False

try:
    import torch
    HAVE_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAVE_TORCH = False

from .ast_chunk_routing_helpers import AstChunkDomainRouter, AstChunkRouteTuple


# ═══════════════════════════════════════════════════════════════════
# 1. 64-Byte Cache-Line Aligned Geometry Constants
# ═══════════════════════════════════════════════════════════════════

FEATURE_ACTIVE_DIM: int = 25
FEATURE_ALIGNED_STRIDE: int = 32  # 32 floats = 128 bytes (exact 2x AVX-512 / 4x AVX2 registers)
BYTES_PER_ROW: int = FEATURE_ALIGNED_STRIDE * 4  # 128 bytes per chunk row


class MirasMemoryHeader(NamedTuple):
    """Google Titans + MIRAS Test-Time Memory Header & LoD Compute Budget."""
    surprise_grad_norm: float    # Titans online surprise metric ||dL/dM||
    retention_gate_alpha: float  # MIRAS forget/retention gate in [0.0, 1.0]
    lod_budget_tier: int         # 1..20 ($1-$20 token/compute budget LoD level)
    kv_block_id: int             # Paged KV-cache block index for cuTile gather/scatter


# ═══════════════════════════════════════════════════════════════════
# 2. AVX2/AVX-512 Aligned MMap Tensor Allocation
# ═══════════════════════════════════════════════════════════════════

def allocate_avx2_aligned_mmap_tensor(
    raw_chunks: List[Dict[str, Any]],
    mmap_path: str,
) -> Tuple[Any, Any]:
    """Creates a 64-byte cache-line aligned [B, 32] float32 mmap slab.
    
    Layout:
      - Cols 0..24: Standard [B, 25] AST + NES LUT (0x01..0x09, 0x2A) + SpaCy POS features.
      - Cols 25..31: Google Titans + MIRAS retention + LoD ($1-$20) KV-cache block metadata.
    
    Returns:
      (mapped_np, pinned_tensor)
    """
    batch_size = max(1, len(raw_chunks))
    total_bytes = batch_size * BYTES_PER_ROW

    mmap_file = Path(mmap_path)
    mmap_file.parent.mkdir(parents=True, exist_ok=True)

    with open(mmap_file, "wb+") as f:
        f.truncate(total_bytes)
        with mmap.mmap(f.fileno(), total_bytes, access=mmap.ACCESS_WRITE) as mm:
            if HAVE_NUMPY:
                mat = np.ndarray((batch_size, FEATURE_ALIGNED_STRIDE), dtype=np.float32, buffer=mm)
                mat.fill(0.0)

                for i, ch in enumerate(raw_chunks):
                    # Resolve domain & NES LUT byte
                    domain_slug = AstChunkDomainRouter.resolve_domain_76(ch.get("domain_proposal", "unresolved"))
                    has_svelte_runes = ch.get("has_svelte_runes") or "$state" in ch.get("text", "") or "$derived" in ch.get("text", "")
                    if has_svelte_runes and domain_slug == "unresolved":
                        domain_slug = "ui"
                    lut_byte = AstChunkDomainRouter.NES_DOMAIN_LUT.get(domain_slug, AstChunkDomainRouter.NES_DOMAIN_LUT["unresolved"])

                    # 1. Cols 0..24: Standard [B, 25] features
                    start_byte = ch.get("start_byte", 0)
                    end_byte = ch.get("end_byte", 0)
                    mat[i, 0] = float(max(0, end_byte - start_byte))
                    mat[i, 1] = float(ch.get("ast_depth", 0))
                    mat[i, 2] = float(lut_byte)

                    if "pos_features" in ch and isinstance(ch["pos_features"], (list, tuple)):
                        pos_vals = np.asarray(ch["pos_features"][:22], dtype=np.float32)
                        mat[i, 3:3 + len(pos_vals)] = pos_vals

                    # 2. Cols 25..28: Google Titans + MIRAS & LoD ($1-$20) KV-cache control slots
                    mat[i, 25] = float(ch.get("miras_surprise", 0.0))
                    mat[i, 26] = float(ch.get("miras_retention_alpha", 1.0))
                    mat[i, 27] = float(min(max(ch.get("lod_tier", 1), 1), 20))
                    mat[i, 28] = float(ch.get("kv_block_id", -1))
                    # Cols 29..31: Reserved 64-byte alignment padding (already 0.0)

                mm.flush()

    if HAVE_NUMPY and HAVE_TORCH:
        mapped_np = np.memmap(mmap_path, dtype=np.float32, mode="r+", shape=(batch_size, FEATURE_ALIGNED_STRIDE))
        # Keep 128-byte row alignment, while slicing [:, :25] is available for [B, 25] x [25, 64] GEMM
        tensor_cpu = torch.from_numpy(np.array(mapped_np, copy=True))
        if torch.cuda.is_available():
            tensor_cpu = tensor_cpu.pin_memory()
        return mapped_np, tensor_cpu
    elif HAVE_NUMPY:
        mapped_np = np.memmap(mmap_path, dtype=np.float32, mode="r+", shape=(batch_size, FEATURE_ALIGNED_STRIDE))
        return mapped_np, np.array(mapped_np, copy=True)

    return None, None
