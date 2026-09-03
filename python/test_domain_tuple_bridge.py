import json
from pathlib import Path
import unittest
from dataclasses import replace

from parent_atlas_ontology.domain_mapping import mapping_revision
from parent_atlas_ontology.domain_tuple_bridge import (
    DomainClassificationSignalV1,
    admit_domain_classification_to_tuple,
    build_domain_classification_signal_from_chunk,
    wire_domain_classification_to_tuple,
)
from parent_atlas_ontology.models import OntologyLinkedTupleV1


FIXTURE = Path(__file__).resolve().parents[1] / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"


class DomainTupleBridgeTests(unittest.TestCase):
    def test_admitted_label_adds_declared_class_without_changing_identity(self):
        value = OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE.read_text()))
        result = admit_domain_classification_to_tuple(value, "rag_retrieval", confidence=0.95)
        self.assertEqual(result.admission.status, "ADMITTED")
        self.assertEqual(result.tupleValue.tupleId, value.tupleId)
        self.assertEqual(result.tupleValue.provenance.sourceRevision, value.provenance.sourceRevision)
        self.assertIn("atlas:RetrievalDomain", result.tupleValue.ontologyIds)

    def test_unknown_label_fails_closed_without_tuple(self):
        value = OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE.read_text()))
        result = admit_domain_classification_to_tuple(value, "mcp_agents", confidence=0.95)
        self.assertEqual(result.admission.status, "UNMAPPED")
        self.assertIsNone(result.tupleValue)

    def test_strict_wire_requires_namespace_and_revision_binding(self):
        value = OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE.read_text()))
        ontology_revision = "sha256:" + ("d" * 64)
        value = replace(value, provenance=replace(value.provenance, ontologyRevision=ontology_revision))
        signal = DomainClassificationSignalV1(
            "rag_retrieval", 0.95, "classifier:v1", mapping_revision(),
            "workspace:ontology-linked-tuple-fixture-v1", value.provenance.sourceRevision,
            ontology_revision, tuple(value.evidenceRefs), "request:fixture-1",
            value.sourceRef, "atlas-domain-classifier", "atlas-domain-classifier:v1",
            "domain-bridge:v1",
        )
        manifest = {"ontologyRevision": ontology_revision, "mappingRevision": mapping_revision()}
        evidence = {value.evidenceRefs[0]: {"sourceRef": value.sourceRef, "sourceRevision": value.provenance.sourceRevision, "contentHash": "sha256:" + ("e" * 64), "producer": "fixture-evidence:v1"}}
        result = wire_domain_classification_to_tuple(
            value, signal, expected_source_namespace="workspace:ontology-linked-tuple-fixture-v1",
            ontology_manifest=manifest, evidence_records=evidence,
        )
        self.assertEqual(result.admission.status, "ADMITTED")
        with self.assertRaisesRegex(ValueError, "SOURCE_NAMESPACE_MISMATCH"):
            wire_domain_classification_to_tuple(
                value, replace(signal, sourceNamespace="wrong"),
                expected_source_namespace="workspace:ontology-linked-tuple-fixture-v1",
                ontology_manifest=manifest, evidence_records=evidence,
            )

    def test_strict_wire_rejects_legacy_ontology_label(self):
        value = OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE.read_text()))
        signal = DomainClassificationSignalV1(
            "rag_retrieval", 0.95, "classifier:v1", mapping_revision(),
            "workspace:ontology-linked-tuple-fixture-v1", value.provenance.sourceRevision,
            "ontology-kernel:v0", tuple(value.evidenceRefs), "request:fixture-1",
            value.sourceRef, "atlas-domain-classifier", "atlas-domain-classifier:v1",
            "domain-bridge:v1",
        )
        with self.assertRaisesRegex(ValueError, "ONTOLOGY_REVISION_LEGACY_REJECTED"):
            wire_domain_classification_to_tuple(
                value, signal, expected_source_namespace="workspace:ontology-linked-tuple-fixture-v1",
                ontology_manifest={"ontologyRevision": "sha256:" + ("d" * 64), "mappingRevision": mapping_revision()},
                evidence_records={value.evidenceRefs[0]: {"sourceRef": value.sourceRef, "sourceRevision": value.provenance.sourceRevision, "contentHash": "sha256:" + ("e" * 64), "producer": "fixture-evidence:v1"}},
            )

    def test_chunk_adapter_derives_grounded_span_reference(self):
        signal = build_domain_classification_signal_from_chunk(
            domain_label="retrieval", confidence=0.95, classification_revision="classifier:v1",
            mapping_revision_value=mapping_revision(), ontology_revision="sha256:" + ("d" * 64),
            source_namespace="workspace:fixture", source_revision="sha256:" + ("c" * 64),
            chunk_id="doc:fixture:abc:0", start_char=4, end_char=18,
        )
        self.assertEqual(signal.evidenceRefs, ("chunk:doc:fixture:abc:0:4-18",))
        with self.assertRaisesRegex(ValueError, "CHUNK_EVIDENCE_SPAN_INVALID"):
            build_domain_classification_signal_from_chunk(
                domain_label="retrieval", confidence=0.95, classification_revision="classifier:v1",
                mapping_revision_value=mapping_revision(), ontology_revision="sha256:" + ("d" * 64),
                source_namespace="workspace:fixture", source_revision="sha256:" + ("c" * 64),
                chunk_id="doc:fixture:abc:0", start_char=18, end_char=4,
            )


if __name__ == "__main__":
    unittest.main()
