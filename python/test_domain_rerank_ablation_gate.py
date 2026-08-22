from __future__ import annotations

import hashlib
import unittest

from atlas_compute.domain_rerank_ablation import FrozenDomainAblationRow
from atlas_compute.domain_rerank_ablation_gate import validate_ablation_proof_input


def checksum(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def row(qid: str, packet: str, *, eligible: bool, comparison: str | None = None) -> FrozenDomainAblationRow:
    return FrozenDomainAblationRow(
        qid=qid,
        packet_key=packet,
        label=1.0 if packet.endswith("a") else 0.0,
        baseline_features={"bm25": 0.4, "dense": 0.7},
        domain_class_match=1.0 if eligible else None,
        domain_match_eligible=eligible,
        comparison_checksum=comparison or checksum(f"{qid}:{packet}"),
        lineage_status="PROVEN" if eligible else "DOMAIN_FACT_AMBIGUOUS",
    )


class DomainRerankAblationGateTest(unittest.TestCase):
    def test_rejects_non_sha256_comparison_receipt(self) -> None:
        rows = [
            row("q1", "q1-a", eligible=True, comparison="not-a-checksum"),
            row("q1", "q1-b", eligible=False),
            row("q2", "q2-a", eligible=True),
            row("q2", "q2-b", eligible=False),
        ]
        with self.assertRaisesRegex(ValueError, "must be sha256"):
            validate_ablation_proof_input(rows, seed=42, validation_fraction=0.5)

    def test_requires_eligible_evidence_in_both_qid_partitions(self) -> None:
        rows = [
            row("q1", "q1-a", eligible=False),
            row("q1", "q1-b", eligible=False),
            row("q2", "q2-a", eligible=False),
            row("q2", "q2-b", eligible=False),
        ]
        with self.assertRaisesRegex(ValueError, "no lineage-qualified"):
            validate_ablation_proof_input(rows, seed=42, validation_fraction=0.5)

    def test_accepts_disjoint_qid_partitions_with_real_evidence(self) -> None:
        rows = []
        for qid in ("q1", "q2", "q3", "q4"):
            rows.extend([
                row(qid, f"{qid}-a", eligible=True),
                row(qid, f"{qid}-b", eligible=False),
            ])
        train, validation = validate_ablation_proof_input(rows, seed=42, validation_fraction=0.5)
        self.assertTrue(train)
        self.assertTrue(validation)
        self.assertTrue(train.isdisjoint(validation))


if __name__ == "__main__":
    unittest.main()
