from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

NonEmpty = Annotated[str, StringConstraints(min_length=1)]
Checksum = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
UTC_DATETIME_PATTERN = (
    r"^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|"
    r"\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|"
    r"(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$"
)
UtcDateTime = Annotated[str, StringConstraints(pattern=UTC_DATETIME_PATTERN)]
ActionOutcome = Literal[
    "SUCCESS_EXACT",
    "SUCCESS_PARTIAL",
    "NO_RESULT",
    "STALE_RESULT",
    "INVALID_IDENTITY",
    "PARSE_ERROR",
    "TOOL_ERROR",
    "TIMEOUT",
    "TEST_FAILED",
    "TYPECHECK_FAILED",
    "MUTATION_REJECTED",
    "SUPERSEDED",
    "POLICY_REJECTED",
    "CACHE_HIT",
]


class LearningOutcomeV1(BaseModel):
    """Boundary mirror of the canonical RecommendationOutcomeReceiptV1 Zod owner.

    This is not a new outcome authority or schema id. Zod remains canonical at
    packages/parent-atlas/src/core/temporal-action-ledger.ts.
    """

    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        populate_by_name=False,
        # Zod's defaulted input schema still lists all keys as required even
        # though its runtime parser accepts omissions and inserts defaults.
        json_schema_extra={
            "required": [
                "schema",
                "recommendation_id",
                "selected_action_id",
                "followed_recommendation",
                "resulting_execution_key",
                "outcome",
                "downstream_success",
                "evidence_refs",
                "observed_at",
                "producer_revision",
            ]
        },
    )

    schema_: Literal["atlas.recommendation-outcome-receipt.v1"] = Field(
        default="atlas.recommendation-outcome-receipt.v1", alias="schema"
    )
    recommendation_id: NonEmpty
    selected_action_id: NonEmpty | None = None
    followed_recommendation: bool
    resulting_execution_key: Checksum | None = None
    outcome: ActionOutcome | None = None
    downstream_success: bool | None = None
    evidence_refs: list[NonEmpty] = Field(default_factory=list)
    observed_at: UtcDateTime
    producer_revision: NonEmpty

    @field_validator("observed_at")
    @classmethod
    def _zod_compatible_utc_datetime(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", value):
            raise ValueError("observed_at must be UTC ISO datetime ending in Z")
        try:
            datetime.fromisoformat(value[:-1] + "+00:00")
        except ValueError as exc:
            raise ValueError("observed_at is not a valid datetime") from exc
        return value
