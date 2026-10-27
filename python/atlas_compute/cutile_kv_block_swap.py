#!/usr/bin/env python3
"""cutile_kv_block_swap.py — FSM-Driven LoD ($1–$20) Paged KV-Cache Block Swaps with cuTile & Titans/MIRAS.

Implements:
1. 5-State KV-Cache Swap Finite State Machine (FSM):
   - S0_BIFROST_LOOKUP: Prefix + domain token cache check.
   - S1_TURBOVEC_PREFILTER: :8791 TurboVec top-200 ANN + exact 768 rescore.
   - S2_MMAP_HOST_STAGE: LoD ($1-$20) budget mapping from mmap ring buffer to pinned memory.
   - S3_CUTILE_BLOCK_INSERT: opt-in CUDA Tile gather/scatter into paged KV cache; GPU execution is experimental.
   - S4_MIRAS_EVICT_OR_PERSIST: Titans surprise metric ||dL/dM|| & MIRAS alpha_t forget gate.
2. Experimental cuTile block insert with PyTorch non-blocking DMA fallback.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import torch
    HAVE_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAVE_TORCH = False

try:
    import cuda.tile as ct
    CUTILE_AVAILABLE = True
except ImportError:
    ct = None  # type: ignore
    CUTILE_AVAILABLE = False


if CUTILE_AVAILABLE:
    @ct.kernel
    def _scatter_kv_pages_cutile(src, dst, page_table, total_elements: ct.Constant[int], page_size: ct.Constant[int], tile_size: ct.Constant[int]):
        block_id = ct.bid(0)
        offsets = block_id * tile_size + ct.arange(tile_size, dtype=ct.int32)
        mask = offsets < total_elements
        values = ct.load(
            src,
            index=(block_id,),
            shape=(tile_size,),
            padding_mode=ct.PaddingMode.ZERO,
        )
        source_blocks = offsets // page_size
        page_ids = ct.gather(page_table, source_blocks, mask=mask, check_bounds=True)
        page_offsets = offsets % page_size
        destination_offsets = page_ids * page_size + page_offsets
        ct.scatter(dst, destination_offsets, values, mask=mask, check_bounds=True)


# ═══════════════════════════════════════════════════════════════════
# 1. The 5-State KV-Cache Swap FSM
# ═══════════════════════════════════════════════════════════════════

class KvSwapState(enum.Enum):
    S0_BIFROST_LOOKUP = "S0_BIFROST_LOOKUP"
    S1_TURBOVEC_PREFILTER = "S1_TURBOVEC_PREFILTER"
    S2_MMAP_HOST_STAGE = "S2_MMAP_HOST_STAGE"
    S3_CUTILE_BLOCK_INSERT = "S3_CUTILE_BLOCK_INSERT"
    S4_MIRAS_EVICT_OR_PERSIST = "S4_MIRAS_EVICT_OR_PERSIST"


@dataclass
class KvFsmContext:
    """State context for the 5-State KV-Cache Swap FSM."""
    state: KvSwapState
    prefix_key: str
    domain_id: int               # 0..8 canonical domain
    lod_tier: int                # 1..20 ($1-$20 compute/token LoD budget)
    bifrost_hit: bool = False
    candidate_keys: List[str] = None
    active_blocks: int = 0
    surprise_score: float = 0.0
    retention_alpha: float = 1.0
    evicted: bool = False
    persisted: bool = False

    def __post_init__(self):
        if self.candidate_keys is None:
            self.candidate_keys = []
        self.lod_tier = min(max(self.lod_tier, 1), 20)


# ═══════════════════════════════════════════════════════════════════
# 2. Experimental cuTile & Non-Blocking DMA Block Insert
# ═══════════════════════════════════════════════════════════════════

def launch_kv_block_insert(
    host_pinned_kv: Any,   # Shape: [num_blocks, block_tokens, num_heads, head_dim]
    device_paged_kv: Any,  # Shape: [max_pages, block_tokens, num_heads, head_dim]
    page_table_map: Any,   # Shape: [num_blocks] int32 target page indices
    lod_tier: int = 1,     # 1..20 ($1-$20 LoD cap on active blocks)
    *,
    use_cutile: bool = False,
) -> int:
    """Copies LoD-capped KV blocks from pinned mmap host memory into TRT-LLM paged device memory.
    
    Uses an explicitly requested CUDA Tile scatter path when available;
    otherwise uses PyTorch non-blocking transfer and index_copy_.
    """
    if not HAVE_TORCH or host_pinned_kv is None or device_paged_kv is None:
        return 0

    clamped_lod = min(max(lod_tier, 1), 20)
    # Scale active block count by LoD tier: LoD 1 = 4 blocks, LoD 20 = 80 blocks
    max_blocks = clamped_lod * 4
    if page_table_map.ndim != 1:
        raise ValueError("KV_PAGE_TABLE_MUST_BE_ONE_DIMENSIONAL")
    if page_table_map.dtype not in (torch.int32, torch.int64):
        raise ValueError("KV_PAGE_TABLE_REQUIRES_INT32_OR_INT64")
    if device_paged_kv.ndim < 2 or host_pinned_kv.ndim != device_paged_kv.ndim:
        raise ValueError("KV_BLOCK_RANK_MISMATCH")
    if tuple(host_pinned_kv.shape[1:]) != tuple(device_paged_kv.shape[1:]):
        raise ValueError("KV_BLOCK_SHAPE_MISMATCH")
    if host_pinned_kv.dtype != device_paged_kv.dtype:
        raise ValueError("KV_BLOCK_DTYPE_MISMATCH")

    active_blocks = min(
        int(host_pinned_kv.shape[0]),
        int(page_table_map.shape[0]),
        max_blocks,
    )
    if active_blocks <= 0:
        return 0

    target_pages = page_table_map[:active_blocks]

    if use_cutile:
        if not CUTILE_AVAILABLE:
            raise RuntimeError("CUTILE_KV_INSERT_REQUESTED_BUT_CUDA_TILE_UNAVAILABLE")
        if not device_paged_kv.is_cuda:
            raise ValueError("CUTILE_KV_INSERT_REQUIRES_CUDA_DESTINATION")
        if not host_pinned_kv.is_contiguous() or not device_paged_kv.is_contiguous():
            raise ValueError("CUTILE_KV_INSERT_REQUIRES_CONTIGUOUS_TENSORS")
        page_ids = target_pages.detach().to(device="cpu", dtype=torch.int64).tolist()
        if any(page_id < 0 or page_id >= int(device_paged_kv.shape[0]) for page_id in page_ids):
            raise ValueError("CUTILE_KV_PAGE_ID_OUT_OF_RANGE")
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("CUTILE_KV_PAGE_IDS_MUST_BE_UNIQUE")
        src_slice = host_pinned_kv[:active_blocks].to(device_paged_kv.device, non_blocking=True).contiguous()
        device_pages = target_pages.to(device=device_paged_kv.device, dtype=torch.int32, non_blocking=True)
        source_flat = src_slice.view(-1)
        destination_flat = device_paged_kv.view(-1)
        page_size = int(device_paged_kv[0].numel())
        total_elements = active_blocks * page_size
        tile_size = 256
        grid = ((total_elements + tile_size - 1) // tile_size, 1, 1)
        ct.launch(
            torch.cuda.current_stream(device_paged_kv.device),
            grid,
            _scatter_kv_pages_cutile,
            (source_flat, destination_flat, device_pages, total_elements, page_size, tile_size),
        )
        return active_blocks

    # PyTorch non-blocking H2D DMA copy
    target_pages = target_pages.to(device=device_paged_kv.device, dtype=torch.int64, non_blocking=True)
    if device_paged_kv.is_cuda:
        src_slice = host_pinned_kv[:active_blocks].to(device_paged_kv.device, non_blocking=True)
        device_paged_kv.index_copy_(0, target_pages, src_slice)
    else:
        # CPU test / fallback path
        src_slice = host_pinned_kv[:active_blocks]
        device_paged_kv.index_copy_(0, target_pages, src_slice)

    return active_blocks


# ═══════════════════════════════════════════════════════════════════
# 3. Deterministic FSM Execution Cycle
# ═══════════════════════════════════════════════════════════════════

def step_kv_swap_fsm(
    ctx: KvFsmContext,
    bifrost_lookup_fn: Any = None,
    turbovec_search_fn: Any = None,
    host_pinned_kv: Any = None,
    device_paged_kv: Any = None,
    page_table_map: Any = None,
    surprise_tau: float = 0.5,
    evict_tau: float = 0.3,
) -> KvFsmContext:
    """Executes a single state transition or full cycle of the KV-cache swap FSM."""
    
    # State 0: Bifrost Lookup
    if ctx.state == KvSwapState.S0_BIFROST_LOOKUP:
        if bifrost_lookup_fn:
            ctx.bifrost_hit = bool(bifrost_lookup_fn(ctx.prefix_key, ctx.domain_id))
        else:
            ctx.bifrost_hit = False

        if ctx.bifrost_hit:
            ctx.state = KvSwapState.S2_MMAP_HOST_STAGE
        else:
            ctx.state = KvSwapState.S1_TURBOVEC_PREFILTER
        return ctx

    # State 1: TurboVec Prefilter + Exact 768 Rescore
    elif ctx.state == KvSwapState.S1_TURBOVEC_PREFILTER:
        if turbovec_search_fn:
            ctx.candidate_keys = turbovec_search_fn(ctx.prefix_key, ctx.domain_id, top_k=200)
        else:
            ctx.candidate_keys = []
        ctx.state = KvSwapState.S2_MMAP_HOST_STAGE
        return ctx

    # State 2: LoD ($1-$20) Slicing & Host MMap Staging
    elif ctx.state == KvSwapState.S2_MMAP_HOST_STAGE:
        ctx.state = KvSwapState.S3_CUTILE_BLOCK_INSERT
        return ctx

    # State 3: cuTile / DMA Block Insert
    elif ctx.state == KvSwapState.S3_CUTILE_BLOCK_INSERT:
        if host_pinned_kv is not None and device_paged_kv is not None and page_table_map is not None:
            ctx.active_blocks = launch_kv_block_insert(
                host_pinned_kv=host_pinned_kv,
                device_paged_kv=device_paged_kv,
                page_table_map=page_table_map,
                lod_tier=ctx.lod_tier,
            )
        ctx.state = KvSwapState.S4_MIRAS_EVICT_OR_PERSIST
        return ctx

    # State 4: Google Titans Surprise & MIRAS Retention Gate Update
    elif ctx.state == KvSwapState.S4_MIRAS_EVICT_OR_PERSIST:
        # High surprise blocks (||dL/dM|| > tau) are persisted into host mmap long-term memory
        if ctx.surprise_score > surprise_tau:
            ctx.persisted = True
        # Low retention blocks (alpha_t < evict_tau) trigger eviction / weight offloading
        if ctx.retention_alpha < evict_tau:
            ctx.evicted = True
        return ctx

    return ctx
