from __future__ import annotations

import json
import unittest

from atlas_semantic_ontology_projection import (
    FEATURE_BITS,
    NarySemanticRelation,
    RelationParticipant,
    SemanticAssertion,
    build_networkx_projection,
    build_pagerank_view,
    build_rdflib_dataset,
    decode_feature_bits,
    encode_feature_bits,
    logical_checksum,
    networkx_pagerank,
    owlready_reasoning_plan,
    polynomial_feature_interactions,
    rdflib_provenance_rows,
)


class SemanticOntologyProjectionTests(unittest.TestCase):
    def _assertions(self):
        return (
            SemanticAssertion(
                subject_id="symbol:validator",
                predicate="calls",
                object_value="symbol:resolver",
                object_kind="ENTITY",
                source_ref="src/lib/validator.ts",
                source_revision="rev-42",
                observation_kind="AST_FACT",
                tree_node_id="tree:8421",
                packet_key="packet:validator",
                evidence_refs=("evidence:ast:1",),
                domain_class="testing",
                producer_revision="tree-sitter-r7",
            ),
            SemanticAssertion(
                subject_id="symbol:validator",
                predicate="calls",
                object_value="symbol:resolver",
                object_kind="ENTITY",
                source_ref="src/lib/validator.ts",
                source_revision="rev-42",
                observation_kind="RULE_INFERENCE",
                tree_node_id=None,
                packet_key="packet:validator",
                evidence_refs=("evidence:rule:1",),
                domain_class="testing",
                confidence=0.8,
                producer_revision="souffle-r3",
            ),
        )

    def _relation(self):
        return NarySemanticRelation(
            relation_id="rel:authorization:1",
            relation_type="AUTHORIZED_MUTATION",
            source_ref="src/lib/policy.ts",
            source_revision="rev-42",
            participants=(
                RelationParticipant("entity:owner", "actor", 0, "src/lib/policy.ts", "tree:1"),
                RelationParticipant("entity:permit", "resource", 1, "src/lib/policy.ts", "tree:2"),
                RelationParticipant("symbol:updatePermit", "operation", 2, "src/lib/policy.ts", "tree:3"),
            ),
            evidence_refs=("evidence:policy:1",),
            domain_class="security",
            producer_revision="atlas-r1",
        )

    def test_statement_identity_depends_on_lineage_not_serialization(self):
        assertion = self._assertions()[0]
        semantic = assertion.to_dict()
        json_a = json.dumps(semantic, sort_keys=True, separators=(",", ":"))
        json_b = json.dumps(dict(reversed(list(semantic.items()))), indent=2)
        self.assertNotEqual(json_a, json_b)
        self.assertEqual(logical_checksum(semantic), logical_checksum(dict(reversed(list(semantic.items())))))
        self.assertEqual(assertion.statement_id, self._assertions()[0].statement_id)

        try:
            import msgpack
        except ImportError:
            msgpack = None
        if msgpack is not None:
            packed = msgpack.packb(semantic, use_bin_type=True)
            self.assertNotEqual(packed.hex(), json_a.encode("utf-8").hex())
            self.assertEqual(logical_checksum(msgpack.unpackb(packed, raw=False)), logical_checksum(semantic))

    def test_rdflib_dataset_preserves_source_revision_and_tree_node(self):
        try:
            dataset = build_rdflib_dataset(self._assertions(), (self._relation(),))
        except RuntimeError as exc:
            self.skipTest(str(exc))
        rows = rdflib_provenance_rows(dataset)
        ast_row = next(row for row in rows if row["tree_node_id"] == "tree:8421")
        self.assertEqual(ast_row["source_ref"], "src/lib/validator.ts")
        self.assertEqual(ast_row["source_revision"], "rev-42")
        self.assertTrue(ast_row["graph"].startswith("urn:atlas:source-graph:"))

        relation_uri = "urn:atlas:relation:rel%3Aauthorization%3A1"
        relation_quads = [quad for quad in dataset.quads((None, None, None, None)) if str(quad[0]) == relation_uri]
        self.assertGreater(len(relation_quads), 0)

    def test_networkx_preserves_parallel_assertions_and_nary_incidence(self):
        try:
            graph = build_networkx_projection(self._assertions(), (self._relation(),))
        except RuntimeError as exc:
            self.skipTest(str(exc))
        self.assertEqual(graph.number_of_edges("symbol:validator", "symbol:resolver"), 2)
        relation_node = "relation:rel:authorization:1"
        self.assertEqual(graph.nodes[relation_node]["degree"], 3)
        participants = [
            (target, attrs["role"])
            for source, target, _key, attrs in graph.edges(keys=True, data=True)
            if source == relation_node
        ]
        self.assertCountEqual(
            participants,
            [("entity:owner", "actor"), ("entity:permit", "resource"), ("symbol:updatePermit", "operation")],
        )
        # No participant-to-participant clique edges are minted.
        self.assertFalse(graph.has_edge("entity:owner", "entity:permit"))
        self.assertFalse(graph.has_edge("entity:permit", "symbol:updatePermit"))

    def test_pagerank_projection_is_derived_and_degree_normalized(self):
        try:
            graph = build_networkx_projection(self._assertions(), (self._relation(),))
            view = build_pagerank_view(graph)
            receipt = networkx_pagerank(graph)
        except RuntimeError as exc:
            self.skipTest(str(exc))
        relation_node = "relation:rel:authorization:1"
        self.assertAlmostEqual(view[relation_node]["entity:owner"]["weight"], 1.0 / 3.0)
        self.assertFalse(receipt["canonical_authority"])
        self.assertAlmostEqual(sum(receipt["scores"].values()), 1.0, places=6)

    def test_bit_flags_round_trip_without_becoming_semantics(self):
        labels = ("SOURCE_GROUNDED", "AST_GROUNDED", "NARY_MEMBER", "EXACT_SEMANTIC_REFINED")
        mask = encode_feature_bits(labels)
        self.assertEqual(set(decode_feature_bits(mask)), set(labels))
        self.assertEqual(mask & FEATURE_BITS["AST_GROUNDED"], FEATURE_BITS["AST_GROUNDED"])
        self.assertNotEqual(mask, 0)

    def test_polynomial_features_are_numeric_only(self):
        features = polynomial_feature_interactions((0.2, 0.5, 0.8), degree=2)
        self.assertEqual(features[:3], (0.2, 0.5, 0.8))
        self.assertEqual(len(features), 9)
        self.assertAlmostEqual(features[3], 0.04)
        self.assertAlmostEqual(features[-1], 0.64)

    def test_ast_assertion_requires_real_tree_node_id(self):
        with self.assertRaises(ValueError):
            SemanticAssertion(
                subject_id="symbol:a",
                predicate="calls",
                object_value="symbol:b",
                object_kind="ENTITY",
                source_ref="src/a.ts",
                source_revision="r1",
                observation_kind="AST_FACT",
                producer_revision="tree-sitter-r1",
            )

    def test_owlready_is_bounded_reasoner_not_graph_owner(self):
        plan = owlready_reasoning_plan(require_swr_l=True)
        self.assertEqual(plan["execution"], "BOUNDED_EXTERNAL_REASONER")
        self.assertIn("OWL_CLASSIFICATION", plan["use_for"])
        self.assertIn("SWRL_DATA_PROPERTY_INFERENCE", plan["use_for"])
        self.assertIn("PAGERANK", plan["do_not_use_for"])
        self.assertIn("CANONICAL_IDENTITY", plan["do_not_use_for"])
        self.assertFalse(plan["canonical_authority"])


if __name__ == "__main__":
    unittest.main()
