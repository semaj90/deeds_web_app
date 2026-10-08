from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


SHA256_REF_PATTERN = r"^sha256:[0-9a-f]{64}$"


class FindFailureContextArgsV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    schema_: Literal["atlas.oak.find-failure-context.args.v1"] = Field(
        default="atlas.oak.find-failure-context.args.v1",
        alias="schema",
    )
    requestId: str = Field(min_length=1, max_length=160)
    taskProfileChecksum: str = Field(pattern=SHA256_REF_PATTERN)
    admittedFactIds: tuple[str, ...] = Field(min_length=1, max_length=256)
    admittedFactChecksums: tuple[str, ...] = Field(min_length=1, max_length=256)
    workspaceRevision: str = Field(min_length=1, max_length=200)
    ontologyRevision: str = Field(min_length=1, max_length=160)
    policyRevision: str = Field(min_length=1, max_length=160)
    maxNeighbors: int = Field(ge=1, le=256)
    maxHops: int = Field(ge=0, le=4)
    canonicalAuthority: Literal[False] = False

    @model_validator(mode="after")
    def validate_admitted_fact_bindings(self) -> "FindFailureContextArgsV1":
        if len(self.admittedFactIds) != len(self.admittedFactChecksums):
            raise ValueError("OAK_FACT_ID_CHECKSUM_COUNT_MISMATCH")
        if len(set(self.admittedFactIds)) != len(self.admittedFactIds):
            raise ValueError("OAK_DUPLICATE_ADMITTED_FACT_ID")
        if any(not re.fullmatch(SHA256_REF_PATTERN, checksum) for checksum in self.admittedFactChecksums):
            raise ValueError("OAK_FACT_CHECKSUM_INVALID")
        return self


class FailureContextEvidenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    factId: str = Field(min_length=1, max_length=200)
    factChecksum: str = Field(pattern=SHA256_REF_PATTERN)
    evidenceRef: str = Field(min_length=1, max_length=1000)
    relation: str = Field(min_length=1, max_length=160)
    distance: int = Field(ge=0, le=4)


class FailureContextResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    schema_: Literal["atlas.oak.failure-context.result.v1"] = Field(
        default="atlas.oak.failure-context.result.v1",
        alias="schema",
    )
    requestId: str = Field(min_length=1, max_length=160)
    status: Literal["AVAILABLE", "UNAVAILABLE", "REJECTED"]
    evidence: tuple[FailureContextEvidenceV1, ...] = Field(max_length=256)
    ontologyRevision: str = Field(min_length=1, max_length=160)
    policyRevision: str = Field(min_length=1, max_length=160)
    producerRevision: str = Field(min_length=1, max_length=160)
    resultChecksum: str = Field(pattern=SHA256_REF_PATTERN)
    canonicalAuthority: Literal[False] = False
    writesPerformed: Literal[False] = False


def _canonical_json(payload: dict[str, object]) -> bytes:
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def build_failure_context_result_v1(
    *,
    request_id: str,
    status: Literal["AVAILABLE", "UNAVAILABLE", "REJECTED"],
    evidence: tuple[FailureContextEvidenceV1, ...],
    ontology_revision: str,
    policy_revision: str,
    producer_revision: str,
) -> FailureContextResultV1:
    ordered_evidence = tuple(
        sorted(
            evidence,
            key=lambda item: (
                item.distance,
                item.relation,
                item.factId,
                item.evidenceRef,
                item.factChecksum,
            ),
        )
    )
    payload: dict[str, object] = {
        "schema": "atlas.oak.failure-context.result.v1",
        "requestId": request_id,
        "status": status,
        "evidence": tuple(item.model_dump(mode="json") for item in ordered_evidence),
        "ontologyRevision": ontology_revision,
        "policyRevision": policy_revision,
        "producerRevision": producer_revision,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    checksum = "sha256:" + hashlib.sha256(_canonical_json(payload)).hexdigest()
    return FailureContextResultV1(**payload, resultChecksum=checksum)
