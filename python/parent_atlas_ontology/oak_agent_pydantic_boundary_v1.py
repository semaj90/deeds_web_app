"""Optional Pydantic v2 boundary for read-only OaK hypergraph proposals.

No canonical identity, retrieval admission, model execution, or persistence.
This module is intentionally absent from core package imports.
"""
from __future__ import annotations

from hashlib import sha256
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from atlas_external_doc_hypergraph import (
    GroundedFactBridgeV1,
    GroundedFactParticipantV1,
    build_hypergraph_fact_proposal_v1,
)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class ParticipantInputV1(_Strict):
    entity_id: str = Field(min_length=1)
    entity_kind: str = Field(min_length=1)
    role: str = Field(min_length=1)
    label: str | None = None

    @field_validator("entity_id", "entity_kind", "role")
    @classmethod
    def reject_whitespace(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("EMPTY_OR_PADDED_PARTICIPANT_FIELD")
        return value


class GroundedFactInputV1(_Strict):
    fact_id: str = Field(min_length=1)
    predicate: str = Field(min_length=1)
    source_ref: str = Field(min_length=1)
    source_revision: str = Field(min_length=1)
    workspace_revision: str = Field(min_length=1)
    producer_revision: str = Field(min_length=1)
    evidence_start_byte: int = Field(ge=0)
    evidence_end_byte: int = Field(ge=0)
    evidence_text: str = Field(min_length=1)
    evidence_checksum: str = Field(pattern=r"^[0-9a-f]{64}$")
    participants: tuple[ParticipantInputV1, ...] = Field(min_length=2)
    ontology_ids: tuple[str, ...] = ()
    concept_ids: tuple[str, ...] = ()
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, allow_inf_nan=False)
    canonical_authority: Literal[False] = False

    @field_validator(
        "fact_id", "predicate", "source_ref", "source_revision",
        "workspace_revision", "producer_revision",
    )
    @classmethod
    def require_exact_text(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("EMPTY_OR_PADDED_IDENTITY")
        if value.lower() in {"unknown", "latest", "unset", "null"}:
            raise ValueError("PLACEHOLDER_REVISION_OR_ID")
        return value

    @model_validator(mode="after")
    def evidence_integrity(self) -> "GroundedFactInputV1":
        # Coordinates refer to the separately verified source snapshot; matching
        # only the text's digest here does not prove source-span provenance.
        if self.evidence_end_byte <= self.evidence_start_byte:
            raise ValueError("EMPTY_OR_REVERSED_BYTE_SPAN")
        if len(self.evidence_text.encode("utf-8")) != self.evidence_end_byte - self.evidence_start_byte:
            raise ValueError("EVIDENCE_UTF8_BYTE_LENGTH_MISMATCH")
        if sha256(self.evidence_text.encode("utf-8")).hexdigest() != self.evidence_checksum:
            raise ValueError("EVIDENCE_CHECKSUM_MISMATCH")
        return self

    def to_existing_bridge(self) -> GroundedFactBridgeV1:
        return GroundedFactBridgeV1(
            fact_id=self.fact_id, predicate=self.predicate,
            source_ref=self.source_ref, source_revision=self.source_revision,
            workspace_revision=self.workspace_revision,
            producer_revision=self.producer_revision,
            evidence_start_byte=self.evidence_start_byte,
            evidence_end_byte=self.evidence_end_byte,
            evidence_text=self.evidence_text,
            evidence_checksum=self.evidence_checksum,
            participants=tuple(GroundedFactParticipantV1(**p.model_dump()) for p in self.participants),
            ontology_ids=self.ontology_ids, concept_ids=self.concept_ids,
            confidence=self.confidence, canonical_authority=False,
        )


class OakAgentRequestV1(_Strict):
    schema: Literal["atlas.oak-agent-proposal-request.v1"]
    request_id: str = Field(min_length=1)
    ontology_revision: str = Field(min_length=1)
    grounded_fact: GroundedFactInputV1
    mode: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


class OakAgentResponseV1(_Strict):
    schema: Literal["atlas.oak-agent-proposal-response.v1"]
    request_id: str
    proposal_checksum: str = Field(pattern=r"^[0-9a-f]{64}$")
    proposal: dict
    mode: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


def propose_read_only(payload: dict) -> dict:
    """Return deterministic proposal only; do not call an agent or any store."""
    request_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    request = OakAgentRequestV1.model_validate_json(request_json)
    proposal = build_hypergraph_fact_proposal_v1(
        request.grounded_fact.to_existing_bridge()
    )
    result = OakAgentResponseV1(
        schema="atlas.oak-agent-proposal-response.v1",
        request_id=request.request_id,
        proposal_checksum=proposal.proposal_checksum,
        proposal=proposal.to_dict(),
    )
    return result.model_dump(mode="json")


def proposal_json(payload: dict) -> str:
    return json.dumps(propose_read_only(payload), sort_keys=True, separators=(",", ":"))
