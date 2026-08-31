"""Real Python-side validation of OntologyLinkedTupleV1 — closes the gap
the operator's review found: `from_dict()` in models.py is structural
only (trusts every field), so a raw dict that never passed through the
TS/Zod side (arriving directly at a Python entrypoint, say) would sail
through with a bad enum value or an out-of-range confidence and nothing
would catch it. This is the closest Python equivalent of Zod's
`.strict().parse()` — collects every issue found (mirroring Zod's
multi-issue reporting, not fail-on-first) rather than raising on the
first problem, so a caller sees the whole picture in one pass.
"""

from __future__ import annotations

from parent_atlas_ontology.enums import (
    EVIDENCE_STATE_VALUES,
    LABEL_KIND_VALUES,
    LABEL_SOURCE_VALUES,
    LIFECYCLE_VALUES,
    MAX_CONCEPT_IDS,
    MAX_EVIDENCE_REFS,
    MAX_ONTOLOGY_IDS,
    MAX_PARTICIPANTS,
    MAX_SOURCE_TABLES,
    PARTICIPANT_KIND_VALUES,
    PARTICIPANT_ROLE_VALUES,
)
from parent_atlas_ontology.models import OntologyLinkedTupleV1


class OntologyLinkedTupleValidationError(ValueError):
    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__(f"{len(issues)} validation issue(s): " + "; ".join(issues))


def validate_ontology_linked_tuple(value: OntologyLinkedTupleV1) -> OntologyLinkedTupleV1:
    """Raises OntologyLinkedTupleValidationError with every issue found if
    invalid; returns the same value unchanged if valid (mirrors Zod's
    `.parse()` return-on-success / throw-with-all-issues-on-failure
    contract)."""
    issues: list[str] = []

    if not value.tupleId:
        issues.append("tupleId must be non-empty")
    if value.schemaVersion != "ontology-linked-tuple.v1":
        issues.append(f"schemaVersion must be 'ontology-linked-tuple.v1', got {value.schemaVersion!r}")
    if not value.sourceRef:
        issues.append("sourceRef must be non-empty")
    if not value.surfaceText:
        issues.append("surfaceText must be non-empty")
    if not value.label:
        issues.append("label must be non-empty")
    if value.labelKind not in LABEL_KIND_VALUES:
        issues.append(f"labelKind {value.labelKind!r} not in {sorted(LABEL_KIND_VALUES)}")
    if value.labelSource not in LABEL_SOURCE_VALUES:
        issues.append(f"labelSource {value.labelSource!r} not in {sorted(LABEL_SOURCE_VALUES)}")
    if value.evidenceState not in EVIDENCE_STATE_VALUES:
        issues.append(f"evidenceState {value.evidenceState!r} not in {sorted(EVIDENCE_STATE_VALUES)}")
    if value.lifecycle not in LIFECYCLE_VALUES:
        issues.append(f"lifecycle {value.lifecycle!r} not in {sorted(LIFECYCLE_VALUES)}")
    if not (0.0 <= value.confidence <= 1.0):
        issues.append(f"confidence must be in [0, 1], got {value.confidence}")
    if value.tokenIndex is not None and value.tokenIndex < 0:
        issues.append(f"tokenIndex must be >= 0, got {value.tokenIndex}")

    if len(value.ontologyIds) > MAX_ONTOLOGY_IDS:
        issues.append(f"ontologyIds has {len(value.ontologyIds)} entries, max {MAX_ONTOLOGY_IDS}")
    if len(value.conceptIds) > MAX_CONCEPT_IDS:
        issues.append(f"conceptIds has {len(value.conceptIds)} entries, max {MAX_CONCEPT_IDS}")
    if len(value.participants) > MAX_PARTICIPANTS:
        issues.append(f"participants has {len(value.participants)} entries, max {MAX_PARTICIPANTS}")
    if len(value.evidenceRefs) > MAX_EVIDENCE_REFS:
        issues.append(f"evidenceRefs has {len(value.evidenceRefs)} entries, max {MAX_EVIDENCE_REFS}")
    if len(value.provenance.sourceTables) > MAX_SOURCE_TABLES:
        issues.append(f"provenance.sourceTables has {len(value.provenance.sourceTables)} entries, max {MAX_SOURCE_TABLES}")

    for i, participant in enumerate(value.participants):
        if not participant.entityId:
            issues.append(f"participants[{i}].entityId must be non-empty")
        if participant.entityKind not in PARTICIPANT_KIND_VALUES:
            issues.append(f"participants[{i}].entityKind {participant.entityKind!r} not in {sorted(PARTICIPANT_KIND_VALUES)}")
        if participant.role not in PARTICIPANT_ROLE_VALUES:
            issues.append(f"participants[{i}].role {participant.role!r} not in {sorted(PARTICIPANT_ROLE_VALUES)}")

    if value.evidenceSpan is not None:
        if value.evidenceSpan.start < 0:
            issues.append(f"evidenceSpan.start must be >= 0, got {value.evidenceSpan.start}")
        if value.evidenceSpan.end < value.evidenceSpan.start:
            issues.append(f"evidenceSpan.end ({value.evidenceSpan.end}) must be >= start ({value.evidenceSpan.start})")

    if issues:
        raise OntologyLinkedTupleValidationError(issues)
    return value
