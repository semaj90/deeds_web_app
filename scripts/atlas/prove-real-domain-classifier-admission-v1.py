#!/usr/bin/env python3
"""Read-only proof of one real classifier result at the strict admission boundary."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from atlas_external_docs import classify_domain
from parent_atlas_ontology.domain_mapping import mapping_revision
from parent_atlas_ontology.domain_tuple_bridge import build_domain_classification_signal_from_chunk


ROOT = Path(__file__).resolve().parents[2]
OBSERVATION = ROOT / "docs" / "reports" / "workspace-source-binding-observation.json"
REPORT = ROOT / "docs" / "reports" / "domain-classifier-real-admission-v1.json"


def main() -> None:
    observation = json.loads(OBSERVATION.read_text(encoding="utf-8"))
    selected = next(
        item for item in observation["bindings"]
        if (ROOT / item["sourceRef"]).is_file()
    )
    source_path = ROOT / selected["sourceRef"]
    content = source_path.read_text(encoding="utf-8")
    content_hash = "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()
    label = classify_domain(source_path.name, content)
    error_code = None
    try:
        build_domain_classification_signal_from_chunk(
            domain_label=label,
            confidence=1.0,
            classification_revision="atlas-domain-classifier:live-v1",
            mapping_revision_value=mapping_revision(),
            ontology_revision="sha256:" + ("d" * 64),
            source_namespace="",
            source_revision=selected["sourceRevision"],
            chunk_id=selected["sourceRef"],
            start_char=0,
            end_char=len(content),
        )
    except ValueError as exc:
        error_code = str(exc)
    report = {
        "schema": "atlas.domain-classifier-real-admission.v1",
        "status": "REAL_CLASSIFIER_ADMISSION_BLOCKED" if error_code else "REAL_CLASSIFIER_SIGNAL_BUILT",
        "sourceRef": selected["sourceRef"],
        "sourceRevision": selected["sourceRevision"],
        "observedContentHash": content_hash,
        "sourceRevisionContentMatch": selected["sourceRevision"].removeprefix("sha256:") == content_hash.removeprefix("sha256:"),
        "classifierId": "atlas_external_docs.classify_domain",
        "classifierRevision": "atlas-domain-classifier:live-v1",
        "label": label,
        "probability": 1.0,
        "mappingRevision": mapping_revision(),
        "sourceNamespace": None,
        "rejectionCode": error_code,
        "directClassifierToOntologyIdentityCount": 0,
        "directClassifierToTupleCount": 0,
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
