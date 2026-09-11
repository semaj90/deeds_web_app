from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402
from parent_atlas_ontology.oak_adapter import ParentAtlasOakAdapter  # noqa: E402
from parent_atlas_ontology.rich_nary import (  # noqa: E402
    OntologyFanoutAuthorityViewV1,
    build_authority_rdf_dataset_v1,
    ontology_linked_tuple_to_rich_nary_v1,
    project_binary_edge_v1,
    rich_nary_to_semantic_relation_v1,
)

FIXTURE_PATH = ROOT / "docs/reports/fixtures/ontology-linked-tuple-fixture-v1.json"


def load_fixture() -> OntologyLinkedTupleV1:
    return OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE_PATH.read_text(encoding="utf-8")))


def authority_dict(**overrides):
    fixture = load_fixture()
    base = {
        "schemaVersion": "atlas.ontology-fanout-authority.v1",
        "packetKey": fixture.packetKey,
        "sourceRef": fixture.sourceRef,
        "contentHash": "a" * 64,
        "sourceRevision": fixture.provenance.sourceRevision,
        "workspaceRevision": "sha256:" + "c" * 64,
        "representationId": "semantic_768",
        "representationRevision": "embeddinggemma:test:v1",
        "featureRevision": "feature:test:v1",
        "ontologyRevision": fixture.provenance.ontologyRevision,
        "graphRevision": "graph:test:v1",
        "producerRevision": fixture.provenance.producerRevision,
        "evidenceRefs": list(fixture.evidenceRefs),
        "ontologyIds": list(fixture.ontologyIds),
        "conceptIds": list(fixture.conceptIds),
    }
    base.update(overrides)
    return base


