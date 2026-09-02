"""Fixture-only domain classification admission into OntologyLinkedTupleV1.

The classifier label remains evidence. Only an admitted ontology class is
added to a copied tuple; tuple identity and provenance are never regenerated.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from parent_atlas_ontology.domain_mapping import (
    DomainOntologyAdmissionV1,
    admit_domain_classification,
)
from parent_atlas_ontology.models import OntologyLinkedTupleV1


@dataclass(frozen=True, slots=True)
class DomainTupleAdmissionV1:
    admission: DomainOntologyAdmissionV1
    tupleValue: OntologyLinkedTupleV1 | None


@dataclass(frozen=True, slots=True)
class DomainClassificationSignalV1:
    domainLabel: str
    confidence: float
    classificationRevision: str
    mappingRevision: str
    sourceNamespace: str
    sourceRevision: str


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
) -> DomainTupleAdmissionV1:
    """Strict classifier wire; rejects identity/revision bypasses."""

    if not signal.classificationRevision or not signal.mappingRevision:
        raise ValueError("MAPPING_REVISION_MISSING")
    if signal.sourceNamespace != expected_source_namespace:
        raise ValueError("SOURCE_NAMESPACE_MISMATCH")
    if not tuple_value.provenance.sourceRevision or signal.sourceRevision != tuple_value.provenance.sourceRevision:
        raise ValueError("SOURCE_REVISION_UNPROVEN")
    admission = admit_domain_classification(signal.domainLabel, confidence=signal.confidence)
    if signal.mappingRevision != admission.mappingRevision:
        raise ValueError("MAPPING_REVISION_MISMATCH")
    return admit_domain_classification_to_tuple(tuple_value, signal.domainLabel, confidence=signal.confidence)
