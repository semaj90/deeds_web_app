#!/usr/bin/env python3
"""Unit tests for AVX2/AVX-512 aligned mmap slab, Google Titans + MIRAS metadata, and 5-state KV swap FSM."""

import os
import tempfile
import unittest
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_compute.ast_chunk_routing_helpers_v2 import (
    allocate_avx2_aligned_mmap_tensor,
    FEATURE_ACTIVE_DIM,
    FEATURE_ALIGNED_STRIDE,
    BYTES_PER_ROW,
    MirasMemoryHeader,
    HAVE_TORCH,
    HAVE_NUMPY,
)
from atlas_compute.cutile_kv_block_swap import (
    KvSwapState,
    KvFsmContext,
    launch_kv_block_insert,
    step_kv_swap_fsm,
)


class TestAvx2CuTileMirasFsm(unittest.TestCase):

    def test_64byte_cache_line_geometry(self):
        # 32 floats * 4 bytes = 128 bytes = 2x 64-byte AVX-512 / 4x 32-byte AVX2
        self.assertEqual(FEATURE_ACTIVE_DIM, 25)
        self.assertEqual(FEATURE_ALIGNED_STRIDE, 32)
        self.assertEqual(BYTES_PER_ROW, 128)
        self.assertEqual(BYTES_PER_ROW % 64, 0)

    def test_avx2_aligned_mmap_allocation(self):
        raw_chunks = [
            {
                "source_ref": "src/routes/api/auth/+server.ts",
                "start_byte": 0,
                "end_byte": 400,
                "domain_proposal": "auth",
                "miras_surprise": 0.85,
                "miras_retention_alpha": 0.95,
                "lod_tier": 5,
                "kv_block_id": 42,
            },
            {
                "source_ref": "src/components/Counter.svelte",
                "start_byte": 410,
                "end_byte": 900,
                "domain_proposal": "ui",
                "has_svelte_runes": True,
                "miras_surprise": 0.12,
                "miras_retention_alpha": 0.25,
                "lod_tier": 18,
                "kv_block_id": 99,
            },
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            mmap_path = os.path.join(tmpdir, "aligned_slab.f32bin")
            mapped_np, pinned_tensor = allocate_avx2_aligned_mmap_tensor(raw_chunks, mmap_path)

            file_size = os.path.getsize(mmap_path)
            self.assertEqual(file_size, 2 * BYTES_PER_ROW)  # 256 bytes

            if HAVE_NUMPY:
                self.assertEqual(mapped_np.shape, (2, 32))
                # Row 0: Auth chunk
                self.assertEqual(mapped_np[0, 0], 400.0)      # Span length
                self.assertEqual(mapped_np[0, 2], 0.0)        # NES LUT: unresolved (no crosswalk supplied; aliases are no longer inferred)
                self.assertAlmostEqual(mapped_np[0, 25], 0.85, places=4) # MIRAS surprise
                self.assertAlmostEqual(mapped_np[0, 26], 0.95, places=4) # MIRAS alpha
                self.assertEqual(mapped_np[0, 27], 5.0)       # LoD tier 5
                self.assertEqual(mapped_np[0, 28], 42.0)      # kv_block_id 42

                # Row 1: Svelte runes chunk
                self.assertEqual(mapped_np[1, 2], 2.0)        # Domain lutByte: ui = 0x02
                self.assertAlmostEqual(mapped_np[1, 25], 0.12, places=4)
                self.assertEqual(mapped_np[1, 27], 18.0)      # LoD tier 18
                self.assertEqual(mapped_np[1, 28], 99.0)

            if HAVE_TORCH and pinned_tensor is not None:
                import torch
                self.assertIsInstance(pinned_tensor, torch.Tensor)
                self.assertEqual(pinned_tensor.shape, (2, 32))
                # Slicing the active 25 columns preserves GEMM compatibility
                gemm_input = pinned_tensor[:, :FEATURE_ACTIVE_DIM]
                self.assertEqual(gemm_input.shape, (2, 25))

            # Explicitly close and release mmap handles for Windows file locking
            del mapped_np
            del pinned_tensor
            import gc
            gc.collect()

    def test_5state_kv_swap_fsm_bifrost_hit(self):
        ctx = KvFsmContext(
            state=KvSwapState.S0_BIFROST_LOOKUP,
            prefix_key="auth_session_token",
            domain_id=0,  # auth
            lod_tier=5,
            surprise_score=0.9,
            retention_alpha=0.95,
        )

        # Mock Bifrost returning a cache hit
        ctx = step_kv_swap_fsm(ctx, bifrost_lookup_fn=lambda p, d: True)
        self.assertEqual(ctx.state, KvSwapState.S2_MMAP_HOST_STAGE)
        self.assertTrue(ctx.bifrost_hit)

        # Advance to S3
        ctx = step_kv_swap_fsm(ctx)
        self.assertEqual(ctx.state, KvSwapState.S3_CUTILE_BLOCK_INSERT)

        # Advance to S4 (without tensor insert)
        ctx = step_kv_swap_fsm(ctx)
        self.assertEqual(ctx.state, KvSwapState.S4_MIRAS_EVICT_OR_PERSIST)

        # Execute S4: High surprise score (0.9 > 0.5) -> persisted
        ctx = step_kv_swap_fsm(ctx, surprise_tau=0.5, evict_tau=0.3)
        self.assertTrue(ctx.persisted)
        self.assertFalse(ctx.evicted)

    def test_5state_kv_swap_fsm_turbovec_miss_eviction(self):
        ctx = KvFsmContext(
            state=KvSwapState.S0_BIFROST_LOOKUP,
            prefix_key="unknown_query_pattern",
            domain_id=2,  # retrieval
            lod_tier=2,
            surprise_score=0.1,
            retention_alpha=0.15,  # Low retention -> should evict
        )

        # Mock Bifrost returning a cache miss
        ctx = step_kv_swap_fsm(ctx, bifrost_lookup_fn=lambda p, d: False)
        self.assertEqual(ctx.state, KvSwapState.S1_TURBOVEC_PREFILTER)
        self.assertFalse(ctx.bifrost_hit)

        # Mock TurboVec search
        ctx = step_kv_swap_fsm(ctx, turbovec_search_fn=lambda p, d, top_k: ["cand_1", "cand_2"])
        self.assertEqual(ctx.state, KvSwapState.S2_MMAP_HOST_STAGE)
        self.assertEqual(ctx.candidate_keys, ["cand_1", "cand_2"])

        # Advance to S3, then S4
        ctx = step_kv_swap_fsm(ctx)
        ctx = step_kv_swap_fsm(ctx)
        self.assertEqual(ctx.state, KvSwapState.S4_MIRAS_EVICT_OR_PERSIST)

        # S4: Low retention (0.15 < 0.3) -> evicted
        ctx = step_kv_swap_fsm(ctx, surprise_tau=0.5, evict_tau=0.3)
        self.assertFalse(ctx.persisted)
        self.assertTrue(ctx.evicted)

    def test_launch_kv_block_insert_lod_scaling(self):
        if not HAVE_TORCH:
            self.skipTest("PyTorch not installed")

        import torch
        # Host: 100 blocks, 16 tokens, 4 heads, 64 dim
        host_kv = torch.randn(100, 16, 4, 64, dtype=torch.float32)
        device_kv = torch.zeros(128, 16, 4, 64, dtype=torch.float32)
        page_map = torch.arange(100, dtype=torch.int64)

        # LoD 1: capped at 1 * 4 = 4 blocks
        copied_lod1 = launch_kv_block_insert(host_kv, device_kv, page_map, lod_tier=1)
        self.assertEqual(copied_lod1, 4)

        # LoD 10: capped at 10 * 4 = 40 blocks
        copied_lod10 = launch_kv_block_insert(host_kv, device_kv, page_map, lod_tier=10)
        self.assertEqual(copied_lod10, 40)

        # LoD 20: capped at 20 * 4 = 80 blocks
        copied_lod20 = launch_kv_block_insert(host_kv, device_kv, page_map, lod_tier=20)
        self.assertEqual(copied_lod20, 80)


if __name__ == "__main__":
    unittest.main()