class RichNaryAuthorityTests(unittest.TestCase):
    def test_preserves_real_four_participant_fixture(self):
        fixture = load_fixture()
        authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict())
        relation = ontology_linked_tuple_to_rich_nary_v1(fixture, authority, require_graph_revision=True)

        self.assertEqual(relation.relationId, fixture.tupleId)
        self.assertEqual(relation.relationType, "CODE_REPAIR_CAUSAL_PATH")
        self.assertEqual([p.role for p in relation.participants], ["cause", "effect", "evidence", "tool"])
        self.assertEqual(relation.evidence.sourceRef, fixture.sourceRef)
        self.assertEqual(relation.evidence.sourceRevision, fixture.provenance.sourceRevision)
        self.assertEqual(relation.evidence.spanStart, 120)
        self.assertEqual(relation.evidence.spanEnd, 168)
        self.assertEqual(relation.evidence.evidenceRefs, fixture.evidenceRefs)
        self.assertEqual(relation.authority.workspaceRevision, "sha256:" + "c" * 64)
        self.assertFalse(relation.canonicalAuthority)
        self.assertTrue(relation.graphProjectionEligible)

    def test_delegates_to_existing_relation_node_substrate(self):
        fixture = load_fixture()
        authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict())
        rich = ontology_linked_tuple_to_rich_nary_v1(fixture, authority)
        semantic = rich_nary_to_semantic_relation_v1(rich)
        self.assertEqual(semantic.relation_id, fixture.tupleId)
        self.assertEqual(len(semantic.participants), 4)
        self.assertFalse(semantic.canonical_authority)
        self.assertNotEqual(semantic.producer_revision, "unknown")

    def test_binary_projection_is_explicit_lossy_and_revision_qualified(self):
        fixture = load_fixture()
        authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict())
        rich = ontology_linked_tuple_to_rich_nary_v1(fixture, authority)
        edge = project_binary_edge_v1(rich, from_role="cause", to_role="effect")
        self.assertEqual(edge["from"], "symbol:S1")
        self.assertEqual(edge["to"], "symbol:S2")
        self.assertEqual(edge["relationId"], fixture.tupleId)
        self.assertEqual(edge["graphRevision"], "graph:test:v1")
        self.assertFalse(edge["canonicalAuthority"])

    def test_graph_projection_refuses_missing_graph_revision(self):
        fixture = load_fixture()
        authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict(graphRevision=None))
        rich = ontology_linked_tuple_to_rich_nary_v1(fixture, authority)
        self.assertFalse(rich.graphProjectionEligible)
        with self.assertRaisesRegex(ValueError, "GRAPH_REVISION_UNPROVEN"):
            project_binary_edge_v1(rich, from_role="cause", to_role="effect")

    def test_rejects_placeholder_authority_revisions(self):
        for field in ["sourceRevision", "workspaceRevision", "featureRevision", "ontologyRevision", "producerRevision"]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    OntologyFanoutAuthorityViewV1.from_dict(authority_dict(**{field: "unknown"}))

    def test_rejects_non_semantic_768_representation(self):
        with self.assertRaisesRegex(ValueError, "REPRESENTATION_NOT_SEMANTIC_768"):
            OntologyFanoutAuthorityViewV1.from_dict(authority_dict(representationId="semantic_384"))

    def test_rejects_packet_source_revision_and_evidence_mismatch(self):
        fixture = load_fixture()
        cases = [
            ({"packetKey": "packet:wrong"}, "PACKET_KEY_MISMATCH"),
            ({"sourceRef": "wrong.ts"}, "SOURCE_REF_MISMATCH"),
            ({"sourceRevision": "sha256:" + "d" * 64}, "SOURCE_REVISION_MISMATCH"),
            ({"evidenceRefs": ["evidence:not-in-tuple"]}, "EVIDENCE_REFS_NOT_GROUNDED"),
        ]
        for changes, expected in cases:
            with self.subTest(changes=changes):
                authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict(**changes))
                with self.assertRaisesRegex(ValueError, expected):
                    ontology_linked_tuple_to_rich_nary_v1(fixture, authority)

    def test_no_unknown_authority_values_emitted(self):
        fixture = load_fixture()
        authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict())
        relation = ontology_linked_tuple_to_rich_nary_v1(fixture, authority)
        serialized = json.dumps(relation.to_dict(), sort_keys=True).lower()
        self.assertNotIn('"unknown"', serialized)

    def test_oak_adapter_is_projection_only_with_fake_backend(self):
        class FakeOak:
            def label(self, curie):
                return {"PA:1": "Retrieve", "PA:2": "Search"}.get(curie)

            def entity_aliases(self, curie):
                return ["retrieval"] if curie == "PA:1" else []

            def basic_search(self, text):
                yield "PA:1"

            def relationships(self, curies):
                yield (curies[0], "rdfs:subClassOf", "PA:2")

            def ancestors(self, curie, predicates=None):
                yield curie
                yield "PA:2"

        adapter = ParentAtlasOakAdapter("test:fake", _adapter=FakeOak())
        self.assertFalse(adapter.canonicalAuthority)
        self.assertEqual(adapter.concept("PA:1").aliases, ("retrieval",))
        self.assertEqual(adapter.search("retrieve")[0].curie, "PA:1")
        self.assertEqual(adapter.relationships("PA:1")[0].object, "PA:2")
        self.assertEqual([row.curie for row in adapter.ancestors("PA:1")], ["PA:1", "PA:2"])
        for forbidden in ("create_identity", "mint_tuple_id", "promote", "write"):
            self.assertFalse(hasattr(adapter, forbidden))

    def test_rdf_projection_optional_dependency_or_authority_metadata(self):
        fixture = load_fixture()
        authority = OntologyFanoutAuthorityViewV1.from_dict(authority_dict())
        relation = ontology_linked_tuple_to_rich_nary_v1(fixture, authority)
        try:
            dataset = build_authority_rdf_dataset_v1([relation])
        except RuntimeError as exc:
            self.assertIn("rdflib is required", str(exc))
            return
        text = "\n".join(str(triple) for graph in dataset.graphs() for triple in graph)
        self.assertIn(authority.workspaceRevision, text)
        self.assertIn(authority.ontologyRevision, text)
        self.assertIn(fixture.tupleId, text)


if __name__ == "__main__":
    unittest.main()
