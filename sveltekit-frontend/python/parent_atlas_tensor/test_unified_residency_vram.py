from __future__ import annotations

import unittest

import numpy as np
import torch

from parent_atlas_tensor.gpu_tile_cache import GpuTileCache


@unittest.skipUnless(torch.cuda.is_available(), "CUDA_REQUIRED_FOR_VRAM_PROOF")
class UnifiedResidencyVramTests(unittest.TestCase):
    def test_cuda_ceiling_evicts_and_reloads_without_overcommit(self) -> None:
        rows, dimensions = 512, 512
        tile = np.ones((rows, dimensions), dtype=np.float32)
        tile_bytes = tile.nbytes
        ceiling = tile_bytes * 4
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
        baseline_bytes = torch.cuda.memory_allocated()
        cache = GpuTileCache(max_bytes=ceiling, device="cuda")

        for index in range(8):
            cache.promote(f"vram:tile:{index}", tile)

        torch.cuda.synchronize()
        self.assertLessEqual(cache.bytes, ceiling)
        self.assertLessEqual(len(cache.tiles), 4)
        self.assertEqual(cache.bytes, tile_bytes * len(cache.tiles))
        self.assertTrue(cache.has("vram:tile:7"))
        self.assertFalse(cache.has("vram:tile:0"))

        cache.promote("vram:tile:0", tile)
        torch.cuda.synchronize()
        self.assertLessEqual(cache.bytes, ceiling)
        self.assertTrue(cache.has("vram:tile:0"))
        self.assertFalse(cache.has("vram:tile:1"))
        # The cache ceiling covers resident payload bytes. PyTorch may retain
        # allocator/staging overhead, so physical peak is checked against a
        # visible two-times bound rather than being conflated with cache.bytes.
        peak_delta = torch.cuda.max_memory_allocated() - baseline_bytes
        self.assertLessEqual(peak_delta, ceiling * 2)


if __name__ == "__main__":
    unittest.main()
