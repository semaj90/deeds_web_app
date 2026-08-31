"""Typed Python DTOs for OntologyLinkedTupleV1 — field-for-field mirror of
the real Zod schema (not a simplified illustrative shape), so nothing in
this module can silently diverge from what Postgres/TypeScript actually
persist. Every field name below is the exact camelCase name from the TS
source, kept as-is (not snake_cased) specifically so a round-trip through
`from_dict`/`to_dict` is byte-for-byte comparable against the original
JSON without a name-mapping layer that could itself hide a mismatch.

Frozen dataclasses, not bare tuples — position never becomes semantics
here. `participants` stays a real Python tuple (immutability is useful),
but its members are `OntologyParticipantV1` instances, not positional
values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True, slots=True)
class OntologyParticipantV1:
    entityId: str
    entityKind: str
    role: str
    label: Optional[str] = None

    @staticmethod
    def from_dict(d: dict) -> "OntologyParticipantV1":
        return OntologyParticipantV1(
            entityId=d["entityId"],
            entityKind=d["entityKind"],
            role=d["role"],
            label=d.get("label"),
        )

    def to_dict(self) -> dict:
        return {"entityId": self.entityId, "entityKind": self.entityKind, "role": self.role, "label": self.label}


@dataclass(frozen=True, slots=True)
class OntologyLinkedTupleEvidenceSpanV1:
    sourceRef: str
    start: int
    end: int

    @staticmethod
    def from_dict(d: dict) -> "OntologyLinkedTupleEvidenceSpanV1":
        return OntologyLinkedTupleEvidenceSpanV1(sourceRef=d["sourceRef"], start=d["start"], end=d["end"])

    def to_dict(self) -> dict:
        return {"sourceRef": self.sourceRef, "start": self.start, "end": self.end}


@dataclass(frozen=True, slots=True)
class OntologyLinkedTupleProvenanceV1:
    sourceTables: tuple[str, ...]
    labelerVersion: Optional[str]
    taggerVersion: Optional[str]
    ontologyVersion: Optional[str]
    nlpVersion: Optional[str]
    sourceRevision: Optional[str] = None
    representationId: Optional[str] = None
    representationRevision: Optional[str] = None
    producerId: Optional[str] = None
    producerRevision: Optional[str] = None
    featureRevision: Optional[str] = None
    graphRevision: Optional[str] = None
    ontologyRevision: Optional[str] = None
    modelRevision: Optional[str] = None
    inputDigest: Optional[str] = None
    outputDigest: Optional[str] = None
    generatedAt: Optional[str] = None
    lastVerifiedAt: Optional[str] = None

    @staticmethod
    def from_dict(d: dict) -> "OntologyLinkedTupleProvenanceV1":
        return OntologyLinkedTupleProvenanceV1(
            sourceTables=tuple(d["sourceTables"]),
            labelerVersion=d.get("labelerVersion"),
            taggerVersion=d.get("taggerVersion"),
            ontologyVersion=d.get("ontologyVersion"),
            nlpVersion=d.get("nlpVersion"),
            sourceRevision=d.get("sourceRevision"),
            representationId=d.get("representationId"),
            representationRevision=d.get("representationRevision"),
            producerId=d.get("producerId"),
            producerRevision=d.get("producerRevision"),
            featureRevision=d.get("featureRevision"),
            graphRevision=d.get("graphRevision"),
            ontologyRevision=d.get("ontologyRevision"),
            modelRevision=d.get("modelRevision"),
            inputDigest=d.get("inputDigest"),
            outputDigest=d.get("outputDigest"),
            generatedAt=d.get("generatedAt"),
            lastVerifiedAt=d.get("lastVerifiedAt"),
        )

    def to_dict(self) -> dict:
        return {
            "sourceTables": list(self.sourceTables),
            "labelerVersion": self.labelerVersion,
            "taggerVersion": self.taggerVersion,
            "ontologyVersion": self.ontologyVersion,
            "nlpVersion": self.nlpVersion,
            "sourceRevision": self.sourceRevision,
            "representationId": self.representationId,
            "representationRevision": self.representationRevision,
            "producerId": self.producerId,
            "producerRevision": self.producerRevision,
            "featureRevision": self.featureRevision,
            "graphRevision": self.graphRevision,
            "ontologyRevision": self.ontologyRevision,
            "modelRevision": self.modelRevision,
            "inputDigest": self.inputDigest,
            "outputDigest": self.outputDigest,
            "generatedAt": self.generatedAt,
            "lastVerifiedAt": self.lastVerifiedAt,
        }


@dataclass(frozen=True, slots=True)
class OntologyLinkedTupleV1:
    tupleId: str
    schemaVersion: str
    sourceRef: str
    surfaceText: str
    label: str
    labelKind: str
    labelSource: str
    confidence: float
    evidenceState: str
    provenance: OntologyLinkedTupleProvenanceV1
    ontologyIds: tuple[str, ...] = field(default_factory=tuple)
    conceptIds: tuple[str, ...] = field(default_factory=tuple)
    participants: tuple[OntologyParticipantV1, ...] = field(default_factory=tuple)
    evidenceRefs: tuple[str, ...] = field(default_factory=tuple)
    lifecycle: str = "OBSERVED"
    packetKey: Optional[str] = None
    treeNodeId: Optional[str] = None
    documentId: Optional[str] = None
    titleId: Optional[str] = None
    tokenIndex: Optional[int] = None
    partOfSpeech: Optional[str] = None
    relationRevision: Optional[str] = None
    evidenceSpan: Optional[OntologyLinkedTupleEvidenceSpanV1] = None

    @staticmethod
    def from_dict(d: dict) -> "OntologyLinkedTupleV1":
        return OntologyLinkedTupleV1(
            tupleId=d["tupleId"],
            schemaVersion=d["schemaVersion"],
            sourceRef=d["sourceRef"],
            surfaceText=d["surfaceText"],
            label=d["label"],
            labelKind=d["labelKind"],
            labelSource=d["labelSource"],
            confidence=d["confidence"],
            evidenceState=d["evidenceState"],
            provenance=OntologyLinkedTupleProvenanceV1.from_dict(d["provenance"]),
            ontologyIds=tuple(d.get("ontologyIds", [])),
            conceptIds=tuple(d.get("conceptIds", [])),
            participants=tuple(OntologyParticipantV1.from_dict(p) for p in d.get("participants", [])),
            evidenceRefs=tuple(d.get("evidenceRefs", [])),
            lifecycle=d.get("lifecycle", "OBSERVED"),
            packetKey=d.get("packetKey"),
            treeNodeId=d.get("treeNodeId"),
            documentId=d.get("documentId"),
            titleId=d.get("titleId"),
            tokenIndex=d.get("tokenIndex"),
            partOfSpeech=d.get("partOfSpeech"),
            relationRevision=d.get("relationRevision"),
            evidenceSpan=OntologyLinkedTupleEvidenceSpanV1.from_dict(d["evidenceSpan"]) if d.get("evidenceSpan") else None,
        )

    def to_dict(self) -> dict:
        return {
            "tupleId": self.tupleId,
            "schemaVersion": self.schemaVersion,
            "packetKey": self.packetKey,
            "sourceRef": self.sourceRef,
            "treeNodeId": self.treeNodeId,
            "documentId": self.documentId,
            "titleId": self.titleId,
            "surfaceText": self.surfaceText,
            "tokenIndex": self.tokenIndex,
            "partOfSpeech": self.partOfSpeech,
            "label": self.label,
            "labelKind": self.labelKind,
            "labelSource": self.labelSource,
            "ontologyIds": list(self.ontologyIds),
            "conceptIds": list(self.conceptIds),
            "participants": [p.to_dict() for p in self.participants],
            "evidenceRefs": list(self.evidenceRefs),
            "relationRevision": self.relationRevision,
            "evidenceSpan": self.evidenceSpan.to_dict() if self.evidenceSpan else None,
            "confidence": self.confidence,
            "evidenceState": self.evidenceState,
            "lifecycle": self.lifecycle,
            "provenance": self.provenance.to_dict(),
        }
