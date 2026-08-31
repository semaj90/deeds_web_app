"""Proves validate_ontology_linked_tuple() actually rejects bad data,
not just accepts good data (accepting the good fixture alone would not
distinguish real validation from a no-op that always returns the input).

Usage: python python/parent_atlas_ontology/onto_py_validation_check.py
Writes: docs/reports/ontology-linked-tuple-python-validation-check-v1.json
"""

from __future__ import annotations

import dataclasses
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parent_atlas_ontology.adapter import OntologyLinkedTupleAdapter  # noqa: E402
from parent_atlas_ontology.models import OntologyLinkedTupleV1, OntologyParticipantV1  # noqa: E402
from parent_atlas_ontology.validation import OntologyLinkedTupleValidationError  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ontology-linked-tuple-python-validation-check-v1.json"


def main() -> int:
    started = time.time()
    adapter = OntologyLinkedTupleAdapter()
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    valid = OntologyLinkedTupleV1.from_dict(raw)

    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    # Positive case: the real fixture must pass.
    try:
        result = adapter.validate(valid)
        check("valid_fixture_passes", result is valid, "returned the same object, no coercion")
    except OntologyLinkedTupleValidationError as exc:
        check("valid_fixture_passes", False, f"unexpectedly rejected: {exc}")

    # Negative case 1: bad top-level enum (evidenceState).
    bad_evidence_state = dataclasses.replace(valid, evidenceState="NOT_A_REAL_STATE")
    try:
        adapter.validate(bad_evidence_state)
        check("rejects_bad_evidence_state", False, "did not raise")
    except OntologyLinkedTupleValidationError as exc:
        check("rejects_bad_evidence_state", "evidenceState" in str(exc), str(exc)[:200])

    # Negative case 2: confidence out of range.
    bad_confidence = dataclasses.replace(valid, confidence=1.5)
    try:
        adapter.validate(bad_confidence)
        check("rejects_out_of_range_confidence", False, "did not raise")
    except OntologyLinkedTupleValidationError as exc:
        check("rejects_out_of_range_confidence", "confidence" in str(exc), str(exc)[:200])

    # Negative case 3: bad participant role (nested enum, not top-level).
    bad_participant = dataclasses.replace(
        valid,
        participants=(OntologyParticipantV1(entityId="x", entityKind="ast_symbol", role="NOT_A_REAL_ROLE"),),
    )
    try:
        adapter.validate(bad_participant)
        check("rejects_bad_participant_role", False, "did not raise")
    except OntologyLinkedTupleValidationError as exc:
        check("rejects_bad_participant_role", "participants[0].role" in str(exc), str(exc)[:200])

    # Negative case 4: multiple simultaneous issues are ALL reported, not just the first.
    multi_bad = dataclasses.replace(valid, evidenceState="BOGUS", labelKind="BOGUS", confidence=99.0)
    try:
        adapter.validate(multi_bad)
        check("reports_all_issues_not_just_first", False, "did not raise")
    except OntologyLinkedTupleValidationError as exc:
        check(
            "reports_all_issues_not_just_first",
            len(exc.issues) == 3,
            f"expected 3 issues, got {len(exc.issues)}: {exc.issues}",
        )

    all_ok = all(c["ok"] for c in checks)
    duration_ms = round((time.time() - started) * 1000, 2)

    report = {
        "gate": "ONTO-PY-VALIDATE-01",
        "description": "Proves OntologyLinkedTupleAdapter.validate() performs real enum/range enforcement, not a structural pass-through",
        "checks": checks,
        "pass": all_ok,
        "durationMs": duration_ms,
        "writesPerformed": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"ONTO-PY-VALIDATE-01: {'PASS' if all_ok else 'FAIL'}")
    for c in checks:
        print(f"  [{'x' if c['ok'] else ' '}] {c['name']}: {c['detail']}")
    print(f"Report written: {REPORT_PATH}")

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
