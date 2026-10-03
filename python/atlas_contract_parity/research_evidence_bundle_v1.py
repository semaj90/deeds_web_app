from __future__ import annotations

import hashlib
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from atlas_contract_parity.common import canonical
from atlas_contract_parity.research_evidence_v1 import ResearchEvidenceV1

NonEmpty = Annotated[str, StringConstraints(min_length=1)]
Sha256 = Annotated[str, StringConstraints(pattern=r"^sha256:[0-9a-f]{64}$")]


def _sha(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf8")).hexdigest()


def _by_id(e: dict[str, Any]) -> bytes:
    return e["evidenceId"].encode("utf8")  # UTF-8 byte order, matching compareUtf8 on the Zod side


def item_checksum(item: dict[str, Any]) -> str:
    return _sha(canonical(item))


def evidence_set_checksum(evidence: list[dict[str, Any]]) -> str:
    """Independent implementation of researchEvidenceSetChecksumV1: order-independent identity of the evidence."""
    return _sha(canonical([{"evidenceId": e["evidenceId"], "itemChecksum": item_checksum(e)} for e in sorted(evidence, key=_by_id)]))


def bundle_checksum(dump: dict[str, Any]) -> str:
    """Independent implementation of researchEvidenceBundleChecksumV1: whole bundle minus bundleChecksum, evidence sorted by evidenceId."""
    body = {k: v for k, v in dump.items() if k != "bundleChecksum"}
    body["evidence"] = sorted(body["evidence"], key=_by_id)
    return _sha(canonical(body))


class ResearchEvidenceBundleV1(BaseModel):
    """Independent Pydantic implementation of researchEvidenceBundleV1Schema
    (sveltekit-frontend/src/lib/server/atlas/contracts/research-evidence-bundle-v1.ts)."""

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)

    schema_: Literal["atlas.research-evidence-bundle.v1"] = Field(alias="schema")
    requestId: NonEmpty
    workspaceRevision: Sha256
    evidence: Annotated[list[ResearchEvidenceV1], Field(min_length=1)]
    producerRevision: NonEmpty
    evidenceSetChecksum: Sha256
    bundleChecksum: Sha256
    writesPerformed: Literal[False]
    canonicalAuthority: Literal[False]

    @model_validator(mode="after")
    def _cross_field_rules(self) -> "ResearchEvidenceBundleV1":
        dump = self.model_dump(by_alias=True, mode="json")
        ids = [e["evidenceId"] for e in dump["evidence"]]
        if len(set(ids)) != len(ids):
            raise ValueError("DUPLICATE_EVIDENCE_ID")
        if evidence_set_checksum(dump["evidence"]) != self.evidenceSetChecksum:
            raise ValueError("EVIDENCE_SET_CHECKSUM_MISMATCH")
        if bundle_checksum(dump) != self.bundleChecksum:
            raise ValueError("BUNDLE_CHECKSUM_MISMATCH")
        return self
