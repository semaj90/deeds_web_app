"""Strict Pydantic contracts for the isolated Parent Atlas OaK agent boundary.

This module is intentionally NOT imported by the default :8095 NLP sidecar.
The lightweight GroundedNlpFactV1 dataclass remains the default-runtime
transport mirror. These models validate agent/tool requests and structured
responses in the isolated OaK/DSPy/GEPA/Deep-Agent environment only.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictFrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class FindFailureContextArgsV1(StrictFrozenModel):
    schema: Literal["atlas.oak.find-failure-context.args.v1"] = (
        "atlas.oak.find-failure-context.args.v1"
    )
    request_id: str = Field(min_length=1)
    task_profile_checksum: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    admitted_fact_ids: tuple[str, ...] = Field(min_length=1, max_length=512)
    admitted_fact_checksums: tuple[str, ...] = Field(min_length=1, max_length=512)
    workspace_revision: str = Field(min_length=1)
    ontology_revision: str = Field(min_length=1)
    policy_revision: str = Field(min_length=1)
    max_neighbors: int = Field(default=32, ge=1, le=256)
    max_hops: int = Field(default=2, ge=0, le=4)
    canonical_authority: Literal[False] = False

    @field_validator("admitted_fact_ids")
    @classmethod
    def _fact_ids_unique(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(value)) != len(value):
            raise ValueError("DUPLICATE_ADMITTED_FACT_ID")
        return value

    @field_validator("admitted_fact_checksums")
    @classmethod
    def _fact_checksums_are_sha256(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        for checksum in value:
            if not checksum.startswith("sha256:") or len(checksum) != 71:
                raise ValueError("INVALID_ADMITTED_FACT_CHECKSUM")
        return value


class FailureContextEvidenceV1(StrictFrozenModel):
    fact_id: str = Field(min_length=1)
    fact_checksum: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    evidence_ref: str = Field(min_length=1)
    relation: str = Field(min_length=1)
    distance: int = Field(ge=0, le=4)


class FailureContextResultV1(StrictFrozenModel):
    schema: Literal["atlas.oak.failure-context-result.v1"] = (
        "atlas.oak.failure-context-result.v1"
    )
    request_id: str = Field(min_length=1)
    status: Literal["AVAILABLE", "UNAVAILABLE", "REJECTED"]
    evidence: tuple[FailureContextEvidenceV1, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    admitted_fact_checksums: tuple[str, ...] = ()
    ontology_revision: str = Field(min_length=1)
    policy_revision: str = Field(min_length=1)
    producer_revision: str = Field(min_length=1)
    result_checksum: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


def canonical_json_v1(value: BaseModel) -> str:
    return json.dumps(
        value.model_dump(mode="json", by_alias=True, exclude_none=False),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def canonical_checksum_v1(value: BaseModel) -> str:
    return "sha256:" + sha256(canonical_json_v1(value).encode("utf-8")).hexdigest()


def build_failure_context_result_v1(
    *,
    request_id: str,
    status: Literal["AVAILABLE", "UNAVAILABLE", "REJECTED"],
    evidence: tuple[FailureContextEvidenceV1, ...],
    ontology_revision: str,
    policy_revision: str,
    producer_revision: str,
) -> FailureContextResultV1:
    evidence_sorted = tuple(
        sorted(
            evidence,
            key=lambda row: (
                row.distance,
                row.fact_id,
                row.relation,
                row.evidence_ref,
            ),
        )
    )
    evidence_refs = tuple(sorted({row.evidence_ref for row in evidence_sorted}))
    fact_checksums = tuple(sorted({row.fact_checksum for row in evidence_sorted}))

    draft = {
        "schema": "atlas.oak.failure-context-result.v1",
        "request_id": request_id,
        "status": status,
        "evidence": [row.model_dump(mode="json") for row in evidence_sorted],
        "evidence_refs": list(evidence_refs),
        "admitted_fact_checksums": list(fact_checksums),
        "ontology_revision": ontology_revision,
        "policy_revision": policy_revision,
        "producer_revision": producer_revision,
        "canonical_authority": False,
        "writes_performed": False,
    }
    checksum = "sha256:" + sha256(
        json.dumps(
            draft,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()

    return FailureContextResultV1(
        **draft,
        result_checksum=checksum,
    )
