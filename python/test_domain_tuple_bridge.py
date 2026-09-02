import json
from pathlib import Path
import unittest
from dataclasses import replace

from parent_atlas_ontology.domain_mapping import mapping_revision
from parent_atlas_ontology.domain_tuple_bridge import (
    DomainClassificationSignalV1,
    admit_domain_classification_to_tuple,
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
        signal = DomainClassificationSignalV1(
            "rag_retrieval", 0.95, "classifier:v1", mapping_revision(),
            "workspace:ontology-linked-tuple-fixture-v1", value.provenance.sourceRevision,
        )
        result = wire_domain_classification_to_tuple(
            value, signal, expected_source_namespace="workspace:ontology-linked-tuple-fixture-v1"
        )
        self.assertEqual(result.admission.status, "ADMITTED")
        with self.assertRaisesRegex(ValueError, "SOURCE_NAMESPACE_MISMATCH"):
            wire_domain_classification_to_tuple(value, replace(signal, sourceNamespace="wrong"), expected_source_namespace="workspace:ontology-linked-tuple-fixture-v1")


if __name__ == "__main__":
    unittest.main()
