from __future__ import annotations

import json
from pathlib import Path
import unittest

from parent_atlas_ontology.models import OntologyLinkedTupleV1
from parent_atlas_ontology.rich_nary import (
    OntologyFanoutAuthorityViewV1,
    ontology_linked_tuple_to_rich_nary_v1,
)
from parent_atlas_ontology.temporal_nary import (
    NaryTemporalLineageV1,
    TemporalNaryIndexV1,
    build_temporal_rich_nary_record_v1,
)


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"


def build_record(*, valid_to: str | None = None, recorded_at: str = "2026-09-10T20:00:02Z"):
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    tuple_value = OntologyLinkedTupleV1.from_dict(raw)
    authority = OntologyFanoutAuthorityViewV1.from_dict({
        "schemaVersion": "atlas.ontology-fanout-authority.v1",
        "packetKey": tuple_value.packetKey,
        "sourceRef": tuple_value.sourceRef,
        "contentHash": "a" * 64,
        "sourceRevision": tuple_value.provenance.sourceRevision,
        "workspaceRevision": "workspace:test:v1",
        "representationId": "semantic_768",
        "representationRevision": "semantic:test:v1",
        "featureRevision": "feature:test:v1",
        "ontologyRevision": "ontology-kernel:v0",
        "graphRevision": "graph:test:v1",
        "producerRevision": tuple_value.provenance.producerRevision,
        "evidenceRefs": list(tuple_value.evidenceRefs),
        "ontologyIds": list(tuple_value.ontologyIds),
        "conceptIds": list(tuple_value.conceptIds),
    })
    relation = ontology_linked_tuple_to_rich_nary_v1(tuple_value, authority, require_graph_revision=True)
    temporal = NaryTemporalLineageV1.from_dict({
        "schemaVersion": "atlas.nary-temporal-lineage.v1",
        "graphifyExecutionId": "graphify-execution:test:r1",
        "sourceRef": tuple_value.sourceRef,
        "sourceRevision": tuple_value.provenance.sourceRevision,
        "workspaceRevision": authority.workspaceRevision,
        "graphRevision": authority.graphRevision,
        "ontologyRevision": authority.ontologyRevision,
        "occurredAt": "2026-09-10T19:59:58Z",
        "observedAt": "2026-09-10T20:00:00Z",
        "validFrom": "2026-09-10T20:00:00Z",
        "validTo": valid_to,
        "recordedAt": recorded_at,
        "sourceSequence": 7,
    })
    return build_temporal_rich_nary_record_v1(relation, temporal)


class TemporalNaryTests(unittest.TestCase):
    def test_preserves_separate_temporal_and_revision_axes(self):
        record = build_record()
        self.assertEqual(record.temporal.graphifyExecutionId, "graphify-execution:test:r1")
        self.assertEqual(record.temporal.sourceRevision, record.relation.authority.sourceRevision)
        self.assertEqual(record.temporal.workspaceRevision, record.relation.authority.workspaceRevision)
        self.assertEqual(record.temporal.graphRevision, record.relation.authority.graphRevision)
        self.assertEqual(record.temporal.ontologyRevision, record.relation.authority.ontologyRevision)
        self.assertEqual(record.temporal.observedAt, "2026-09-10T20:00:00Z")
        self.assertEqual(record.temporal.recordedAt, "2026-09-10T20:00:02Z")
        self.assertFalse(record.canonicalAuthority)
        self.assertTrue(record.temporalIndexKey.startswith("derived:sha256:"))

    def test_temporal_index_supports_valid_time_and_transaction_time(self):
        record = build_record(valid_to="2026-09-10T21:00:00Z")
        index = TemporalNaryIndexV1()
        index.append(record)
        self.assertEqual(len(index.query(valid_at="2026-09-10T20:30:00Z")), 1)
        self.assertEqual(len(index.query(valid_at="2026-09-10T21:00:00Z")), 0)
        self.assertEqual(len(index.query(recorded_as_of="2026-09-10T20:00:01Z")), 0)
        self.assertEqual(len(index.query(recorded_as_of="2026-09-10T20:00:02Z")), 1)

    def test_index_queries_revision_and_execution_axes(self):
        record = build_record()
        index = TemporalNaryIndexV1()
        index.append(record)
        self.assertEqual(len(index.query(graphify_execution_id="graphify-execution:test:r1")), 1)
        self.assertEqual(len(index.query(workspace_revision="workspace:test:v1")), 1)
        self.assertEqual(len(index.query(graph_revision="graph:test:v1")), 1)
        self.assertEqual(len(index.query(ontology_revision="ontology-kernel:v0")), 1)
        self.assertEqual(len(index.query(source_ref=record.temporal.sourceRef)), 1)

    def test_refuses_temporal_authority_mismatch(self):
        record = build_record()
        bad = NaryTemporalLineageV1(
            schemaVersion="atlas.nary-temporal-lineage.v1",
            graphifyExecutionId=record.temporal.graphifyExecutionId,
            sourceRef=record.temporal.sourceRef,
            sourceRevision=record.temporal.sourceRevision,
            workspaceRevision="workspace:wrong:v1",
            graphRevision=record.temporal.graphRevision,
            ontologyRevision=record.temporal.ontologyRevision,
            occurredAt=record.temporal.occurredAt,
            observedAt=record.temporal.observedAt,
            validFrom=record.temporal.validFrom,
            validTo=record.temporal.validTo,
            recordedAt=record.temporal.recordedAt,
            sourceSequence=record.temporal.sourceSequence,
        )
        with self.assertRaisesRegex(ValueError, "TEMPORAL_WORKSPACE_REVISION_MISMATCH"):
            build_temporal_rich_nary_record_v1(record.relation, bad)

    def test_refuses_naive_timestamp(self):
        with self.assertRaisesRegex(ValueError, "OBSERVED_AT_TIMEZONE_REQUIRED"):
            NaryTemporalLineageV1.from_dict({
                "schemaVersion": "atlas.nary-temporal-lineage.v1",
                "graphifyExecutionId": "r",
                "sourceRef": "src/a.ts",
                "sourceRevision": "source:v1",
                "workspaceRevision": "workspace:v1",
                "graphRevision": "graph:v1",
                "ontologyRevision": "ontology:v1",
                "observedAt": "2026-09-10T20:00:00",
                "validFrom": "2026-09-10T20:00:00Z",
                "recordedAt": "2026-09-10T20:00:02Z",
            })


if __name__ == "__main__":
    unittest.main()
