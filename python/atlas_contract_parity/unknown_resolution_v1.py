from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

SUBJECT_KINDS = ("PACKET_IDENTITY", "FEATURE_EVIDENCE_GAP", "PINNED_DOC_GAP", "OPENWIKI_CLAIM_STALE", "ONTOLOGY_RESOLUTION_GAP", "HUMAN_REVIEW_REQUIRED")
STATUSES = ("OPEN", "RESOLVING", "RESOLVED", "BLOCKED", "SUPERSEDED")
RESOLVER_KINDS = ("SOURCE_LINEAGE_REPAIR", "SUMMARY_GENERATION", "PINNED_DOC_CRAWL", "OPENWIKI_REFRESH", "ONTOLOGY_RESOLUTION", "PACKET_PROMOTION_PIPELINE", "HUMAN_LABEL", "UNASSIGNED")

REASON_CODES = ("NO_PROVEN_CHUNK_LINEAGE", "CHUNK_WITHOUT_QUALIFIED_SUMMARY", "PACKET_IDENTITY_UNRESOLVED", "PINNED_DOCUMENTATION_MISSING", "OPENWIKI_CLAIM_STALE", "ONTOLOGY_RESOLUTION_UNAVAILABLE", "HUMAN_JUDGMENT_REQUIRED")

NonEmpty = Annotated[str, StringConstraints(min_length=1)]
# UUIDv5 only (matches the Zod regex exactly).
UuidV5 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")]


class UnknownResolutionV1(BaseModel):
    """Mirror of unknownResolutionV1Schema (sveltekit-frontend/src/lib/server/atlas/contracts/unknown-resolution-v1.ts).
    Strict, no extra fields (so no value/rawCosine can ride along), canonicalAuthority is always False."""

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)

    schema_: Literal["atlas.unknown-resolution.v1"] = Field(alias="schema")
    unknownId: UuidV5
    subjectKind: Literal[SUBJECT_KINDS]  # type: ignore[valid-type]
    subjectId: NonEmpty
    snapshotRevision: Optional[NonEmpty]
    unknownKind: NonEmpty
    featureName: Optional[NonEmpty]
    reasonCode: Literal[REASON_CODES]  # type: ignore[valid-type]
    requiredEvidenceKind: NonEmpty
    resolverKind: Literal[RESOLVER_KINDS]  # type: ignore[valid-type]
    status: Literal[STATUSES]  # type: ignore[valid-type]
    evidenceRefs: list[NonEmpty]
    resolutionRevision: Optional[NonEmpty]
    canonicalAuthority: Literal[False]

    @model_validator(mode="after")
    def _cross_field_rules(self) -> "UnknownResolutionV1":
        # Same three superRefine rules as the Zod contract (JSON Schema cannot express them).
        if self.subjectKind != "PACKET_IDENTITY" and self.snapshotRevision is None:
            raise ValueError("SNAPSHOT_REVISION_REQUIRED_FOR_NON_PACKET_IDENTITY")
        if self.subjectKind == "FEATURE_EVIDENCE_GAP" and self.featureName is None:
            raise ValueError("FEATURE_NAME_REQUIRED_FOR_FEATURE_EVIDENCE_GAP")
        if self.status == "RESOLVED" and self.resolutionRevision is None:
            raise ValueError("RESOLUTION_REVISION_REQUIRED_WHEN_RESOLVED")
        return self
