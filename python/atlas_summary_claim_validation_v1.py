"""VAL-02: Pydantic MIRROR of SummaryClaimValidationV1 (TypeScript/Zod is the authority; this is transport/parity only).

Source of truth: sveltekit-frontend/src/lib/server/atlas/docs/summary-claim-validation-v1.ts and its canonical fixture
sveltekit-frontend/src/lib/server/atlas/docs/__fixtures__/summary-claim-validation-v1.fixture.json.

No second hasher: checksums use ``atlas_doc_coordinate.canonical_sha256_v1``, the existing faithful port of the frontend-owned
``canonicalSha256V1`` (parity vectors: __fixtures__/canonical-hash-parity-v1.golden.json). ``validationId``, ``claimChecksum`` and
``validationChecksum`` are recomputed and must equal the values carried by the object, exactly like the Zod owner. No model calls,
no database, no retrieval, no decision algorithm (VAL-09 owns ADMIT/REVIEW/REJECT; this mirror only validates structure).
"""
from __future__ import annotations

import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from atlas_doc_coordinate import canonical_sha256_v1

SCHEMA = "atlas.summary-claim-validation.v1"
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_CHUNK_REV = re.compile(r"^sha256:[a-f0-9]{64}$")
_ANALYSIS_ID = re.compile(r"^eda:[a-f0-9]{64}$")
_PLACEHOLDER_REVISIONS = {"latest", "unknown"}


def _sha(value: str) -> str:
    if not _SHA256.match(value):
        raise ValueError("expected 64 lowercase hex characters")
    return value


def _explicit(value: Optional[str]) -> Optional[str]:
    if value is not None and (not value or value.strip().lower() in _PLACEHOLDER_REVISIONS):
        raise ValueError("revision must be explicit, not empty/latest/unknown")
    return value


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ChunkByteSpan(_Strict):
    startByte: int = Field(ge=0)
    endByte: int = Field(gt=0)
    textChecksum: str

    @field_validator("textChecksum")
    @classmethod
    def _ck(cls, v: str) -> str:
        return _sha(v)

    @model_validator(mode="after")
    def _range(self) -> "ChunkByteSpan":
        if self.endByte <= self.startByte:
            raise ValueError("endByte must exceed startByte")
        return self


_DetStatus = Literal["NOT_RUN", "PASS", "FAIL", "REVIEW"]


class TechnicalSlot(_Strict):
    status: _DetStatus
    sourceTokens: list[str]
    claimTokens: list[str]
    missingTechnicalTokens: list[str]
    unexpectedTechnicalTokens: list[str]


class NumericSlot(_Strict):
    status: _DetStatus
    sourceValues: list[str]
    claimValues: list[str]
    unsupportedValues: list[str]


class VersionSlot(_Strict):
    status: _DetStatus
    sourceVersions: list[str]
    claimVersions: list[str]
    unsupportedVersions: list[str]


class SourceSpanSlot(_Strict):
    status: Literal["NOT_RUN", "VERIFIED", "UNVERIFIED", "NO_CLAIMED_SPAN"]
    spans: list[ChunkByteSpan]


SemanticVerdict = Literal[
    "SUPPORTED", "SUPPORTED_PARAPHRASE", "SUPPORTED_WITH_OMISSION", "PARTIALLY_SUPPORTED",
    "UNSUPPORTED_CLAIM", "CONTRADICTED", "INSUFFICIENT_EVIDENCE", "UNKNOWN",
]


class SemanticSlot(_Strict):
    status: Literal["NOT_RUN", "JUDGED", "JUDGE_ERROR"]
    verdict: Optional[SemanticVerdict]
    citedSpans: list[ChunkByteSpan]
    unsupportedFragment: Optional[str]
    judgeModelId: Optional[str]
    judgeModelRevision: Optional[str]
    judgePromptRevision: Optional[str]
    independenceClass: Optional[Literal["SAME_MODEL_SEMANTIC_JUDGE", "INDEPENDENT_MODEL_JUDGE"]]

    @field_validator("judgeModelRevision", "judgePromptRevision")
    @classmethod
    def _rev(cls, v: Optional[str]) -> Optional[str]:
        return _explicit(v)

    @model_validator(mode="after")
    def _invariants(self) -> "SemanticSlot":
        judged = self.status == "JUDGED"
        if judged and self.verdict is None:
            raise ValueError("JUDGED requires a verdict")
        if not judged and self.verdict is not None:
            raise ValueError("a verdict is only valid when JUDGED")
        if judged and not (self.judgeModelId and self.judgeModelRevision and self.judgePromptRevision and self.independenceClass):
            raise ValueError("JUDGED requires judge model id/revision, prompt revision and independenceClass")
        if self.status == "NOT_RUN" and (self.citedSpans or self.unsupportedFragment is not None):
            raise ValueError("NOT_RUN semantic slot must be empty")
        return self


class OntologyAssertion(_Strict):
    subject: str = Field(min_length=1)
    predicate: str = Field(min_length=1)
    object: str = Field(min_length=1)
    status: Literal["SUPPORTED", "REVIEW", "REJECTED"]
    evidenceRef: str = Field(min_length=1)


