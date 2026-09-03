"""Fixture-only domain classification admission into OntologyLinkedTupleV1.

The classifier label remains evidence. Only an admitted ontology class is
added to a copied tuple; tuple identity and provenance are never regenerated.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import json
import re
from typing import Mapping

from parent_atlas_ontology.domain_mapping import (
    DomainOntologyAdmissionV1,
    admit_domain_classification,
)
from parent_atlas_ontology.models import OntologyLinkedTupleV1


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


@dataclass(frozen=True, slots=True)
class DomainTupleAdmissionV1:
    admission: DomainOntologyAdmissionV1
    tupleValue: OntologyLinkedTupleV1 | None


@dataclass(frozen=True, slots=True)
class DomainClassificationSignalV1:
    """Classifier observation; never an ontology admission by itself."""

    domainLabel: str
    confidence: float
    classificationRevision: str
    mappingRevision: str
    sourceNamespace: str
    sourceRevision: str
    ontologyRevision: str = ""
    evidenceRefs: tuple[str, ...] = ()
    requestId: str = ""
    sourceRef: str = ""
    classifierId: str = ""
    classifierRevision: str = ""
    producerRevision: str = ""

    def to_contract_dict(self) -> dict[str, object]:
        return {
            "schema_version": "atlas.domain-classification-signal.v1",
            "request_id": self.requestId,
            "source_ref": self.sourceRef,
            "source_namespace": self.sourceNamespace,
            "source_revision": self.sourceRevision,
            "classifier_id": self.classifierId,
            "classifier_revision": self.classifierRevision,
            "label": self.domainLabel,
            "probability": self.confidence,
            "mapping_revision": self.mappingRevision,
            "ontology_revision": self.ontologyRevision,
            "evidence_refs": list(self.evidenceRefs),
            "producer_revision": self.producerRevision,
        }

    @staticmethod
    def from_contract_dict(value: Mapping[str, object]) -> "DomainClassificationSignalV1":
        if value.get("schema_version") != "atlas.domain-classification-signal.v1":
            raise ValueError("SIGNAL_SCHEMA_VERSION_UNSUPPORTED")
        return DomainClassificationSignalV1(
            str(value.get("label") or ""), float(value.get("probability") or 0),
            str(value.get("classifier_revision") or ""), str(value.get("mapping_revision") or ""),
            str(value.get("source_namespace") or "unbound"), str(value.get("source_revision") or ""),
            str(value.get("ontology_revision") or ""), tuple(str(item) for item in value.get("evidence_refs", [])),
            str(value.get("request_id") or ""), str(value.get("source_ref") or ""),
            str(value.get("classifier_id") or ""), str(value.get("classifier_revision") or ""),
            str(value.get("producer_revision") or ""),
        )


def domain_classification_signal_checksum(signal: DomainClassificationSignalV1) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(signal.to_contract_dict()).encode("utf-8")).hexdigest()


def build_domain_classification_signal_from_chunk(
    *,
    domain_label: str,
    confidence: float,
    classification_revision: str,
    mapping_revision_value: str,
    ontology_revision: str,
    source_namespace: str,
    source_revision: str,
    chunk_id: str,
    start_char: int,
    end_char: int,
) -> DomainClassificationSignalV1:
    """Bind a classified chunk to the strict signal without inventing identity."""

    if not chunk_id or start_char < 0 or end_char <= start_char:
        raise ValueError("CHUNK_EVIDENCE_SPAN_INVALID")
    if not source_namespace:
        raise ValueError("SOURCE_NAMESPACE_UNPROVEN")
    return DomainClassificationSignalV1(
        domainLabel=domain_label,
        confidence=confidence,
        classificationRevision=classification_revision,
        mappingRevision=mapping_revision_value,
        sourceNamespace=source_namespace,
        sourceRevision=source_revision,
        ontologyRevision=ontology_revision,
        evidenceRefs=(f"chunk:{chunk_id}:{start_char}-{end_char}",),
    )


def admit_domain_classification_to_tuple(
    tuple_value: OntologyLinkedTupleV1,
    domain_label: str,
    *,
    confidence: float = 1.0,
) -> DomainTupleAdmissionV1:
    """Attach an admitted class to a tuple copy without changing identity."""

    admission = admit_domain_classification(domain_label, confidence=confidence)
    if admission.status != "ADMITTED" or admission.classId is None:
        return DomainTupleAdmissionV1(admission, None)
    if not tuple_value.provenance.sourceRevision:
        raise ValueError("SOURCE_REVISION_UNPROVEN")
    if admission.classId in tuple_value.ontologyIds:
        admitted_tuple = tuple_value
    else:
        admitted_tuple = replace(
            tuple_value,
            ontologyIds=tuple(sorted((*tuple_value.ontologyIds, admission.classId))),
        )
    return DomainTupleAdmissionV1(admission, admitted_tuple)


def wire_domain_classification_to_tuple(
    tuple_value: OntologyLinkedTupleV1,
    signal: DomainClassificationSignalV1,
    *,
    expected_source_namespace: str,
    ontology_manifest: Mapping[str, object] | None = None,
    evidence_records: Mapping[str, Mapping[str, object]] | None = None,
) -> DomainTupleAdmissionV1:
    """Strict classifier wire; rejects identity/revision bypasses."""

    if not signal.requestId or not signal.sourceRef or not signal.classifierId:
        raise ValueError("SIGNAL_IDENTITY_MISSING")
    if not signal.classifierRevision:
        raise ValueError("CLASSIFIER_REVISION_MISSING")
    if not signal.classificationRevision or not signal.mappingRevision:
        raise ValueError("MAPPING_REVISION_MISSING")
    if not signal.sourceRevision:
        raise ValueError("SOURCE_REVISION_UNPROVEN")
    if not ontology_manifest:
        raise ValueError("ONTOLOGY_MANIFEST_MISSING")
    manifest_ontology_revision = str(ontology_manifest.get("ontologyRevision") or "")
    manifest_mapping_revision = str(ontology_manifest.get("mappingRevision") or "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", manifest_ontology_revision):
        raise ValueError("ONTOLOGY_REVISION_UNKNOWN")
    if signal.ontologyRevision != manifest_ontology_revision:
        if signal.ontologyRevision.startswith("ontology-kernel:"):
            raise ValueError("ONTOLOGY_REVISION_LEGACY_REJECTED")
        raise ValueError("ONTOLOGY_REVISION_CHECKSUM_MISMATCH")
    if signal.mappingRevision != manifest_mapping_revision:
        raise ValueError("ONTOLOGY_MAPPING_REVISION_MISMATCH")
    if not signal.evidenceRefs:
        raise ValueError("EVIDENCE_REF_MISSING")
    if signal.ontologyRevision != tuple_value.provenance.ontologyRevision:
        raise ValueError("ONTOLOGY_REVISION_MISMATCH")
    if not tuple_value.evidenceRefs:
        raise ValueError("EVIDENCE_MISSING")
    if not set(signal.evidenceRefs).issubset(tuple_value.evidenceRefs):
        raise ValueError("EVIDENCE_TUPLE_MISMATCH")
    if signal.sourceNamespace != expected_source_namespace:
        raise ValueError("SOURCE_NAMESPACE_MISMATCH")
    if signal.sourceRef != tuple_value.sourceRef:
        raise ValueError("SOURCE_REF_MISMATCH")
    if not tuple_value.provenance.sourceRevision or signal.sourceRevision != tuple_value.provenance.sourceRevision:
        raise ValueError("SOURCE_REVISION_UNPROVEN")
    if evidence_records is None:
        raise ValueError("EVIDENCE_RESOLUTION_UNAVAILABLE")
    for evidence_ref in signal.evidenceRefs:
        evidence = evidence_records.get(evidence_ref)
        if not evidence:
            raise ValueError("EVIDENCE_REF_UNRESOLVED")
        if not evidence.get("sourceRef") or not evidence.get("sourceRevision"):
            raise ValueError("EVIDENCE_IDENTITY_INCOMPLETE")
        if not evidence.get("contentHash") and not evidence.get("evidenceChecksum"):
            raise ValueError("EVIDENCE_CHECKSUM_MISSING")
        if not evidence.get("producer"):
            raise ValueError("EVIDENCE_PRODUCER_MISSING")
        if str(evidence["sourceRef"]) != signal.sourceRef:
            raise ValueError("EVIDENCE_SOURCE_MISMATCH")
        if str(evidence["sourceRevision"]) != signal.sourceRevision:
            raise ValueError("EVIDENCE_REVISION_MISMATCH")
    admission = admit_domain_classification(signal.domainLabel, confidence=signal.confidence)
    if signal.mappingRevision != admission.mappingRevision:
        raise ValueError("MAPPING_REVISION_MISMATCH")
    return admit_domain_classification_to_tuple(tuple_value, signal.domainLabel, confidence=signal.confidence)
