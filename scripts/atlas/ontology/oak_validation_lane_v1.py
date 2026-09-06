#!/usr/bin/env python3
"""OAK concept-resolution lane.

OAK resolves and labels ontology concept references (CURIEs) against a live
ontology adapter. It does not assign Parent Atlas canonical identity and does
not write ontology tuples.

FIXED 2026-09-06 (review before bringing this pack into the repo, per
openspec/changes/parent-atlas-memory-architecture-freeze addendum 9): the
original docstring/schema claimed this validates "ontology references and
relationships." The actual implementation only ever calls `adapter.label(curie)`
per item - that proves a concept CURIE resolves to a label in the ontology,
not that any subject/predicate/object relationship is semantically valid.
Renamed the receipt schema and status field accordingly
(`oak-concept-resolution-receipt.v1`, gate name `OAK_CONCEPT_RESOLUTION_PROVEN`)
so a reader cannot mistake concept-resolution proof for relationship
validation. Relationship validation, if built later, needs its own gate name
and its own implementation - it is not a documentation fix away from this one.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from oaklib import get_adapter


def resolve_concepts(payload: dict[str, Any]) -> dict[str, Any]:
    adapter = get_adapter(payload["ontologyDescriptor"])
    out = []
    for item in payload["items"]:
        curie = str(item["curie"])
        label = adapter.label(curie)
        out.append({
            "curie": curie,
            "exists": label is not None,
            "label": label,
            "evidenceRef": item["evidenceRef"],
            "sourceRevision": item["sourceRevision"],
        })

    return {
        "schema": "parent-atlas.oak-concept-resolution-receipt.v1",
        "gate": "OAK_CONCEPT_RESOLUTION_PROVEN",
        "ontologyDescriptor": payload["ontologyDescriptor"],
        "ontologyRevision": payload["ontologyRevision"],
        "items": out,
        "allResolved": all(x["exists"] for x in out),
        "authority": "CONCEPT_RESOLUTION_ONLY",
        "relationshipValidationImplemented": False,
        "writes": False,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_json")
    ap.add_argument("output_json")
    args = ap.parse_args()
    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    receipt = resolve_concepts(payload)
    Path(args.output_json).write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"status": "OK", "allResolved": receipt["allResolved"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
