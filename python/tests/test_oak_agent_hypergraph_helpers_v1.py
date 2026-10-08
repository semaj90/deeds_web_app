from __future__ import annotations

import unittest

from pydantic import ValidationError

from oak_agent.hypergraph_helpers_v1 import (
    AdmittedHypergraphFactV1,
    HypergraphParticipantV1,
    bounded_traverse_networkx_v1,
    build_incidence_snapshot_v1,
    build_networkx_incidence_graph_v1,
    compare_score_maps_v1,
)


SHA_A = "sha256:" + ("a" * 64)
SHA_B = "sha256:" + ("b" * 64)


def fact(
    fact_id: str,
    checksum: str,
    participants: tuple[HypergraphParticipantV1, ...],
) -> AdmittedHypergraphFactV1:
    return AdmittedHypergraphFactV1(
        fact_id=fact_id,
        fact_checksum=checksum,
        predicate="CALL_BEHAVIOR",
        participants=participants,
        evidence_refs=(f"evidence:{fact_id}",),
        workspace_revision="workspace:v1",
        ontology_revision="ontology:v1",
        policy_revision="policy:v1",
        producer_revision="grounded-nlp:v1",
    )


class OakHypergraphHelpersTests(unittest.TestCase):
    def test_snapshot_is_deterministic_under_fact_and_participant_reordering(self) -> None:
        p1 = HypergraphParticipantV1(
            canonical_id="symbol:a", role="caller", kind="symbol"
        )
        p2 = HypergraphParticipantV1(
            canonical_id="symbol:b", role="callee", kind="symbol"
        )
        a = fact("fact:1", SHA_A, (p1, p2))
        b = fact("fact:2", SHA_B, (p2, p1))

        left = build_incidence_snapshot_v1(
            (a, b),
            workspace_revision="workspace:v1",
            ontology_revision="ontology:v1",
            policy_revision="policy:v1",
        )
        right = build_incidence_snapshot_v1(
            (b, a),
            workspace_revision="workspace:v1",
            ontology_revision="ontology:v1",
            policy_revision="policy:v1",
        )

        self.assertEqual(left.snapshot_checksum, right.snapshot_checksum)
        self.assertEqual(left.node_ordinals, right.node_ordinals)
        self.assertEqual(left.incidence_rows, right.incidence_rows)
        self.assertFalse(left.canonical_authority)
        self.assertFalse(left.writes_performed)

    def test_revision_mismatch_fails_closed(self) -> None:
        p1 = HypergraphParticipantV1(
            canonical_id="symbol:a", role="caller", kind="symbol"
        )
        p2 = HypergraphParticipantV1(
            canonical_id="symbol:b", role="callee", kind="symbol"
        )
        value = fact("fact:1", SHA_A, (p1, p2))
        with self.assertRaisesRegex(ValueError, "WORKSPACE_REVISION_MISMATCH"):
            build_incidence_snapshot_v1(
                (value,),
                workspace_revision="workspace:other",
                ontology_revision="ontology:v1",
                policy_revision="policy:v1",
            )

    def test_duplicate_participant_role_row_is_rejected(self) -> None:
        p = HypergraphParticipantV1(
            canonical_id="symbol:a", role="caller", kind="symbol"
        )
        with self.assertRaises(ValidationError):
            fact("fact:1", SHA_A, (p, p))

    def test_bounded_traversal_is_deterministic(self) -> None:
        try:
            import networkx  # noqa: F401
        except Exception:
            self.skipTest("networkx not installed in this environment")

        a = fact(
            "fact:1",
            SHA_A,
            (
                HypergraphParticipantV1(
                    canonical_id="symbol:a", role="caller", kind="symbol"
                ),
                HypergraphParticipantV1(
                    canonical_id="symbol:b", role="callee", kind="symbol"
                ),
            ),
        )
        b = fact(
            "fact:2",
            SHA_B,
            (
                HypergraphParticipantV1(
                    canonical_id="symbol:b", role="caller", kind="symbol"
                ),
                HypergraphParticipantV1(
                    canonical_id="symbol:c", role="callee", kind="symbol"
                ),
            ),
        )
        snapshot = build_incidence_snapshot_v1(
            (a, b),
            workspace_revision="workspace:v1",
            ontology_revision="ontology:v1",
            policy_revision="policy:v1",
        )
        graph = build_networkx_incidence_graph_v1(snapshot)
        result = bounded_traverse_networkx_v1(
            graph,
            seed_keys=("entity:symbol:a",),
            max_hops=4,
            max_neighbors=32,
        )
        self.assertEqual(
            [(row.node_key, row.distance) for row in result.hits],
            [
                ("entity:symbol:a", 0),
                ("relation:fact:1", 1),
                ("entity:symbol:b", 2),
                ("relation:fact:2", 3),
                ("entity:symbol:c", 4),
            ],
        )

    def test_score_parity_records_delta_and_topk_overlap(self) -> None:
        parity = compare_score_maps_v1(
            {"a": 0.7, "b": 0.2, "c": 0.1},
            {"a": 0.69, "b": 0.21, "c": 0.10},
            top_k=2,
        )
        self.assertTrue(parity.keys_equal)
        self.assertAlmostEqual(parity.max_abs_delta, 0.01, places=8)
        self.assertEqual(parity.top_k_overlap, 1.0)


if __name__ == "__main__":
    unittest.main()
