from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

from atlas_compute.qdrant_scoped_ann_strict import evaluate_qdrant_scoped_ann_strict


class QdrantScopedAnnStrictTests(unittest.TestCase):
    def test_mean_can_pass_while_worst_query_blocks_hnsw(self) -> None:
        semantic = np.asarray(
            [[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [-1.0, 0.0]],
            dtype=np.float32,
        )
        canonical_ids = ["a", "b", "c", "d"]
        exact_reference = SimpleNamespace(hits=[
            [
                SimpleNamespace(canonical_id="a", ordinal=0),
                SimpleNamespace(canonical_id="b", ordinal=1),
                SimpleNamespace(canonical_id="c", ordinal=2),
            ],
            [
                SimpleNamespace(canonical_id="b", ordinal=1),
                SimpleNamespace(canonical_id="a", ordinal=0),
                SimpleNamespace(canonical_id="c", ordinal=2),
            ],
        ])
        exact_responses = iter([
            (["b", "c"], 1.0),  # overlap 1.0
            (["a", "d"], 1.0),  # overlap 0.5
        ])
        calls: list[bool] = []

        def fake_query(**kwargs):
            exact = bool(kwargs["exact"])
            calls.append(exact)
            if not exact:
                raise AssertionError("HNSW MUST NOT RUN WHEN WORST EXACT QUERY MISSES FLOOR")
            return next(exact_responses)

        with (
            patch("atlas_compute.qdrant_scoped_ann_strict._collection_vector_config", return_value=(2, "Cosine")),
            patch("atlas_compute.qdrant_scoped_ann_strict.exact_semantic_search", return_value=exact_reference),
            patch("atlas_compute.qdrant_scoped_ann_strict._query", side_effect=fake_query),
        ):
            receipt = evaluate_qdrant_scoped_ann_strict(
                semantic,
                canonical_ids,
                [0, 1],
                metric="cosine",
                k=2,
                qdrant={
                    "collection": "fixture",
                    "comparison_scope": "snapshot_subset",
                    "minimum_exact_overlap_at_k": 0.75,
                    "minimum_recall_at_k": 0.95,
                    "hnsw_ef": [32, 64],
                },
            )

        self.assertEqual(receipt.pytorch_qdrant_exact_mean_overlap_at_k, 0.75)
        self.assertEqual(receipt.pytorch_qdrant_exact_minimum_query_overlap_at_k, 0.5)
        self.assertEqual(receipt.exact_alignment_status, "EXACT_STORE_MISMATCH")
        self.assertEqual(receipt.recommendation_status, "BLOCKED_EXACT_STORE_MISMATCH")
        self.assertEqual(receipt.sweep, [])
        self.assertEqual(calls, [True, True])


if __name__ == "__main__":
    unittest.main()
