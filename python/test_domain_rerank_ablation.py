from __future__ import annotations

import unittest

import numpy as np

from atlas_compute.domain_rerank_ablation import (
    FrozenDomainAblationRow,
    dataset_checksum,
    evaluate_grouped_predictions,
    parse_frozen_row,
    split_qids,
    validate_frozen_rows,
)


def row(
    qid: str,
    packet: str,
    label: float,
    match: float | None,
    *,
    eligible: bool,
    lineage: str = "PROVEN",
) -> FrozenDomainAblationRow:
    return parse_frozen_row(
        {
            "qid": qid,
            "packet_key": packet,
            "label": label,
            "baseline_features": {"dense": 0.7, "bm25": 0.4},
            "domain_class_match": match,
            "domain_match_eligible": eligible,
            "comparison_checksum": f"cmp-{qid}-{packet}",
            "lineage_status": lineage,
        }
    )


class DomainRerankAblationTest(unittest.TestCase):
    def test_missing_domain_match_stays_missing(self) -> None:
        parsed = row("q1", "p1", 1.0, None, eligible=False, lineage="DOMAIN_FACT_AMBIGUOUS")
        self.assertIsNone(parsed.domain_class_match)
        self.assertFalse(parsed.domain_match_eligible)

    def test_eligible_requires_proven_lineage_and_numeric_match(self) -> None:
        with self.assertRaisesRegex(ValueError, "numeric domain_class_match"):
            row("q1", "p1", 1.0, None, eligible=True)
        with self.assertRaisesRegex(ValueError, "PROVEN lineage_status"):
            row("q1", "p1", 1.0, 1.0, eligible=True, lineage="DOMAIN_FACT_AMBIGUOUS")

    def test_baseline_cannot_precontain_domain_feature(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not already contain"):
            parse_frozen_row(
                {
                    "qid": "q1",
                    "packet_key": "p1",
                    "label": 1,
                    "baseline_features": {"dense": 0.5, "domain_class_match": 1},
                    "domain_class_match": 1,
                    "domain_match_eligible": True,
                    "comparison_checksum": "cmp",
                    "lineage_status": "PROVEN",
                }
            )

    def test_qid_groups_require_consistent_feature_schema_and_two_candidates(self) -> None:
        rows = [
            row("q1", "p1", 1, 1, eligible=True),
            row("q1", "p2", 0, 0, eligible=True),
            row("q2", "p3", 1, 1, eligible=True),
            row("q2", "p4", 0, None, eligible=False, lineage="DOMAIN_FACT_MISSING"),
        ]
        self.assertEqual(validate_frozen_rows(rows), ["bm25", "dense"])

        with self.assertRaisesRegex(ValueError, "at least two candidates"):
            validate_frozen_rows(rows[:-1])

    def test_split_is_qid_disjoint_and_deterministic(self) -> None:
        rows = []
        for qid in ("q1", "q2", "q3", "q4", "q5"):
            rows.extend([
                row(qid, f"{qid}-a", 1, 1, eligible=True),
                row(qid, f"{qid}-b", 0, 0, eligible=True),
            ])
        first = split_qids(rows, seed=17, validation_fraction=0.4)
        second = split_qids(list(reversed(rows)), seed=17, validation_fraction=0.4)
        self.assertEqual(first, second)
        self.assertTrue(first[0].isdisjoint(first[1]))
        self.assertEqual(first[0] | first[1], {"q1", "q2", "q3", "q4", "q5"})

    def test_metrics_group_by_qid_and_tie_break_is_stable(self) -> None:
        rows = [
            row("q1", "a", 1, 1, eligible=True),
            row("q1", "b", 0, 0, eligible=True),
            row("q2", "a", 0, 0, eligible=True),
            row("q2", "b", 1, 1, eligible=True),
        ]
        metrics = evaluate_grouped_predictions(rows, np.asarray([0.9, 0.1, 0.1, 0.9]), k=2)
        self.assertEqual(metrics.query_count, 2)
        self.assertAlmostEqual(metrics.ndcg_at_k, 1.0)
        self.assertAlmostEqual(metrics.mrr_at_k, 1.0)

    def test_dataset_checksum_is_order_independent_but_lineage_sensitive(self) -> None:
        rows = [
            row("q1", "p1", 1, 1, eligible=True),
            row("q1", "p2", 0, 0, eligible=True),
            row("q2", "p3", 1, None, eligible=False, lineage="DOMAIN_FACT_MISSING"),
            row("q2", "p4", 0, 0, eligible=True),
        ]
        self.assertEqual(dataset_checksum(rows), dataset_checksum(list(reversed(rows))))

        changed = list(rows)
        changed[0] = FrozenDomainAblationRow(
            **{**changed[0].__dict__, "comparison_checksum": "changed"}
        )
        self.assertNotEqual(dataset_checksum(rows), dataset_checksum(changed))


if __name__ == "__main__":
    unittest.main()
