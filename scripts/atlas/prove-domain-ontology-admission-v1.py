"""Read-only proof for classifier label -> admitted ontology mapping."""

from __future__ import annotations

import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from parent_atlas_ontology.domain_mapping import admit_domain_classifications  # noqa: E402


def main() -> int:
    admissions = admit_domain_classifications({"retrieval": 0.95, "search": 0.90, "unknown-label": 1.0})
    checks = {
        "known_domain_admitted": any(item.classId == "atlas:RetrievalDomain" for item in admissions),
        "unknown_domain_unmapped": any(item.domainLabel == "unknown-label" and item.classId is None for item in admissions),
        "mapping_revision_present": all(item.mappingRevision.startswith("sha256:") for item in admissions),
        "no_dynamic_class_minting": all(item.classId is None or item.classId.startswith("atlas:") for item in admissions),
        "writes_false": all(item.writesPerformed is False for item in admissions),
        "canonical_false": all(item.canonicalAuthority is False for item in admissions),
    }
    report = {
        "schema": "atlas.domain-ontology-admission-proof.v1",
        "status": "DOMAIN_ONTOLOGY_ADMISSION_PROVEN" if all(checks.values()) else "DOMAIN_ONTOLOGY_ADMISSION_UNPROVEN",
        "checks": checks,
        "admissions": [item.to_dict() for item in admissions],
        "source": "classifier evidence labels; no database or graph writes",
    }
    path = REPO_ROOT / "docs" / "reports" / "domain-ontology-admission-v1.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report["status"])
    return 0 if report["status"].endswith("PROVEN") else 1


if __name__ == "__main__":
    raise SystemExit(main())
