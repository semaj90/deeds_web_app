#!/usr/bin/env python3
"""Gate validator for domain gold labels: floor (>=200, >=30/class) & zero source_ref leakage."""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

CLASSES = (
    "retrieval_search",
    "graph_ontology",
    "ui_frontend",
    "storage_schema",
    "ml_inference",
    "legal_regulatory",
)


GROUP_FIELDS = ("source_ref", "sha256", "content_digest")


def build_grouped_splits(
    rows: Sequence[Mapping[str, Any]],
    *,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
) -> dict[str, list[dict[str, Any]]]:
    """Deterministic group split. Rows linked by source_ref, sha256 or content_digest stay together."""
    parent: dict[tuple[str, str], tuple[str, str]] = {}

    def find(node: tuple[str, str]) -> tuple[str, str]:
        parent.setdefault(node, node)
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    keyed: list[tuple[tuple[str, str], str, dict[str, Any]]] = []
    for row in rows:
        src = str(row.get("source_ref") or "").strip()
        if not src:
            raise ValueError("MISSING_SOURCE_REF_FOR_GROUP_SPLIT")
        anchor = ("source_ref", src)
        for field in GROUP_FIELDS[1:]:
            if row.get(field):
                parent[find((field, str(row[field])))] = find(anchor)
        keyed.append((anchor, src, dict(row)))

    by_group: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]] = defaultdict(list)
    for anchor, src, row in keyed:
        by_group[find(anchor)].append((src, row))

    splits: dict[str, list[dict[str, Any]]] = {"train": [], "val": [], "test": []}
    # A group is bucketed by its smallest source_ref, so unlinked files keep their earlier split.
    for members in sorted(by_group.values(), key=lambda m: min(src for src, _ in m)):
        name = min(src for src, _ in members)
        bucket = int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
        split = "train" if bucket < train_ratio else "val" if bucket < train_ratio + val_ratio else "test"
        splits[split].extend(row for _, row in members)
    return splits


def count_split_leakage(splits: Mapping[str, Sequence[Mapping[str, Any]]]) -> int:
    """Values of any group field that appear in more than one split (checked from the rows themselves)."""
    seen: dict[tuple[str, str], set[str]] = defaultdict(set)
    for split, items in splits.items():
        for row in items:
            for field in GROUP_FIELDS:
                if row.get(field):
                    seen[(field, str(row[field]))].add(split)
    return sum(1 for names in seen.values() if len(names) > 1)


def validate_gold_labels(
    rows: Sequence[Mapping[str, Any]],
    *,
    min_total: int = 200,
    min_per_class: int = 30,
) -> dict[str, Any]:
    seen_ids: set[str] = set()
    for idx, r in enumerate(rows):
        chunk_id = r.get("chunk_id")
        if not chunk_id:
            raise ValueError(f"MISSING_CHUNK_ID_AT_ROW_{idx}")
        if chunk_id in seen_ids:
            raise ValueError(f"DUPLICATE_CHUNK_ID_AT_ROW_{idx}: {chunk_id}")
        seen_ids.add(chunk_id)
        if r.get("status") not in ("reviewed", "skip", "ambiguous"):
            raise ValueError(f"INVALID_STATUS_{r.get('status')}_AT_ROW_{idx}")
    reviewed = [dict(r) for r in rows if r.get("status") == "reviewed"]
    for idx, r in enumerate(reviewed):
        if not r.get("chunk_id") or not r.get("source_ref") or not r.get("sha256"):
            raise ValueError(f"INVALID_PROVENANCE_AT_ROW_{idx}")
        if r.get("gold_label") not in CLASSES:
            raise ValueError(f"INVALID_GOLD_LABEL_{r.get('gold_label')}_AT_ROW_{idx}")

    counts = Counter(r["gold_label"] for r in reviewed)
    class_status = {
        cls_name: {"count": counts.get(cls_name, 0), "ok": counts.get(cls_name, 0) >= min_per_class}
        for cls_name in CLASSES
    }
    floor_ok = len(reviewed) >= min_total and all(v["ok"] for v in class_status.values())

    splits = build_grouped_splits(reviewed)
    leakage = count_split_leakage(splits)

    return {
        "schema": "atlas.domain-gold-label-gate.v1",
        "total_reviewed": len(reviewed),
        "min_total": min_total,
        "min_per_class": min_per_class,
        "class_status": class_status,
        "split_sizes": {k: len(v) for k, v in splits.items()},
        "group_leakage_count": leakage,
        "passed": floor_ok and leakage == 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate domain gold-label floor and group splits")
    parser.add_argument("--input", type=Path, default=Path("data/eval/domain_gold_labels_v1.jsonl"))
    parser.add_argument("--min-total", type=int, default=200)
    parser.add_argument("--min-per-class", type=int, default=30)
    args = parser.parse_args()

    if not args.input.exists():
        print(json.dumps({"passed": False, "error": f"missing {args.input}"}, indent=2))
        return 1

    rows = [json.loads(l) for l in args.input.read_text(encoding="utf-8").splitlines() if l.strip()]
    try:
        report = validate_gold_labels(rows, min_total=args.min_total, min_per_class=args.min_per_class)
    except ValueError as error:
        print(json.dumps({"passed": False, "error": str(error)}, indent=2))
        return 1
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
