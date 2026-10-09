from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import asdict, dataclass
from typing import Any


_FACT_FIELDS = frozenset({
    "schema", "factId", "taskRef", "canonicalTaskRef", "taskRevision",
    "evidenceCardChecksum", "sourceRef", "sourceRevision", "workspaceRevision",
    "extractorRevision", "extractorKind", "featureKind", "featureName",
    "proposedLabel", "surfaceText", "confidence", "evidenceSpan",
    "evidenceKey", "canonicalAuthority", "ontologyPromotionAllowed",
})
_SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")
_TEXT_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_EXTRACTOR_KINDS = frozenset({"tree-sitter", "ast-grep", "langextract", "regex", "spacy", "torch"})


@dataclass(frozen=True, slots=True)
class GroundedNlpEvidenceSpanV1:
    byteStart: int
    byteEnd: int
    textSha256: str

    @classmethod
    def from_mapping(cls, value: Any) -> GroundedNlpEvidenceSpanV1:
        if not isinstance(value, dict) or set(value) != {"byteStart", "byteEnd", "textSha256"}:
            raise ValueError("GROUNDED_NLP_EVIDENCE_SPAN_SHAPE_INVALID")
        start = value["byteStart"]
        end = value["byteEnd"]
        digest = value["textSha256"]
        if type(start) is not int or type(end) is not int or start < 0 or end <= start:
            raise ValueError("GROUNDED_NLP_EVIDENCE_SPAN_RANGE_INVALID")
        if not isinstance(digest, str) or not _TEXT_SHA256.fullmatch(digest):
            raise ValueError("GROUNDED_NLP_EVIDENCE_SPAN_DIGEST_INVALID")
        return cls(byteStart=start, byteEnd=end, textSha256=digest)


@dataclass(frozen=True, slots=True)
class GroundedNlpFactV1:
    schema: str
    factId: str
    taskRef: str
    canonicalTaskRef: str
    taskRevision: str
    evidenceCardChecksum: str
    sourceRef: str
    sourceRevision: str
    workspaceRevision: str
    extractorRevision: str
    extractorKind: str
    featureKind: str
    featureName: str
    proposedLabel: str
    surfaceText: str
    confidence: float | int | None
    evidenceSpan: GroundedNlpEvidenceSpanV1
    evidenceKey: str
    canonicalAuthority: bool
    ontologyPromotionAllowed: bool

    @classmethod
    def from_mapping(cls, value: Any) -> GroundedNlpFactV1:
        if not isinstance(value, dict):
            raise ValueError("GROUNDED_NLP_FACT_SHAPE_INVALID")
        if set(value) != _FACT_FIELDS:
            raise ValueError("GROUNDED_NLP_FACT_FIELDS_INVALID")
        for field in (
            "factId", "taskRef", "canonicalTaskRef", "sourceRef", "workspaceRevision",
            "extractorRevision", "featureKind", "featureName", "proposedLabel",
            "surfaceText", "evidenceKey",
        ):
            if not isinstance(value[field], str) or not value[field].strip():
                raise ValueError(f"GROUNDED_NLP_FACT_{field.upper()}_INVALID")
        for field in ("taskRevision", "evidenceCardChecksum", "sourceRevision"):
            if not isinstance(value[field], str) or not _SHA256.fullmatch(value[field]):
                raise ValueError(f"GROUNDED_NLP_FACT_{field.upper()}_INVALID")
        if value["schema"] != "atlas.grounded-nlp-fact.v1":
            raise ValueError("GROUNDED_NLP_FACT_SCHEMA_INVALID")
        if not isinstance(value["extractorKind"], str) or value["extractorKind"] not in _EXTRACTOR_KINDS:
            raise ValueError("GROUNDED_NLP_FACT_EXTRACTOR_KIND_INVALID")
        confidence = value["confidence"]
        if confidence is not None and (
            type(confidence) not in (int, float)
            or not math.isfinite(confidence)
            or confidence < 0
            or confidence > 1
        ):
            raise ValueError("GROUNDED_NLP_FACT_CONFIDENCE_INVALID")
        if value["canonicalAuthority"] is not False or value["ontologyPromotionAllowed"] is not False:
            raise ValueError("GROUNDED_NLP_FACT_AUTHORITY_ESCALATION")
        fields = dict(value)
        fields["evidenceSpan"] = GroundedNlpEvidenceSpanV1.from_mapping(value["evidenceSpan"])
        return cls(**fields)

    @classmethod
    def from_json(cls, value: str | bytes) -> GroundedNlpFactV1:
        parsed = json.loads(value, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("JSON_NONFINITE_NUMBER")))
        return cls.from_mapping(parsed)

    def to_mapping(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_mapping(), ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False)


def main() -> None:
    if sys.argv[1:]:
        raise SystemExit("GROUNDED_NLP_DATACLASS_UNEXPECTED_ARGUMENT")
    fact = GroundedNlpFactV1.from_json(sys.stdin.read())
    sys.stdout.write(fact.to_json() + "\n")


if __name__ == "__main__":
    main()
