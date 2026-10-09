#!/usr/bin/env python3
"""Read-only Pydantic oracle for the existing OKF DomainClassificationV1 Zod contract.

Only validates input JSON; neither creates classifications nor admits evidence.
Invocation: python python/atlas_okf_domain_parity_oracle_v1.py < fixtures.json
"""
from __future__ import annotations
import hashlib
import json
import sys
from typing import Literal

try:
    from pydantic import BaseModel, ConfigDict, Field, StrictStr, ValidationError, field_validator
except ImportError as exc:
    print(json.dumps({"status": "DEPENDENCY_UNAVAILABLE", "dependency": "pydantic", "message": str(exc)}))
    sys.exit(2)


class DomainClassificationV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    schemaVersion: Literal["atlas.okf.domain-classification.v1"]
    classificationId: StrictStr = Field(min_length=1)
    subjectRef: StrictStr = Field(min_length=1)
    subjectKind: Literal["document", "file", "feature", "symbol", "task"]
    domainId: StrictStr = Field(min_length=1)
    taxonomyRevision: StrictStr = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    evidenceRefs: list[StrictStr] = Field(min_length=1, max_length=64)
    sourceRevision: StrictStr = Field(min_length=1)
    producerId: StrictStr = Field(min_length=1)
    producerRevision: StrictStr = Field(min_length=1)
    lifecycle: Literal["OBSERVED", "DERIVED", "SUPERSEDED"]

    @field_validator("confidence", mode="before")
    @classmethod
    def reject_boolean_confidence(cls, v):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError("CONFIDENCE_NOT_NUMBER")
        return v

    @field_validator("evidenceRefs")
    @classmethod
    def reject_empty_refs(cls, values):
        if any(not item for item in values):
            raise ValueError("EMPTY_EVIDENCE_REF")
        return values


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def run() -> None:
    data = json.load(sys.stdin)
    if not isinstance(data, list) or len(data) > 128:
        raise ValueError("FIXTURE_BATCH_INVALID")
    rows = []
    for idx, item in enumerate(data):
        try:
            if not isinstance(item, dict):
                raise ValueError("OBJECT_REQUIRED")
            # Use the original JSON value for checksum to avoid float/int changes.
            DomainClassificationV1.model_validate(item)
            digest = hashlib.sha256(canonical(item).encode("utf-8")).hexdigest()
            rows.append({"index": idx, "valid": True, "checksum": "sha256:" + digest})
        except (ValidationError, ValueError, TypeError) as exc:
            rows.append({"index": idx, "valid": False, "errorType": type(exc).__name__})
    print(json.dumps({"schema": "atlas.okf.python-domain-parity.v1",
                      "rows": rows, "canonicalAuthority": False,
                      "admissionPerformed": False, "writesPerformed": False}))


if __name__ == "__main__":
    run()
