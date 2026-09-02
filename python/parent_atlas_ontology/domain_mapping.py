"""Revisioned domain-classification to ontology admission bridge.

Classifier labels are evidence signals.  They are not ontology identifiers and
must not be copied directly into graph or GPU payloads.  This module provides a
small, deterministic, read-only admission boundary for the labels emitted by
``atlas_external_docs.classify_domain``.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from typing import Mapping


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _checksum(value: object) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class DomainOntologyMappingV1:
    """One admitted classifier label and its declared ontology class."""

    domainLabel: str
    classId: str
    aliases: tuple[str, ...] = ()
    minimumConfidence: float = 0.0


@dataclass(frozen=True, slots=True)
class DomainOntologyAdmissionV1:
    """A checksum-sealed mapping result safe to attach to evidence."""

    schema: str
    mappingRevision: str
    domainLabel: str
    classId: str | None
    confidence: float
    status: str
    canonicalAuthority: bool = False
    writesPerformed: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "schema": self.schema,
            "mappingRevision": self.mappingRevision,
            "domainLabel": self.domainLabel,
            "classId": self.classId,
            "confidence": self.confidence,
            "status": self.status,
            "canonicalAuthority": self.canonicalAuthority,
            "writesPerformed": self.writesPerformed,
        }


_DEFAULT_MAPPINGS: tuple[DomainOntologyMappingV1, ...] = (
    DomainOntologyMappingV1("retrieval", "atlas:RetrievalDomain", ("search", "rag_retrieval")),
    DomainOntologyMappingV1("database", "atlas:DatabaseDomain", ("postgres", "storage")),
    DomainOntologyMappingV1("code", "atlas:CodeDomain", ("source", "programming")),
    DomainOntologyMappingV1("graph", "atlas:GraphDomain", ("topology", "graph_topology")),
    DomainOntologyMappingV1("model", "atlas:ModelDomain", ("embedding", "inference", "embedding_indexing", "cluster_analysis")),
    DomainOntologyMappingV1("workflow", "atlas:WorkflowDomain", ("pipeline", "dag", "agent_orchestration", "repair_workflow", "trace_mcp")),
    DomainOntologyMappingV1("documentation", "atlas:DocumentationDomain", ("docs",)),
)


def _normalize_label(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def mapping_revision(mappings: tuple[DomainOntologyMappingV1, ...] = _DEFAULT_MAPPINGS) -> str:
    payload = [
        {
            "domainLabel": item.domainLabel,
            "classId": item.classId,
            "aliases": sorted(item.aliases),
            "minimumConfidence": item.minimumConfidence,
        }
        for item in mappings
    ]
    return _checksum(payload)


def admit_domain_classification(
    domain_label: str,
    *,
    confidence: float = 1.0,
    mappings: tuple[DomainOntologyMappingV1, ...] = _DEFAULT_MAPPINGS,
) -> DomainOntologyAdmissionV1:
    """Map a classifier label only when the mapping is explicit and admitted."""

    if not 0.0 <= confidence <= 1.0:
        raise ValueError("CONFIDENCE_OUT_OF_RANGE")
    normalized = _normalize_label(domain_label)
    matches = [
        item
        for item in mappings
        if normalized == _normalize_label(item.domainLabel)
        or normalized in {_normalize_label(alias) for alias in item.aliases}
    ]
    if len(matches) != 1:
        return DomainOntologyAdmissionV1(
            "atlas.domain-ontology-admission.v1",
            mapping_revision(mappings),
            domain_label,
            None,
            confidence,
            "UNMAPPED" if not matches else "AMBIGUOUS",
        )
    item = matches[0]
    status = "ADMITTED" if confidence >= item.minimumConfidence else "BELOW_CONFIDENCE"
    return DomainOntologyAdmissionV1(
        "atlas.domain-ontology-admission.v1",
        mapping_revision(mappings),
        domain_label,
        item.classId if status == "ADMITTED" else None,
        confidence,
        status,
    )


def admit_domain_classifications(
    labels: Mapping[str, float],
    *,
    mappings: tuple[DomainOntologyMappingV1, ...] = _DEFAULT_MAPPINGS,
) -> tuple[DomainOntologyAdmissionV1, ...]:
    """Return stable, label-sorted admissions without mutating any store."""

    return tuple(
        admit_domain_classification(label, confidence=confidence, mappings=mappings)
        for label, confidence in sorted(labels.items(), key=lambda item: _normalize_label(item[0]))
    )
