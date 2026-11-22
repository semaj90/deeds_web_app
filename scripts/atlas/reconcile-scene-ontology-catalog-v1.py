#!/usr/bin/env python3
"""
Scene Ontology & P0 Recipe Reconciler (v1)

Classifies all 506 concepts in
`sveltekit-frontend/src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json`
into the 5 explicit governance roles:
  - renderable (mapped to existing primitive, prefab, or actor recipe + version)
  - relationship
  - event_action
  - evidence_provenance
  - not_applicable (material, render, workflow, scene-context, safety)

Writes non-canonical read-only report:
  docs/reports/scene-ontology-catalog-reconciliation-v1.json
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPO_ROOT / "sveltekit-frontend/src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json"
OUT_PATH = REPO_ROOT / "docs/reports/scene-ontology-catalog-reconciliation-v1.json"

PREFAB_BY_KEYWORD = [
    (("studio", "apartment"), ("prefab", "house.studio.v1", "1.0.0")),
    (("four-bedroom", "house", "residential", "bedroom", "kitchen", "living", "dining", "bathroom", "hallway", "foyer", "closet"), ("prefab", "house.four_bedroom.v1", "1.0.0")),
    (("courtroom", "jury", "bench", "witness"), ("prefab", "courtroom.generic.v1", "1.0.0")),
    (("office", "desk", "cubicle", "conference"), ("prefab", "office.v1", "1.0.0")),
    (("parking", "lot", "road", "street", "sidewalk", "crosswalk"), ("prefab", "road.parking_lot.v1", "1.0.0")),
    (("beach", "coast", "shore", "ocean", "sand", "pier"), ("prefab", "beach.night.v1", "1.0.0")),
    (("urban", "city", "block", "building", "facade", "alley"), ("prefab", "city.block.v1", "1.0.0")),
]


def classify_concept(concept: dict) -> dict:
    cid = concept["id"]
    root = cid.split(".")[0]
    low = cid.lower()

    if root == "pa:event":
        return {"id": cid, "category": "event_action", "recipe": None}
    if root in ("pa:observation", "pa:provenance"):
        return {"id": cid, "category": "evidence_provenance", "recipe": None}
    if root in ("pa:material", "pa:render", "pa:workflow", "pa:scene-context", "pa:safety"):
        return {"id": cid, "category": "not_applicable", "reason": f"semantic_or_style_layer:{root}", "recipe": None}

    # Renderable roots: pa:space, pa:geometry, pa:object, pa:actor
    if root == "pa:actor":
        return {
            "id": cid,
            "category": "renderable",
            "recipe": {"targetKind": "actor_template", "recipeKey": "neutral-avatar-v1", "version": "1.0.0"},
        }

    for keywords, (target_kind, recipe_key, version) in PREFAB_BY_KEYWORD:
        if any(k in low for k in keywords):
            return {
                "id": cid,
                "category": "renderable",
                "recipe": {"targetKind": target_kind, "recipeKey": recipe_key, "version": version},
            }

    if any(k in low for k in ("cylinder", "cone", "sphere", "sink", "shrub", "tree", "pole", "hydrant", "lamp", "bollard")):
        prim = "registry-v1:cylinder"
    else:
        prim = "registry-v1:box"

    return {
        "id": cid,
        "category": "renderable",
        "recipe": {"targetKind": "primitive", "recipeKey": prim, "version": "1.0.0"},
    }


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    concepts = catalog.get("concepts", [])
    relations = catalog.get("relations", [])

    reconciled_concepts = [classify_concept(c) for c in concepts]
    counts = Counter(item["category"] for item in reconciled_concepts)
    counts["relationship"] = len(relations)

    payload = {
        "schema": "atlas.scene-ontology-reconciliation.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "catalogPath": "sveltekit-frontend/src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json",
        "conceptCount": len(concepts),
        "relationCount": len(relations),
        "categoryCounts": dict(counts),
        "concepts": reconciled_concepts,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"conceptCount": len(concepts), "relationCount": len(relations), "categoryCounts": dict(counts)}, indent=2))


if __name__ == "__main__":
    main()
