#!/usr/bin/env python3
"""Preview raw concept-label admission through the existing mapping owner.

Read-only: does not create ontology rows or write Neo4j/Valkey projections.
"""

from __future__ import annotations

import json
from pathlib import Path

from parent_atlas_ontology.domain_mapping import (
    _DEFAULT_MAPPINGS,
    admit_domain_classification,
    mapping_revision,
)


ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "docs" / "reports" / "raw-concept-label-inventory-v1.json"
OUTPUT = ROOT / "docs" / "reports" / "raw-concept-admission-v1.json"


def main() -> int:
    source = json.loads(INPUT.read_text(encoding="utf-8"))
    decisions = []
    for row in source.get("labels", []):
        label = str(row.get("normalizedLabel") or "").strip()
        admission = admit_domain_classification(label, confidence=1.0, mappings=_DEFAULT_MAPPINGS)
        decisions.append(
            {
                "normalizedLabel": label,
                "rawLabels": row.get("rawLabels", []),
                "occurrences": int(row.get("occurrences", 0)),
                "status": admission.status,
                "classId": admission.classId,
                "mappingRevision": admission.mappingRevision,
                "sourceRevision": None,
                "evidenceRefs": [],
                "canonicalAuthority": False,
            }
        )

    admitted = [row for row in decisions if row["status"] == "ADMITTED"]
    ambiguous = [row for row in decisions if row["status"] == "AMBIGUOUS"]
    report = {
        "schema": "atlas.raw-concept-admission.v1",
        "mode": "READ_ONLY",
        "mappingRevision": mapping_revision(_DEFAULT_MAPPINGS),
        "rawLabelCount": len(decisions),
        "admittedCount": len(admitted),
        "ambiguousCount": len(ambiguous),
        "unmappedCount": len(decisions) - len(admitted) - len(ambiguous),
        "decisions": decisions,
        "neo4jWrites": False,
        "valkeyWrites": False,
        "postgresWrites": False,
        "canonicalAuthority": False,
        "status": "RAW_CONCEPT_ADMISSION_PREVIEW_COMPLETE",
        "nextGate": "DECLARE_OR_RESTORE_CANONICAL_CONCEPT_CLASSES",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "rawLabelCount": report["rawLabelCount"],
        "admittedCount": report["admittedCount"],
        "ambiguousCount": report["ambiguousCount"],
        "unmappedCount": report["unmappedCount"],
        "reportPath": "docs/reports/raw-concept-admission-v1.json",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
