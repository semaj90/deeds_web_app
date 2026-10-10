from __future__ import annotations

import unittest

from atlas_semantic_ontology_projection import (
    NarySemanticRelation,
    RelationParticipant,
    SemanticAssertion,
    build_networkx_projection,
)
from parent_atlas_ontology.networkx_snapshot import (
    bounded_bfs_receipt,
    build_networkx_snapshot,
    node_link_roundtrip_receipt,
    bounded_incidence_jaccard,
    bounded_role_aware_incidence_expansion_receipt,
    replay_networkx_snapshot,
)


class NetworkXSnapshotReplayTests(unittest.TestCase):
    def _fixture(self):
        assertion = SemanticAssertion(
            subject_id="symbol:a", predicate="calls", object_value="symbol:b",
            object_kind="ENTITY", source_ref="src/a.ts", source_revision="rev-1",
            observation_kind="AST_FACT", tree_node_id="tree:1", producer_revision="ts:r1",
        )
        relation = NarySemanticRelation(
            relation_id="rel:1", relation_type="AUTHORIZED", source_ref="src/policy.ts",
            source_revision="rev-1", participants=(
                RelationParticipant("symbol:a", "actor", 0),
                RelationParticipant("symbol:b", "target", 1),
            ), producer_revision="atlas:r1",
        )
        return (assertion,), (relation,)

    def test_replay_is_identical_and_nary_relation_is_reified(self):
        assertions, relations = self._fixture()
        first = build_networkx_snapshot(assertions, relations, graph_revision="graph:1")
        receipt = replay_networkx_snapshot(assertions, relations, graph_revision="graph:1")
        self.assertTrue(receipt["replay_identical"])
        self.assertEqual(receipt["status"], "NETWORKX_PROJECTION_PROVEN")
        self.assertFalse(receipt["canonical_authority"])
        self.assertFalse(receipt["writes_performed"])
        self.assertEqual(first["graph_ordinal_map_checksum"], receipt["graph_ordinal_map_checksum"])
        self.assertEqual(sum(row["attributes"].get("node_kind") == "NARY_RELATION" for row in first["nodes"]), 1)
        self.assertEqual(len(first["edges"]), 3)

    def test_bounded_bfs_is_revision_bound_and_reconstructable(self):
        assertions, relations = self._fixture()
        receipt = bounded_bfs_receipt(assertions, relations, graph_revision="graph:1", source_node_id="relation:rel:1", depth_limit=1)
        self.assertEqual(receipt["depth_limit"], 1)
        self.assertEqual(len(receipt["reachable_ordinals"]), 3)
        self.assertTrue(all(value is not None for key, value in receipt["predecessors"].items() if key != str(receipt["source_graph_ordinal"])))
        self.assertFalse(receipt["canonical_authority"])
        self.assertFalse(receipt["writes_performed"])

    def test_node_link_json_roundtrip_preserves_projection_checksums(self):
        assertions, relations = self._fixture()
        receipt = node_link_roundtrip_receipt(assertions, relations, graph_revision="graph:1")
        self.assertEqual(receipt["status"], "NETWORKX_NODE_LINK_ROUNDTRIP_PROVEN")
        self.assertTrue(all(receipt["checks"].values()))
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])

    def test_bounded_incidence_jaccard_does_not_materialize_cliques(self):
        assertions, relations = self._fixture()
        graph = build_networkx_projection(assertions, relations)
        receipt = bounded_incidence_jaccard(graph, graph_revision="graph:1", max_pairs=1)
        self.assertEqual(receipt["algorithm"], "bounded_shared_relation_neighborhood_jaccard")
        self.assertEqual(receipt["graphRevision"], "graph:1")
        self.assertTrue(receipt["projectionChecksum"])
        self.assertTrue(receipt["ordinalMapChecksum"])
        self.assertEqual(receipt["candidatePairCount"], 1)
        self.assertEqual(receipt["results"][0]["jaccard"], 1.0)
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])

    def test_role_aware_expansion_preserves_relation_and_participant_roles(self):
        assertions, relations = self._fixture()
        receipt = bounded_role_aware_incidence_expansion_receipt(
            relations,
            graph_revision="graph:1",
            source_entity_id="symbol:a",
            depth_limit=1,
        )
        self.assertEqual(receipt["status"], "NETWORKX_INCIDENCE_TRAVERSAL_PROVEN")
        self.assertEqual(receipt["expandedRelationCount"], 1)
        self.assertEqual(receipt["steps"][0]["sourceRoles"], ["actor"])
        self.assertEqual(
            [(row["entityId"], row["role"]) for row in receipt["steps"][0]["participants"]],
            [("symbol:a", "actor"), ("symbol:b", "target")],
        )
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertEqual(receipt["evidenceAdmission"], "NOT_PERFORMED")
        self.assertFalse(receipt["writesPerformed"])
        at_depth_limit = bounded_role_aware_incidence_expansion_receipt(
            relations,
            graph_revision="graph:1",
            source_entity_id="symbol:a",
            depth_limit=1,
            max_relation_expansions=1,
        )
        self.assertFalse(at_depth_limit["truncated"])

    def test_role_aware_expansion_replay_is_deterministic_and_bounded(self):
        first = NarySemanticRelation(
            relation_id="rel:1",
            relation_type="CAUSES",
            source_ref="src/a.ts",
            source_revision="rev-1",
            participants=(
                RelationParticipant("symbol:a", "cause", 0),
                RelationParticipant("symbol:b", "effect", 1),
            ),
            producer_revision="atlas:r1",
        )
        second = NarySemanticRelation(
            relation_id="rel:2",
            relation_type="CITES",
            source_ref="src/b.ts",
            source_revision="rev-2",
            participants=(
                RelationParticipant("symbol:a", "citation", 0),
                RelationParticipant("symbol:c", "target", 1),
            ),
            producer_revision="atlas:r1",
        )
        args = {
            "graph_revision": "graph:1",
            "source_entity_id": "symbol:a",
            "depth_limit": 2,
            "max_relation_expansions": 1,
        }
        receipt = bounded_role_aware_incidence_expansion_receipt((second, first), **args)
        replay = bounded_role_aware_incidence_expansion_receipt((first, second), **args)
        self.assertEqual(receipt, replay)
        self.assertEqual(receipt["expandedRelationCount"], 1)
        self.assertTrue(receipt["truncated"])
        self.assertEqual(receipt["steps"][0]["relationId"], "rel:1")

    def test_role_aware_expansion_bounds_high_arity_and_keeps_source_incidence(self):
        relation = NarySemanticRelation(
            relation_id="rel:wide",
            relation_type="CONTRIBUTES_TO",
            source_ref="src/wide.py",
            source_revision="rev-wide",
            participants=(
                RelationParticipant("symbol:z", "later", 2),
                RelationParticipant("symbol:a", "source", 0),
                RelationParticipant("symbol:b", "target", 1),
            ),
            producer_revision="atlas:r1",
        )
        receipt = bounded_role_aware_incidence_expansion_receipt(
            (relation,),
            graph_revision="graph:wide",
            source_entity_id="symbol:a",
            depth_limit=1,
            max_participants_per_relation=2,
        )
        step = receipt["steps"][0]
        self.assertEqual(
            [(row["entityId"], row["role"]) for row in step["participants"]],
            [("symbol:a", "source"), ("symbol:b", "target")],
        )
        self.assertEqual(step["participantCountTotal"], 3)
        self.assertTrue(step["participantLimitReached"])
        self.assertTrue(receipt["truncated"])

    def test_role_aware_expansion_rejects_invalid_seeds_and_limits(self):
        assertions, relations = self._fixture()
        with self.assertRaisesRegex(ValueError, "source_entity_id is not an entity"):
            bounded_role_aware_incidence_expansion_receipt(
                relations, graph_revision="graph:1", source_entity_id="relation:rel:1"
            )
        with self.assertRaisesRegex(ValueError, "max_relation_expansions must be positive"):
            bounded_role_aware_incidence_expansion_receipt(
                relations,
                graph_revision="graph:1",
                source_entity_id="symbol:a",
                max_relation_expansions=0,
            )


if __name__ == "__main__":
    unittest.main()
