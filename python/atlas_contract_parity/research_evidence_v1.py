from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

SOURCE_KINDS = ("CODE", "PINNED_DOCUMENTATION", "OPENWIKI_CLAIM", "WEB")

NonEmpty = Annotated[str, StringConstraints(min_length=1)]
Sha256 = Annotated[str, StringConstraints(pattern=r"^sha256:[0-9a-f]{64}$")]
HttpUrl = Annotated[str, StringConstraints(pattern=r"^https?://\S+$")]
UtcTimestamp = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$")]


class WebProvenanceV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    url: HttpUrl
    fetchedAt: UtcTimestamp
    responseDigest: Sha256


class ResearchEvidenceV1(BaseModel):
    """Independent Pydantic implementation of researchEvidenceV1Schema
    (sveltekit-frontend/src/lib/server/atlas/contracts/research-evidence-v1.ts). Strict, closed, never canonical."""

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)

    schema_: Literal["atlas.research-evidence.v1"] = Field(alias="schema")
    evidenceId: NonEmpty
    sourceKind: Literal[SOURCE_KINDS]  # type: ignore[valid-type]
    sourceRef: NonEmpty
    sourceRevision: Optional[NonEmpty]
    contentDigest: Sha256
    proposition: NonEmpty
    confidence: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    evidenceRefs: Annotated[list[NonEmpty], Field(min_length=1)]
    webProvenance: Optional[WebProvenanceV1]
    producerRevision: NonEmpty
    canonicalAuthority: Literal[False]

    @model_validator(mode="after")
    def _cross_field_rules(self) -> "ResearchEvidenceV1":
        # Same three superRefine rules as the Zod contract; JSON Schema cannot express them.
        if self.sourceKind != "WEB" and self.sourceRevision is None:
            raise ValueError("SOURCE_REVISION_REQUIRED_FOR_REVISIONED_SOURCE")
        if self.sourceKind == "WEB" and self.webProvenance is None:
            raise ValueError("WEB_PROVENANCE_REQUIRED_FOR_WEB")
        if self.sourceKind != "WEB" and self.webProvenance is not None:
            raise ValueError("WEB_PROVENANCE_FORBIDDEN_FOR_NON_WEB")
        return self
