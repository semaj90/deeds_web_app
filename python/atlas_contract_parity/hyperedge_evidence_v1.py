from __future__ import annotations

import hashlib
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from atlas_contract_parity.common import canonical
from atlas_contract_parity.research_evidence_v1 import ResearchEvidenceV1

NonEmpty = Annotated[str, StringConstraints(min_length=1)]
Sha256 = Annotated[str, StringConstraints(pattern=r"^sha256:[0-9a-f]{64}$")]
HexChecksum = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


def _sha(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf8")).hexdigest()


class HyperedgeParticipantV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    canonicalId: NonEmpty
    role: NonEmpty
    # TS `ordinal` is optional but rejects explicit null. A default of None
    # makes it optional in Pydantic's JSON Schema without making it nullable.
    ordinal: int = Field(default=None, ge=0, le=9007199254740991)


class HyperedgeV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["atlas.hyperedge.v1"]
    hyperedgeId: NonEmpty
    predicate: NonEmpty
    participants: Annotated[list[HyperedgeParticipantV1], Field(min_length=2)]
    evidenceRefs: list[NonEmpty]
    workspaceRevision: NonEmpty
    graphRevision: NonEmpty
    sourceRevision: NonEmpty
    producerRevision: NonEmpty
    checksum: HexChecksum


class HyperEdgeEvidenceBindingV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    evidenceId: NonEmpty
    evidenceRef: NonEmpty


class HyperEdgeEvidenceV1(BaseModel):
    """Independent Pydantic mirror; this envelope is evidence-only, not graph authority."""

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)

    schema_: Literal["atlas.hyperedge-evidence.v1"] = Field(alias="schema")
    hyperedge: HyperedgeV1
    evidence: Annotated[list[ResearchEvidenceV1], Field(min_length=1)]
    bindings: Annotated[list[HyperEdgeEvidenceBindingV1], Field(min_length=1)]
    producerRevision: NonEmpty
    checksum: Sha256
    writesPerformed: Literal[False]
    canonicalAuthority: Literal[False]

    @model_validator(mode="after")
    def _binding_and_checksum_rules(self) -> "HyperEdgeEvidenceV1":
        # Preserve TS optional-field semantics: omitted ordinal stays omitted,
        # rather than becoming an explicit JSON null in checksum material.
        dump = self.model_dump(by_alias=True, mode="json", exclude_unset=True)
        evidence = dump["evidence"]
        ids = [item["evidenceId"] for item in evidence]
        if len(set(ids)) != len(ids):
            raise ValueError("DUPLICATE_EVIDENCE_ID")
        evidence_by_id = {item["evidenceId"]: item for item in evidence}
        bound_ids: set[str] = set()
        bound_refs: set[str] = set()
        for binding in dump["bindings"]:
            item = evidence_by_id.get(binding["evidenceId"])
            if item is None:
                raise ValueError("UNKNOWN_EVIDENCE_ID")
            if binding["evidenceRef"] not in item["evidenceRefs"]:
                raise ValueError("EVIDENCE_REF_NOT_CITED_BY_ITEM")
            if binding["evidenceRef"] not in dump["hyperedge"]["evidenceRefs"]:
                raise ValueError("EVIDENCE_REF_NOT_ON_HYPEREDGE")
            if binding["evidenceRef"] in bound_refs:
                raise ValueError("DUPLICATE_EVIDENCE_REF_BINDING")
            bound_ids.add(binding["evidenceId"])
            bound_refs.add(binding["evidenceRef"])
        edge_refs = dump["hyperedge"]["evidenceRefs"]
        if len(set(edge_refs)) != len(edge_refs) or bound_ids != set(evidence_by_id):
            raise ValueError("UNBOUND_OR_DUPLICATE_EVIDENCE")
        if set(edge_refs) != bound_refs:
            raise ValueError("HYPEREDGE_EVIDENCE_REF_SET_MISMATCH")
        body = {key: value for key, value in dump.items() if key != "checksum"}
        if _sha(canonical(body)) != self.checksum:
            raise ValueError("HYPEREDGE_EVIDENCE_CHECKSUM_MISMATCH")
        return self
