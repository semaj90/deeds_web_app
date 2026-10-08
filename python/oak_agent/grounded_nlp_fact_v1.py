from __future__ import annotations

import json
import sys
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GroundedNlpEvidenceSpanV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    byteStart: int = Field(ge=0)
    byteEnd: int = Field(gt=0)
    textSha256: str = Field(pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_ordered_span(self) -> GroundedNlpEvidenceSpanV1:
        if self.byteEnd <= self.byteStart:
            raise ValueError("GROUNDED_NLP_EVIDENCE_SPAN_RANGE_INVALID")
        return self


class GroundedNlpFactV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True, populate_by_name=True)

    schema_: Literal["atlas.grounded-nlp-fact.v1"] = Field(alias="schema")
    factId: str = Field(min_length=1)
    taskRef: str = Field(min_length=1)
    canonicalTaskRef: str = Field(min_length=1)
    taskRevision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    evidenceCardChecksum: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    sourceRef: str = Field(min_length=1)
    sourceRevision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    workspaceRevision: str = Field(min_length=1)
    extractorRevision: str = Field(min_length=1)
    extractorKind: Literal["tree-sitter", "ast-grep", "langextract", "regex", "spacy", "torch"]
    featureKind: str = Field(min_length=1)
    featureName: str = Field(min_length=1)
    proposedLabel: str = Field(min_length=1)
    surfaceText: str = Field(min_length=1)
    confidence: float | int | None = Field(ge=0.0, le=1.0)
    evidenceSpan: GroundedNlpEvidenceSpanV1
    evidenceKey: str = Field(min_length=1)
    canonicalAuthority: Literal[False]
    ontologyPromotionAllowed: Literal[False]


def main() -> None:
    if sys.argv[1:] == ["--schema"]:
        json.dump(GroundedNlpFactV1.model_json_schema(by_alias=True, mode="validation"), sys.stdout, ensure_ascii=False, sort_keys=True)
        sys.stdout.write("\n")
        return
    fact = GroundedNlpFactV1.model_validate_json(sys.stdin.read())
    json.dump(fact.model_dump(mode="json", by_alias=True), sys.stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
