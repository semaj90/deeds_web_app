import json
from dataclasses import replace
from pathlib import Path
import unittest

from parent_atlas_ontology.arrow_adapter import from_arrow_table, table_to_ipc_bytes, to_arrow_table, ipc_bytes_to_table
from parent_atlas_ontology.models import OntologyLinkedTupleV1


FIXTURE = Path(__file__).resolve().parents[2] / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"


class OntologyTupleLineageArrowV1Tests(unittest.TestCase):
    def test_task_and_evidence_revisions_survive_python_and_arrow_readback(self):
        raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
        tuple_value = OntologyLinkedTupleV1.from_dict(raw)
        self.assertIsNone(tuple_value.provenance.workspaceRevision)
        self.assertIsNone(tuple_value.provenance.taskRevision)
        self.assertIsNone(tuple_value.provenance.evidenceCardChecksum)
        self.assertIsNone(tuple_value.provenance.evidenceSpanChecksum)
        provenance = replace(
            tuple_value.provenance,
            workspaceRevision="sha256:" + "a" * 64,
            taskRevision="sha256:" + "b" * 64,
            evidenceCardChecksum="sha256:" + "c" * 64,
            evidenceSpanChecksum="sha256:" + "d" * 64,
        )
        qualified = replace(tuple_value, provenance=provenance)

        json_readback = OntologyLinkedTupleV1.from_dict(qualified.to_dict())
        arrow_bytes = table_to_ipc_bytes(to_arrow_table([qualified]))
        arrow_readback = from_arrow_table(ipc_bytes_to_table(arrow_bytes))[0]

        expected = qualified.provenance
        self.assertEqual(json_readback.provenance.workspaceRevision, expected.workspaceRevision)
        self.assertEqual(json_readback.provenance.taskRevision, expected.taskRevision)
        self.assertEqual(json_readback.provenance.evidenceCardChecksum, expected.evidenceCardChecksum)
        self.assertEqual(json_readback.provenance.evidenceSpanChecksum, expected.evidenceSpanChecksum)
        self.assertEqual(arrow_readback.to_dict(), qualified.to_dict())


if __name__ == "__main__":
    unittest.main()
