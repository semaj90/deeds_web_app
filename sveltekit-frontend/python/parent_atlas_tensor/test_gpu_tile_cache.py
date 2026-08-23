from __future__ import annotations

import unittest

import numpy as np
import torch

from parent_atlas_tensor.gpu_tile_cache import GpuTileCache

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def _matrix(rows: int, dims: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.standard_normal((rows, dims)).astype(np.float32)


class TestGpuTileCache(unittest.TestCase):
    def test_exact_cosine_matches_cpu_oracle(self) -> None:
        rows, dims, k = 64, 32, 5
        matrix = _matrix(rows, dims, seed=1)
        query = _matrix(1, dims, seed=2)[0]

        cache = GpuTileCache(max_bytes=matrix.nbytes * 4, device=DEVICE)
        cache.promote("tile:a", matrix)
        gpu_idx, gpu_vals = cache.exact_cosine("tile:a", query, k)

        qn = query / np.linalg.norm(query)
        mn = matrix / np.linalg.norm(matrix, axis=1, keepdims=True)
        scores = mn @ qn
        cpu_idx = np.argsort(-scores)[:k]

        self.assertTrue(np.array_equal(gpu_idx, cpu_idx))
        self.assertLess(float(np.max(np.abs(gpu_vals - scores[cpu_idx]))), 1e-5)

    def test_naive_descending_promotion_evicts_highest_utility_tile(self) -> None:
        """Regression guard for the failure mode in
        docs/reports/tensor-residency-gate-t4-proof-2026-08-23.json: promoting
        tiles in ACE's natural utility-descending order via plain promote()
        keeps the LOWEST-utility tiles resident, not the highest. This test
        pins the (undesirable but real) LRU behavior down so a future change
        to promote()'s semantics doesn't silently drift without a test
        noticing either way.
        """
        bytes_per_tile = _matrix(8, 16, seed=0).nbytes
        cache = GpuTileCache(max_bytes=int(bytes_per_tile * 2.5), device=DEVICE)

        # "highest" .. "lowest" utility, promoted in that (naive) order.
        for i, key in enumerate(["highest", "mid", "lowest"]):
            cache.promote(f"tile:{key}", _matrix(8, 16, seed=i))

        resident = set(cache.tiles.keys())
        self.assertEqual(resident, {"tile:mid", "tile:lowest"})
        self.assertNotIn("tile:highest", resident)

    def test_promote_ranked_keeps_highest_utility_tiles_resident(self) -> None:
        bytes_per_tile = _matrix(8, 16, seed=0).nbytes
        cache = GpuTileCache(max_bytes=int(bytes_per_tile * 2.5), device=DEVICE)

        ranked_descending_utility = [
            ("tile:highest", _matrix(8, 16, seed=0)),
            ("tile:mid", _matrix(8, 16, seed=1)),
            ("tile:lowest", _matrix(8, 16, seed=2)),
        ]
        cache.promote_ranked(ranked_descending_utility)

        resident = set(cache.tiles.keys())
        self.assertEqual(resident, {"tile:highest", "tile:mid"})
        self.assertNotIn("tile:lowest", resident)


if __name__ == "__main__":
    unittest.main()
