#!/usr/bin/env python3
"""Compare Parent Atlas PageRank receipts without assuming backend equality.

TODO(TEST-LATER): feed one NetworkX authority receipt and one cuGraph execution
receipt produced from the SAME revisioned projection/config. This script does not
run either backend; it only proves whether their evidence is comparable and then
measures numeric/ranking disagreement.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def score_map(receipt: dict) -> dict[str, float]:
    rows = receipt.get("scores") or receipt.get("result", {}).get("scores") or []
    out: dict[str, float] = {}
    for row in rows:
        key = row.get("nodeKey") or row.get("packet_key") or row.get("vertex")
        value = row.get("pagerankRaw", row.get("score", row.get("pagerank")))
        if key is not None and value is not None:
            out[str(key)] = float(value)
    return out


def rank_map(scores: dict[str, float]) -> dict[str, int]:
    ordered = sorted(scores, key=lambda k: (-scores[k], k))
    return {key: i for i, key in enumerate(ordered)}


def compare(reference: dict, executor: dict, *, top_k: int, abs_tol: float) -> dict:
    comparable_fields = ["projection_hash", "config_hash"]
    mismatches = [
        field for field in comparable_fields
        if reference.get(field) and executor.get(field) and reference.get(field) != executor.get(field)
    ]
    ref_scores, exe_scores = score_map(reference), score_map(executor)
    shared = sorted(set(ref_scores) & set(exe_scores))
    if not shared:
        return {"status": "NOT_COMPARABLE", "reason": "no shared score identities", "mismatches": mismatches}

    diffs = [abs(ref_scores[k] - exe_scores[k]) for k in shared]
    ref_rank, exe_rank = rank_map(ref_scores), rank_map(exe_scores)
    ref_top = set(sorted(ref_scores, key=lambda k: (-ref_scores[k], k))[:top_k])
    exe_top = set(sorted(exe_scores, key=lambda k: (-exe_scores[k], k))[:top_k])
    overlap = len(ref_top & exe_top) / max(1, len(ref_top | exe_top))
    mean_rank_delta = sum(abs(ref_rank[k] - exe_rank[k]) for k in shared) / len(shared)

    status = "PASS" if not mismatches and max(diffs) <= abs_tol else "FAIL"
    return {
        "schema": "atlas.pagerank-parity-report.v1",
        "status": status,
        "shared_nodes": len(shared),
        "max_abs_error": max(diffs),
        "mean_abs_error": sum(diffs) / len(diffs),
        "rmse": math.sqrt(sum(d * d for d in diffs) / len(diffs)),
        "mean_rank_delta": mean_rank_delta,
        "top_k": top_k,
        "top_k_jaccard": overlap,
        "projection_or_config_mismatches": mismatches,
        "thresholds": {"max_abs_error": abs_tol},
        "todo": [
            "TODO(TEST-LATER): choose promotion thresholds from golden graph fixtures, not from this stub.",
            "TODO(TEST-LATER): persist this report next to both backend receipts.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("reference", type=Path)
    ap.add_argument("executor", type=Path)
    ap.add_argument("--top-k", type=int, default=20)
    ap.add_argument("--abs-tol", type=float, default=1e-5)
    args = ap.parse_args()
    report = compare(load(args.reference), load(args.executor), top_k=args.top_k, abs_tol=args.abs_tol)
    print(json.dumps(report, sort_keys=True))
    return 0 if report.get("status") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
