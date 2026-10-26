"""Read-only query -> taxonomy candidate resolver (advisory).

Proposes taxonomy concepts for a free-text query. It never mints identity and never writes.
- Lexical and trigram similarity PROPOSE candidates; they do not establish taxonomy identity.
- Ordering and pagination reuse the existing atlas.topk.v1 owner: python/atlas_compute/topk_paginator.stable_topk.
- Input is the frozen 17-group snapshot (taxonomy-groups-snapshot-2026-10-13.json), not the database.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "python"))
from atlas_compute.topk_paginator import stable_topk  # noqa: E402

SNAPSHOT = HERE / "taxonomy-groups-snapshot-2026-10-13.json"
SIMILARITY_FLOOR = 0.2  # below this a candidate is not reported at all


def load_snapshot(path: Path = SNAPSHOT) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if t}


def _trigrams(text: str) -> set[str]:
    s = re.sub(r"[^a-z0-9]", "", text.lower())
    return {s[i : i + 3] for i in range(len(s) - 2)} if len(s) >= 3 else {s} if s else set()


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def resolve(query: str, k: int = 10, offset: int = 0, snapshot: dict | None = None) -> dict:
    snap = snapshot or load_snapshot()
    q_tokens, q_tri = _tokens(query), _trigrams(query)
    candidates = []
    for g in snap["groups"]:
        label_tokens = _tokens(g["group_label"]) | _tokens(g["group_id"])
        lexical = _jaccard(q_tokens, label_tokens)
        tri = _jaccard(q_tri, _trigrams(g["group_label"]) | _trigrams(g["group_id"]))
        score = round(max(lexical, tri), 6)
        if score < SIMILARITY_FLOOR:
            continue
        candidates.append({
            "canonicalId": g["group_id"],
            "candidateOrdinal": g["taxonomy_level"] * 1000 + len(candidates),
            "score": score,
            "classification": "PROPOSED_CANDIDATE",
            "lexicalScore": round(lexical, 6),
            "trigramScore": round(tri, 6),
        })
    # Deterministic ordering (score desc, ordinal asc, id asc) is enforced by stable_topk.
    # stable_topk returns only the atlas.topk.v1 fields, so annotations are joined back by canonicalId.
    by_id = {c["canonicalId"]: c for c in candidates}
    page = stable_topk(candidates, k, offset)
    annotated = []
    for item in page.get("candidates", []):
        extra = by_id[item["canonicalId"]]
        annotated.append({**item, "classification": extra["classification"],
                          "lexicalScore": extra["lexicalScore"], "trigramScore": extra["trigramScore"]})
    if "candidates" in page:
        page = {**page, "candidates": annotated}
    return {
        "schema": "atlas.taxonomy-query-resolution.v1",
        "advisory": True,
        "canonicalAuthority": False,
        "snapshotChecksum": snap["checksum"],
        "query": query,
        "k": k,
        "offset": offset,
        "page": page,
    }


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or "machine learning"
    print(json.dumps(resolve(q), indent=2))
