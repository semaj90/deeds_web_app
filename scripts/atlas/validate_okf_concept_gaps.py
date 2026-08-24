#!/usr/bin/env python3
"""Minimal validator for .okf/concepts/*.yaml against schema
atlas.okf-concept-gap.v1 (defined 2026-08-24, fd096f5e36). Read-only,
checks required fields only -- not a full OKF v0.2 validator (that spec
still doesn't exist, see openspec/changes/parent-atlas-okf-knowledge-layers
/tasks.md's OKF v0.2 finding).
"""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

REQUIRED_FIELDS = ["schema", "gap_id", "title", "status", "owner", "summary", "evidence", "discovered_at"]
EXPECTED_SCHEMA = "atlas.okf-concept-gap.v1"


def validate(path: Path) -> list[str]:
    errors: list[str] = []
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        return [f"{path.name}: not a YAML mapping"]
    for field in REQUIRED_FIELDS:
        if field not in doc:
            errors.append(f"{path.name}: missing required field '{field}'")
    if doc.get("schema") != EXPECTED_SCHEMA:
        errors.append(f"{path.name}: schema is '{doc.get('schema')}', expected '{EXPECTED_SCHEMA}'")
    if doc.get("status") != "NOT_PROVEN":
        errors.append(f"{path.name}: status is '{doc.get('status')}', expected 'NOT_PROVEN' for a new gap file")
    evidence = doc.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        errors.append(f"{path.name}: evidence must be a non-empty list")
    else:
        for i, item in enumerate(evidence):
            if not isinstance(item, dict) or "ref" not in item:
                errors.append(f"{path.name}: evidence[{i}] missing 'ref'")
    return errors


def main() -> int:
    root = Path(__file__).resolve().parents[2] / ".okf" / "concepts"
    files = sorted(root.glob("*.yaml"))
    total_errors = 0
    for path in files:
        errors = validate(path)
        status = "PASS" if not errors else "FAIL"
        print(f"{status}: {path.name}")
        for error in errors:
            print(f"  {error}")
        total_errors += len(errors)
    print(f"\n{len(files)} files checked, {total_errors} errors")
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main())
