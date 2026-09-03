#!/usr/bin/env python3
"""Compare the declared external-document domain vocabulary with admissions.

The Python mapping module remains the only mapping owner. This audit parses the
existing TypeScript vocabulary and performs no database, Neo4j, or Valkey write.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from parent_atlas_ontology.domain_mapping import _DEFAULT_MAPPINGS, admit_domain_classification, mapping_revision


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages" / "parent-atlas" / "src" / "core" / "external-doc-knowledge-fabric.ts"
REPORT = ROOT / "docs" / "reports" / "external-doc-vocabulary-admission-v1.json"


def declared_domain_labels() -> list[str]:
    text = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"export const DOC_DOMAIN_CLASSES = \[(.*?)\] as const;", text, re.S)
    if not match:
        raise RuntimeError("DOC_DOMAIN_CLASSES_NOT_FOUND")
    return re.findall(r"'([^']+)'", match.group(1))


def main() -> int:
    rows = []
    for label in declared_domain_labels():
        decision = admit_domain_classification(label, confidence=1.0, mappings=_DEFAULT_MAPPINGS)
        rows.append({
            "sourceVocabulary": "EXTERNAL_DOC_DOMAIN",
            "sourceLabel": label,
            "status": decision.status,
            "targetClassId": decision.classId,
            "mappingRevision": decision.mappingRevision,
            "ontologyRevision": None,
            "evidenceRefs": [],
            "canonicalAuthority": False,
        })

    admitted = [row for row in rows if row["status"] == "ADMITTED"]
    report = {
        "schema": "atlas.external-doc-vocabulary-admission.v1",
        "mode": "READ_ONLY",
        "sourceVocabulary": "EXTERNAL_DOC_DOMAIN",
        "mappingRevision": mapping_revision(_DEFAULT_MAPPINGS),
        "declaredLabelCount": len(rows),
        "admittedCount": len(admitted),
        "unmappedCount": sum(row["status"] == "UNMAPPED" for row in rows),
        "ambiguousCount": sum(row["status"] == "AMBIGUOUS" for row in rows),
        "rows": rows,
        "postgresWrites": False,
        "neo4jWrites": False,
        "valkeyWrites": False,
        "canonicalAuthority": False,
        "status": "EXTERNAL_DOC_VOCABULARY_ADMISSION_AUDITED",
        "nextGate": "ADD_EXPLICIT_ONTOLOGY_REVISION_AND_EVIDENCE_TO_ADMITTED_MAPPINGS",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "declaredLabelCount": report["declaredLabelCount"],
        "admittedCount": report["admittedCount"],
        "unmappedCount": report["unmappedCount"],
        "ambiguousCount": report["ambiguousCount"],
        "reportPath": "docs/reports/external-doc-vocabulary-admission-v1.json",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
