#!/usr/bin/env python3
"""Pure-function tests for atlas_retrieval_canary_v1 (no database, no network)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from atlas_retrieval_canary_v1 import choose_k, receipt_checksum, receipt_to_rows, validate_receipt

RECEIPT = {
    "queries": 1000, "heldout_self_excluded": True, "corpus_rows": 219998, "errors": 0,
    "oracle": "in-process float32 cosine", "writesPerformed": False,
    "sidecar": {"indexed": 219998, "dim": 128, "bits": 4, "representationId": "embeddinggemma_mrl128_l2_4bit_v1",
                "source": "postgres", "projection": "mrl"},
    "results": [
        {"retrieve_k": 100, "recall_top10_after_exact_rescore": 0.9499, "mrr_exact_nn1": 0.6588, "p50_ms": 5.8, "p95_ms": 23.36},
        {"retrieve_k": 10, "recall_top10_after_exact_rescore": 0.5783, "mrr_exact_nn1": 0.6526, "p50_ms": 4.12, "p95_ms": 21.58},
        {"retrieve_k": 50, "recall_top10_after_exact_rescore": 0.899, "mrr_exact_nn1": 0.6586, "p50_ms": 5.08, "p95_ms": 24.78},
        {"retrieve_k": 150, "recall_top10_after_exact_rescore": 0.9654, "mrr_exact_nn1": 0.6588, "p50_ms": 6.67, "p95_ms": 23.95},
    ],
}


def mutated(**kw):
    r = dict(RECEIPT)
    r.update(kw)
    return r


class TestCanary(unittest.TestCase):
    def test_rows_are_ordered_and_sequence_ids_are_stable(self):
        rows = receipt_to_rows(RECEIPT, "turbovec-http-ann")
        self.assertEqual([r["sequence_id"] for r in rows],
                         ["turbovec-http-ann:k=10", "turbovec-http-ann:k=50", "turbovec-http-ann:k=100", "turbovec-http-ann:k=150"])
        self.assertEqual([r["sequence_no"] for r in rows], [0, 1, 2, 3])
        self.assertEqual(rows[2]["hyperparameters"]["dim"], 128)

    def test_choose_k_is_smallest_meeting_target(self):
        rows = receipt_to_rows(RECEIPT, "x")
        self.assertEqual(choose_k(rows, 0.90)["hyperparameters"]["retrieve_k"], 100)  # k=50 is 0.899
        self.assertEqual(choose_k(rows, 0.94)["hyperparameters"]["retrieve_k"], 100)
        self.assertEqual(choose_k(rows, 0.95)["hyperparameters"]["retrieve_k"], 150)  # k=100 is 0.9499
        self.assertIsNone(choose_k(rows, 0.99))

    def test_fail_closed_receipts(self):
        for bad in (mutated(writesPerformed=True), mutated(heldout_self_excluded=False), mutated(errors=3),
                    mutated(results=[]), {k: v for k, v in RECEIPT.items() if k != "sidecar"}):
            with self.assertRaises(ValueError):
                validate_receipt(bad)

    def test_recall_range_checked(self):
        bad = mutated(results=[{"retrieve_k": 10, "recall_top10_after_exact_rescore": 1.2}])
        with self.assertRaises(ValueError):
            validate_receipt(bad)

    def test_checksum_is_key_order_independent(self):
        reordered = dict(reversed(list(RECEIPT.items())))
        self.assertEqual(receipt_checksum(RECEIPT), receipt_checksum(reordered))


if __name__ == "__main__":
    unittest.main()
