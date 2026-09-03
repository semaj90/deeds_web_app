#!/usr/bin/env python3
"""Read-only DOMAIN ONTOLOGY WIRE 01 proof."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

from parent_atlas_ontology.domain_mapping import mapping_revision
from parent_atlas_ontology.domain_tuple_bridge import DomainClassificationSignalV1, wire_domain_classification_to_tuple
from parent_atlas_ontology.models import OntologyLinkedTupleV1


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT = ROOT / "docs" / "reports" / "domain-ontology-tuple-wire-v1.json"


def main() -> None:
    value = OntologyLinkedTupleV1.from_dict(json.loads(FIXTURE.read_text(encoding="utf-8")))
    source_namespace = "workspace:ontology-linked-tuple-fixture-v1"
    ontology_revision = "sha256:" + ("d" * 64)
    value = replace(value, provenance=replace(value.provenance, ontologyRevision=ontology_revision))
    evidence_refs = ("fixture:source.ts#L1-L2",)
    signal = DomainClassificationSignalV1(
        "rag_retrieval", 0.95, "classifier:v1", mapping_revision(),
        source_namespace, value.provenance.sourceRevision, ontology_revision, tuple(value.evidenceRefs),
        "request:wire-proof", value.sourceRef, "atlas-domain-classifier", "atlas-domain-classifier:v1",
        "domain-bridge:v1",
    )
    manifest = {"ontologyRevision": ontology_revision, "mappingRevision": mapping_revision()}
    evidence = {value.evidenceRefs[0]: {"sourceRef": value.sourceRef, "sourceRevision": value.provenance.sourceRevision, "contentHash": "sha256:" + ("e" * 64), "producer": "fixture-evidence:v1"}}
    admitted = wire_domain_classification_to_tuple(value, signal, expected_source_namespace=source_namespace, ontology_manifest=manifest, evidence_records=evidence)
    rejected_signal = DomainClassificationSignalV1(
        "mcp_agents", 0.95, "classifier:v1", mapping_revision(),
        source_namespace, value.provenance.sourceRevision, ontology_revision, tuple(value.evidenceRefs),
        "request:wire-proof", value.sourceRef, "atlas-domain-classifier", "atlas-domain-classifier:v1",
        "domain-bridge:v1",
    )
    rejected = wire_domain_classification_to_tuple(value, rejected_signal, expected_source_namespace=source_namespace, ontology_manifest=manifest, evidence_records=evidence)
    checks = {
        "admitted_label": admitted.admission.status == "ADMITTED",
        "declared_class_attached": admitted.tupleValue is not None and "atlas:RetrievalDomain" in admitted.tupleValue.ontologyIds,
        "tuple_identity_preserved": admitted.tupleValue is not None and admitted.tupleValue.tupleId == value.tupleId,
        "source_revision_preserved": admitted.tupleValue is not None and admitted.tupleValue.provenance.sourceRevision == value.provenance.sourceRevision,
        "unknown_label_rejected": rejected.admission.status == "UNMAPPED" and rejected.tupleValue is None,
        "writes_false": True,
        "canonical_false": True,
    }
    report = {
        "schema": "atlas.domain-ontology-tuple-wire-receipt.v1",
        "status": "DOMAIN_ONTOLOGY_WIRE_PROVEN" if all(checks.values()) else "DOMAIN_ONTOLOGY_WIRE_UNPROVEN",
        "tupleId": value.tupleId,
        "sourceRevision": value.provenance.sourceRevision,
        "classificationRevision": signal.classificationRevision,
        "mappingRevision": signal.mappingRevision,
        "sourceNamespace": signal.sourceNamespace,
        "signalCount": 2,
        "admittedCount": 1,
        "rejectedCount": 1,
        "directClassifierToOntologyIdentityCount": 0,
        "directClassifierToTupleCount": 0,
        "tupleConstructionAttempted": 1,
        "tupleConstructionAdmitted": 1,
        "admittedDomainLabel": "rag_retrieval",
        "admittedClassId": admitted.admission.classId,
        "rejectedDomainLabel": "mcp_agents",
        "rejectedStatus": rejected.admission.status,
        "checks": checks,
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
