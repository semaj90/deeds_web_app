"""Unit tests for Top-K paginator in atlas_compute, covering CPU and PyTorch tie parity."""

from __future__ import annotations

import math
import unittest
import torch
from atlas_compute.topk_paginator import stable_topk, topk_paginate


class TestTopKPaginator(unittest.TestCase):
    def test_basic_pagination(self) -> None:
        scores = torch.tensor([0.1, 0.9, 0.4, 0.8, 0.3, 0.7, 0.2, 0.6, 0.5])

        # Page 1: k=3, offset=0 -> top scores should be [0.9, 0.8, 0.7] (indices [1, 3, 5])
        page1 = topk_paginate(scores, k=3, offset=0)
        self.assertEqual(len(page1.indices), 3)
        self.assertTrue(torch.allclose(page1.scores, torch.tensor([0.9, 0.8, 0.7])))
        self.assertTrue(torch.equal(page1.indices, torch.tensor([1, 3, 5])))
        self.assertEqual(page1.total_candidates, 9)
        self.assertTrue(page1.has_more)

        # Page 2: k=3, offset=3 -> next scores [0.6, 0.5, 0.4] (indices [7, 8, 2])
        page2 = topk_paginate(scores, k=3, offset=3)
        self.assertEqual(len(page2.indices), 3)
        self.assertTrue(torch.allclose(page2.scores, torch.tensor([0.6, 0.5, 0.4])))
        self.assertTrue(torch.equal(page2.indices, torch.tensor([7, 8, 2])))
        self.assertTrue(page2.has_more)

        # Page 3: k=3, offset=6 -> final scores [0.3, 0.2, 0.1] (indices [4, 6, 0])
        page3 = topk_paginate(scores, k=3, offset=6)
        self.assertEqual(len(page3.indices), 3)
        self.assertTrue(torch.allclose(page3.scores, torch.tensor([0.3, 0.2, 0.1])))
        self.assertFalse(page3.has_more)

    def test_out_of_bounds_offset(self) -> None:
        scores = torch.tensor([1.0, 2.0, 3.0])
        res = topk_paginate(scores, k=5, offset=10)
        self.assertEqual(len(res.indices), 0)
        self.assertFalse(res.has_more)

    def test_invalid_arguments_raise(self) -> None:
        scores = torch.randn(5, 5)  # 2D raises
        with self.assertRaises(ValueError):
            topk_paginate(scores, k=2)

        scores_1d = torch.randn(10)
        with self.assertRaises(ValueError):
            topk_paginate(scores_1d, k=0)
        with self.assertRaises(ValueError):
            topk_paginate(scores_1d, k=5, offset=-1)

    def test_non_finite_scores_raise(self) -> None:
        # Non-finite in tensor
        with self.assertRaises(ValueError):
            topk_paginate(torch.tensor([1.0, float("nan"), 3.0]), k=2)
        with self.assertRaises(ValueError):
            topk_paginate(torch.tensor([1.0, float("inf"), 3.0]), k=2)

        # Non-finite in stable_topk
        with self.assertRaises(ValueError):
            stable_topk([{"canonicalId": "a", "score": float("nan"), "candidateOrdinal": 1}], k=1)
        with self.assertRaises(ValueError):
            stable_topk([{"canonicalId": "a", "score": float("-inf"), "candidateOrdinal": 1}], k=1)

    def test_stable_topk_deterministic_tie_breaking(self) -> None:
        """Verify strict SCORE_DESC_ORDINAL_ASC_ID_ASC ordering."""
        candidates = [
            {"canonicalId": "c_dup2", "candidateOrdinal": 2, "score": 0.50},
            {"canonicalId": "c_dup1", "candidateOrdinal": 1, "score": 0.50},
            {"canonicalId": "c_high", "candidateOrdinal": 5, "score": 0.90},
            {"canonicalId": "c_tie_b", "candidateOrdinal": 1, "score": 0.50},  # same score, same ordinal -> id comparison
            {"canonicalId": "c_tie_a", "candidateOrdinal": 1, "score": 0.50},  # "c_tie_a" < "c_tie_b"
            {"canonicalId": "c_low", "candidateOrdinal": 0, "score": 0.10},
        ]

        result = stable_topk(candidates, k=5, offset=0)
        self.assertEqual(result["schema"], "atlas.topk.v1")
        self.assertEqual(result["order"], "SCORE_DESC_ORDINAL_ASC_ID_ASC")
        self.assertEqual(result["totalCandidates"], 6)
        self.assertTrue(result["hasMore"])

        ordered_ids = [c["canonicalId"] for c in result["candidates"]]
        # Expected:
        # 1. c_high (score 0.90)
        # Ties at score 0.50:
        # 2. c_dup1, c_tie_a, c_tie_b all have ordinal 1 -> sorted by ID: c_dup1, c_tie_a, c_tie_b
        # 3. c_dup2 has ordinal 2
        self.assertEqual(ordered_ids, ["c_high", "c_dup1", "c_tie_a", "c_tie_b", "c_dup2"])

    def test_stable_topk_heap_eviction_on_ties(self) -> None:
        """Bounded heap of capacity 2 must evict worse candidates on ties."""
        candidates = [
            {"canonicalId": "zebra", "candidateOrdinal": 10, "score": 0.50},
            {"canonicalId": "banana", "candidateOrdinal": 2, "score": 0.50},
            {"canonicalId": "apple", "candidateOrdinal": 1, "score": 0.50},
        ]
        result = stable_topk(candidates, k=2, offset=0)
        self.assertEqual(len(result["candidates"]), 2)
        # Should keep apple (ord 1) and banana (ord 2), evicting zebra (ord 10)
        self.assertEqual([c["canonicalId"] for c in result["candidates"]], ["apple", "banana"])

    def test_tensor_boundary_tie_resolution(self) -> None:
        """topk_paginate resolves cutoff ties deterministically with ordinals."""
        # 4 items with equal score 0.5, but different ordinals [3, 1, 4, 2]
        scores = torch.tensor([0.5, 0.5, 0.5, 0.5, 0.9])
        ordinals = torch.tensor([3, 1, 4, 2, 0])
        cids = ["id_3", "id_1", "id_4", "id_2", "id_top"]

        # Request top 3
        # Index 4 (id_top) has score 0.9.
        # Boundary at score 0.5 has ties: ordinals 1 (id_1) and 2 (id_2) should be selected!
        res = topk_paginate(scores, k=3, offset=0, ordinals=ordinals, canonical_ids=cids)
        self.assertEqual(len(res.indices), 3)
        self.assertEqual(res.indices.tolist(), [4, 1, 3])  # 4 is score 0.9; 1 is ord 1; 3 is ord 2
        self.assertTrue(torch.allclose(res.scores, torch.tensor([0.9, 0.5, 0.5])))


if __name__ == "__main__":
    unittest.main()