class OntologySlot(_Strict):
    status: Literal["NOT_RUN", "NOT_APPLICABLE", "PASS", "FAIL"]
    kernelRevision: Optional[str]
    assertions: list[OntologyAssertion]

    @field_validator("kernelRevision")
    @classmethod
    def _rev(cls, v: Optional[str]) -> Optional[str]:
        return _explicit(v)

    @model_validator(mode="after")
    def _invariants(self) -> "OntologySlot":
        if self.status in ("PASS", "FAIL") and not self.kernelRevision:
            raise ValueError("a run ontology slot requires kernelRevision")
        if self.status in ("NOT_RUN", "NOT_APPLICABLE") and self.assertions:
            raise ValueError("no assertions without a run")
        return self


class ClaimDecision(_Strict):
    decision: Literal["PENDING", "ADMIT", "REVIEW", "REJECT"]
    escalationRevision: Optional[str]

    @field_validator("escalationRevision")
    @classmethod
    def _rev(cls, v: Optional[str]) -> Optional[str]:
        return _explicit(v)


ResolutionLayer = Literal["NOT_RESOLVED", "TECHNICAL", "NUMERIC", "VERSION", "SOURCE_SPAN", "SEMANTIC", "ONTOLOGY", "COMPOSITE"]


def claim_checksum_v1(claim_text: str) -> str:
    return canonical_sha256_v1({"schema": "atlas.summary-claim.v1", "claimText": claim_text})


def _plain(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json", by_alias=True)


def seal_v1(body: dict[str, Any]) -> dict[str, str]:
    """Recompute claimChecksum/validationId/validationChecksum from an object body (any existing seal fields are ignored)."""
    claim_checksum = claim_checksum_v1(body["claimText"])
    validation_id = "scv:" + canonical_sha256_v1({
        "schema": SCHEMA, "chunkEvidenceRevision": body["chunkEvidenceRevision"], "summaryOutputChecksum": body["summaryOutputChecksum"],
        "claimOrdinal": body["claimOrdinal"], "validatorRevision": body["validatorRevision"],
    })
    rest = {k: v for k, v in body.items() if k not in ("validationId", "validationChecksum", "claimChecksum")}
    return {"claimChecksum": claim_checksum, "validationId": validation_id, "validationChecksum": canonical_sha256_v1({**rest, "claimChecksum": claim_checksum, "validationId": validation_id})}


class SummaryClaimValidation(_Strict):
    schema_: Literal["atlas.summary-claim-validation.v1"] = Field(alias="schema")
    chunkId: str = Field(min_length=1)
    chunkEvidenceRevision: str
    analysisId: Optional[str]
    summaryInputChecksum: str
    summaryOutputChecksum: str
    claimOrdinal: int = Field(ge=0)
    claimText: str = Field(min_length=1)
    claimChecksum: str
    technical: TechnicalSlot
    numeric: NumericSlot
    version: VersionSlot
    sourceSpan: SourceSpanSlot
    semantic: SemanticSlot
    ontology: OntologySlot
    result: ClaimDecision
    resolutionLayer: ResolutionLayer
    validatorRevision: str
    canonicalAuthority: Literal[False]
    validationId: str
    validationChecksum: str

    @field_validator("chunkEvidenceRevision")
    @classmethod
    def _chunk_rev(cls, v: str) -> str:
        if not _CHUNK_REV.match(v):
            raise ValueError("chunkEvidenceRevision must be sha256:<64 hex>")
        return v

    @field_validator("analysisId")
    @classmethod
    def _analysis(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _ANALYSIS_ID.match(v):
            raise ValueError("analysisId must be eda:<64 hex>")
        return v

    @field_validator("summaryInputChecksum", "summaryOutputChecksum", "claimChecksum", "validationChecksum")
    @classmethod
    def _hex(cls, v: str) -> str:
        return _sha(v)

    @field_validator("validatorRevision")
    @classmethod
    def _revision(cls, v: str) -> str:
        if not v:
            raise ValueError("validatorRevision required")
        return _explicit(v) or v

    @model_validator(mode="after")
    def _seal(self) -> "SummaryClaimValidation":
        expected = seal_v1(_plain(self))
        if self.claimChecksum != expected["claimChecksum"]:
            raise ValueError("claimChecksum does not match claimText")
        if self.validationId != expected["validationId"] or not re.match(r"^scv:[a-f0-9]{64}$", self.validationId):
            raise ValueError("validationId does not match the recomputed identity")
        if self.validationChecksum != expected["validationChecksum"]:
            raise ValueError("validationChecksum does not match the recomputed content")
        return self


def parse_summary_claim_validation_v1(payload: dict[str, Any]) -> SummaryClaimValidation:
    return SummaryClaimValidation.model_validate(payload)


def dump_summary_claim_validation_v1(model: SummaryClaimValidation) -> dict[str, Any]:
    return _plain(model)
