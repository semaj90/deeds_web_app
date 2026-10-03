from __future__ import annotations

import hashlib
import json
import unittest

import numpy as np
import torch

from parent_atlas_tensor.gpu_tile_cache import GpuTileCache


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def _matrix(rows: int, dims: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal((rows, dims)).astype(np.float32)


def _cpu_exact_topk(matrix: np.ndarray, query: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    normalized_matrix = matrix / np.linalg.norm(matrix, axis=1, keepdims=True)
    normalized_query = query / np.linalg.norm(query)
    scores = normalized_matrix @ normalized_query
    indices = np.argsort(-scores, kind="stable")[:k]
    return indices, scores[indices]


def _result_checksum(indices: np.ndarray, scores: np.ndarray) -> str:
    payload = {
        "indices": indices.astype(np.int64).tolist(),
        "scores": np.asarray(scores, dtype=np.float32).round(6).tolist(),
    }
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()


class UnifiedResidencyParityTests(unittest.TestCase):
    def test_same_corpus_cpu_and_pytorch_simt_match_and_replay(self) -> None:
        matrix = _matrix(257, 48, seed=20260914)
        query = _matrix(1, 48, seed=20260915)[0]
        k = 9
        cpu_indices, cpu_scores = _cpu_exact_topk(matrix, query, k)

        cache = GpuTileCache(max_bytes=matrix.nbytes * 2, device=DEVICE)
        cache.promote("parity:feature-tile", matrix)
        simt_indices, simt_scores = cache.exact_cosine("parity:feature-tile", query, k)
        replay_indices, replay_scores = cache.exact_cosine("parity:feature-tile", query, k)

        self.assertTrue(np.array_equal(simt_indices, cpu_indices))
        self.assertTrue(np.array_equal(replay_indices, simt_indices))
        self.assertLess(float(np.max(np.abs(simt_scores - cpu_scores))), 1e-5)
        self.assertLess(float(np.max(np.abs(replay_scores - simt_scores))), 1e-7)
        self.assertEqual(_result_checksum(cpu_indices, cpu_scores), _result_checksum(simt_indices, simt_scores))
        self.assertEqual(_result_checksum(simt_indices, simt_scores), _result_checksum(replay_indices, replay_scores))

    def test_mismatched_query_dimension_fails_before_scoring(self) -> None:
        matrix = _matrix(8, 16, seed=1)
        cache = GpuTileCache(max_bytes=matrix.nbytes * 2, device=DEVICE)
        cache.promote("parity:dimension", matrix)
        with self.assertRaises((RuntimeError, ValueError)):
            cache.exact_cosine("parity:dimension", _matrix(1, 15, seed=2)[0], 3)


if __name__ == "__main__":
    unittest.main()
