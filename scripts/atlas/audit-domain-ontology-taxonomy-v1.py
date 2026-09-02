#!/usr/bin/env python3
"""Read-only audit of classifier labels against the admitted domain mapping."""

from __future__ import annotations

import json
import re
from pathlib import Path

from parent_atlas_ontology.domain_mapping import admit_domain_classification, mapping_revision


ROOT = Path(__file__).resolve().parents[2]
CLASSIFIER = ROOT / "scripts" / "atlas" / "classify-domain-ontology.mjs"
REPORT = ROOT / "docs" / "reports" / "domain-ontology-taxonomy-audit-v1.json"


def main() -> None:
    source = CLASSIFIER.read_text(encoding="utf-8")
    block = re.search(r"const DOMAIN_KEYWORDS = \{(.*?)\n\};", source, re.S)
    if not block:
        raise RuntimeError("CLASSIFIER_TAXONOMY_NOT_FOUND")
    labels = sorted(set(re.findall(r"^\s{2}([a-z0-9_]+):", block.group(1), re.M)))
    results = [admit_domain_classification(label, confidence=1.0) for label in labels]
    admitted = [
        {"domainLabel": item.domainLabel, "classId": item.classId, "status": item.status}
        for item in results
        if item.status == "ADMITTED"
    ]
    unresolved = [
        {"domainLabel": item.domainLabel, "status": item.status}
        for item in results
        if item.status != "ADMITTED"
    ]
    report = {
        "schema": "atlas.domain-ontology-taxonomy-audit-receipt.v1",
        "status": "DOMAIN_ONTOLOGY_TAXONOMY_PARTIAL" if unresolved else "DOMAIN_ONTOLOGY_TAXONOMY_PROVEN",
        "classifierPath": str(CLASSIFIER.relative_to(ROOT)).replace("\\", "/"),
        "classifierLabelCount": len(labels),
        "admittedLabelCount": len(admitted),
        "unresolvedLabelCount": len(unresolved),
        "mappingRevision": mapping_revision(),
        "admitted": admitted,
        "unresolved": unresolved,
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
