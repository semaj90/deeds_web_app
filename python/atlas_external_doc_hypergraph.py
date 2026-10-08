"""Read-only external-document -> grounded hypergraph proposal adapter.

This module intentionally DOES NOT write Neo4j, Qdrant, Postgres, Redis/Valkey,
or any other store. It consumes already-normalized external-document evidence
and already-grounded facts, then emits revision-qualified proposal records for
the existing OntologyLinkedTupleV1 / HyperedgeV1 owners.

Graph revision is deliberately absent here. A proposal cannot become a
HyperedgeV1 until the existing graph owner supplies an admitted graph revision.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from typing import Any, Iterable, Mapping, Sequence


def _sha256_hex(data: str | bytes) -> str:
    payload = data if isinstance(data, bytes) else data.encode("utf-8")
    return sha256(payload).hexdigest()


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True)
class GroundedFactParticipantV1:
    entity_id: str
    entity_kind: str
    role: str
    label: str | None = None

    def __post_init__(self) -> None:
        if not self.entity_id.strip() or not self.entity_kind.strip() or not self.role.strip():
            raise ValueError("PARTICIPANT_ID_KIND_ROLE_REQUIRED")


@dataclass(frozen=True)
class GroundedFactBridgeV1:
    """Adapter input; NOT a second grounded-fact owner.

    Callers map the existing grounded_nlp_fact_v1 fields into this shape.
    """

    fact_id: str
    predicate: str
    source_ref: str
    source_revision: str
    workspace_revision: str
    producer_revision: str
    evidence_start_byte: int
    evidence_end_byte: int
    evidence_text: str
    evidence_checksum: str
    participants: tuple[GroundedFactParticipantV1, ...]
    ontology_ids: tuple[str, ...] = ()
    concept_ids: tuple[str, ...] = ()
    confidence: float = 1.0
    canonical_authority: bool = False

    def __post_init__(self) -> None:
        for value, code in (
            (self.fact_id, "FACT_ID_REQUIRED"),
            (self.predicate, "PREDICATE_REQUIRED"),
            (self.source_ref, "SOURCE_REF_REQUIRED"),
            (self.source_revision, "SOURCE_REVISION_REQUIRED"),
            (self.workspace_revision, "WORKSPACE_REVISION_REQUIRED"),
            (self.producer_revision, "PRODUCER_REVISION_REQUIRED"),
            (self.evidence_checksum, "EVIDENCE_CHECKSUM_REQUIRED"),
        ):
            if not value.strip():
                raise ValueError(code)
        if self.evidence_start_byte < 0 or self.evidence_end_byte < self.evidence_start_byte:
            raise ValueError("INVALID_EVIDENCE_BYTE_SPAN")
        if len(self.participants) < 2:
            raise ValueError("HYPERGRAPH_FACT_REQUIRES_AT_LEAST_TWO_PARTICIPANTS")
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError("CONFIDENCE_OUT_OF_RANGE")
        if self.canonical_authority:
            raise ValueError("GROUNDED_FACT_BRIDGE_CANONICAL_AUTHORITY_FORBIDDEN")


@dataclass(frozen=True)
class HypergraphFactProposalV1:
    schema: str
    proposal_id: str
    fact_id: str
    predicate: str
    source_ref: str
    source_revision: str
    workspace_revision: str
    producer_revision: str
    evidence_start_byte: int
    evidence_end_byte: int
    evidence_text: str
    evidence_checksum: str
    participants: tuple[GroundedFactParticipantV1, ...]
    ontology_ids: tuple[str, ...]
    concept_ids: tuple[str, ...]
    confidence: float
    proposal_checksum: str
    graph_revision: None
    admission_state: str
    canonical_authority: bool
    writes_performed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_hypergraph_fact_proposal_v1(fact: GroundedFactBridgeV1) -> HypergraphFactProposalV1:
    normalized_participants = tuple(
        sorted(
            fact.participants,
            key=lambda p: (p.role, p.entity_kind, p.entity_id, p.label or ""),
        )
    )

    body = {
        "schema": "atlas.hypergraph-fact-proposal.v1",
        "fact_id": fact.fact_id,
        "predicate": fact.predicate,
        "source_ref": fact.source_ref,
        "source_revision": fact.source_revision,
        "workspace_revision": fact.workspace_revision,
        "producer_revision": fact.producer_revision,
        "evidence_start_byte": fact.evidence_start_byte,
        "evidence_end_byte": fact.evidence_end_byte,
        "evidence_text": fact.evidence_text,
        "evidence_checksum": fact.evidence_checksum,
        "participants": [asdict(p) for p in normalized_participants],
        "ontology_ids": sorted(set(fact.ontology_ids)),
        "concept_ids": sorted(set(fact.concept_ids)),
        "confidence": fact.confidence,
        "graph_revision": None,
        "admission_state": "PROPOSAL_ONLY",
        "canonical_authority": False,
        "writes_performed": False,
    }
    proposal_checksum = _sha256_hex(_stable_json(body))
    proposal_id = _sha256_hex(
        "|".join(
            [
                fact.fact_id,
                fact.source_revision,
                fact.workspace_revision,
                fact.producer_revision,
                fact.evidence_checksum,
                proposal_checksum,
            ]
        )
    )

    return HypergraphFactProposalV1(
        schema="atlas.hypergraph-fact-proposal.v1",
        proposal_id=proposal_id,
        fact_id=fact.fact_id,
        predicate=fact.predicate,
        source_ref=fact.source_ref,
        source_revision=fact.source_revision,
        workspace_revision=fact.workspace_revision,
        producer_revision=fact.producer_revision,
        evidence_start_byte=fact.evidence_start_byte,
        evidence_end_byte=fact.evidence_end_byte,
        evidence_text=fact.evidence_text,
        evidence_checksum=fact.evidence_checksum,
        participants=normalized_participants,
        ontology_ids=tuple(sorted(set(fact.ontology_ids))),
        concept_ids=tuple(sorted(set(fact.concept_ids))),
        confidence=fact.confidence,
        proposal_checksum=proposal_checksum,
        graph_revision=None,
        admission_state="PROPOSAL_ONLY",
        canonical_authority=False,
        writes_performed=False,
    )


def build_request_local_incidence_v1(
    proposals: Sequence[HypergraphFactProposalV1],
) -> tuple[dict[str, Any], ...]:
    """Build request-local incidence rows for NetworkX/cuGraph adapters.

    These rows are compute inputs only. They are not HyperedgeV1 persistence rows.
    """

    rows: list[dict[str, Any]] = []
    for proposal in proposals:
        for ordinal, participant in enumerate(proposal.participants):
            rows.append(
                {
                    "proposal_id": proposal.proposal_id,
                    "fact_id": proposal.fact_id,
                    "predicate": proposal.predicate,
                    "participant_id": participant.entity_id,
                    "participant_kind": participant.entity_kind,
                    "participant_role": participant.role,
                    "ordinal": ordinal,
                    "source_revision": proposal.source_revision,
                    "workspace_revision": proposal.workspace_revision,
                    "producer_revision": proposal.producer_revision,
                    "proposal_checksum": proposal.proposal_checksum,
                    "canonical_authority": False,
                }
            )

    rows.sort(
        key=lambda row: (
            row["proposal_id"],
            row["ordinal"],
            row["participant_role"],
            row["participant_id"],
        )
    )
    return tuple(rows)


def validate_evidence_slice_v1(*, normalized_text: str, fact: GroundedFactBridgeV1) -> None:
    encoded = normalized_text.encode("utf-8")
    if fact.evidence_end_byte > len(encoded):
        raise ValueError("EVIDENCE_BYTE_SPAN_OUT_OF_RANGE")
    surface = encoded[fact.evidence_start_byte : fact.evidence_end_byte].decode("utf-8")
    if surface != fact.evidence_text:
        raise ValueError("EVIDENCE_TEXT_BYTE_SPAN_MISMATCH")
    expected = _sha256_hex(fact.evidence_text)
    if fact.evidence_checksum not in (expected, f"sha256:{expected}"):
        raise ValueError("EVIDENCE_CHECKSUM_MISMATCH")


def build_grounded_fact_bridge_from_external_doc_chunk_v1(
    *,
    chunk: Mapping[str, Any],
    workspace_revision: str,
    producer_revision: str,
    fact_id: str,
    predicate: str,
    evidence_start_byte_in_chunk: int,
    evidence_end_byte_in_chunk: int,
    evidence_text: str,
    participants: Sequence[GroundedFactParticipantV1],
    ontology_ids: Sequence[str] = (),
    concept_ids: Sequence[str] = (),
    confidence: float = 1.0,
) -> GroundedFactBridgeV1:
    """Map an existing ExternalDoc ChunkRecord dict into the hypergraph bridge.

    The chunk is expected to be ChunkRecord.to_dict() or an equivalent
    validated record from atlas_external_docs. Byte offsets supplied here are
    relative to the chunk text; the emitted fact carries absolute byte offsets
    within the normalized source document.
    """

    required = ("source_id", "source_revision", "source_url", "text", "start_byte", "end_byte")
    missing = [key for key in required if key not in chunk or chunk[key] in (None, "")]
    if missing:
        raise ValueError(f"EXTERNAL_DOC_CHUNK_FIELDS_MISSING:{','.join(missing)}")
    if not workspace_revision.strip():
        raise ValueError("WORKSPACE_REVISION_REQUIRED")
    if not producer_revision.strip():
        raise ValueError("PRODUCER_REVISION_REQUIRED")

    text = str(chunk["text"])
    encoded = text.encode("utf-8")
    if evidence_start_byte_in_chunk < 0 or evidence_end_byte_in_chunk < evidence_start_byte_in_chunk:
        raise ValueError("INVALID_CHUNK_RELATIVE_EVIDENCE_SPAN")
    if evidence_end_byte_in_chunk > len(encoded):
        raise ValueError("CHUNK_RELATIVE_EVIDENCE_SPAN_OUT_OF_RANGE")
    actual = encoded[evidence_start_byte_in_chunk:evidence_end_byte_in_chunk].decode("utf-8")
    if actual != evidence_text:
        raise ValueError("CHUNK_RELATIVE_EVIDENCE_TEXT_MISMATCH")

    absolute_start = int(chunk["start_byte"]) + evidence_start_byte_in_chunk
    absolute_end = int(chunk["start_byte"]) + evidence_end_byte_in_chunk
    if absolute_end > int(chunk["end_byte"]):
        raise ValueError("ABSOLUTE_EVIDENCE_SPAN_EXCEEDS_CHUNK")

    evidence_checksum = _sha256_hex(evidence_text)
    source_ref = str(chunk.get("source_url") or chunk.get("source_id"))

    return GroundedFactBridgeV1(
        fact_id=fact_id,
        predicate=predicate,
        source_ref=source_ref,
        source_revision=str(chunk["source_revision"]),
        workspace_revision=workspace_revision,
        producer_revision=producer_revision,
        evidence_start_byte=absolute_start,
        evidence_end_byte=absolute_end,
        evidence_text=evidence_text,
        evidence_checksum=evidence_checksum,
        participants=tuple(participants),
        ontology_ids=tuple(ontology_ids),
        concept_ids=tuple(concept_ids),
        confidence=confidence,
        canonical_authority=False,
    )
