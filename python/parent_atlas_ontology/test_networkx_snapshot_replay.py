from __future__ import annotations

import unittest

from atlas_semantic_ontology_projection import NarySemanticRelation, RelationParticipant, SemanticAssertion
from parent_atlas_ontology.networkx_snapshot import bounded_bfs_receipt, build_networkx_snapshot, replay_networkx_snapshot


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


if __name__ == "__main__":
    unittest.main()
