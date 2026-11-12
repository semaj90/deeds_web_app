#!/usr/bin/env python3
"""Training-free GRPO-style shadow evaluator for helper policies.

This DOES NOT update Ornith weights. It compares groups of candidate helper policies
for the same task and computes group-relative advantages from already-recorded receipts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean, pstdev


def reward(row: dict) -> float:
    success = 1.0 if row.get("taskSucceeded") else 0.0
    validation = float(row.get("validationScore", 0.0))
    token_saving = float(row.get("tokenSavings01", 0.0))
    latency = float(row.get("latencyPenalty01", 0.0))
    failed_actions = float(row.get("failedActionPenalty01", 0.0))
    return 0.45 * success + 0.30 * validation + 0.15 * token_saving - 0.06 * latency - 0.04 * failed_actions


def evaluate(payload: dict) -> dict:
    groups = []
    for group in payload["groups"]:
        rows = []
        rewards = [reward(x) for x in group["candidates"]]
        mu = mean(rewards) if rewards else 0.0
        sigma = pstdev(rewards) if len(rewards) > 1 else 0.0
        denom = sigma if sigma > 1e-12 else 1.0
        for candidate, r in zip(group["candidates"], rewards):
            rows.append({
                "policyId": candidate["policyId"],
                "reward": r,
                "groupRelativeAdvantage": (r - mu) / denom if sigma > 1e-12 else 0.0,
            })
        rows.sort(key=lambda x: (-x["groupRelativeAdvantage"], x["policyId"]))
        groups.append({
            "taskRef": group["taskRef"],
            "candidates": rows,
            "winner": rows[0]["policyId"] if rows else None,
        })
    return {
        "schema": "parent-atlas.grpo-policy-shadow.v1",
        "groups": groups,
        "training": False,
        "modelWeightsChanged": False,
        "promotion": "SHADOW_ONLY",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_json")
    ap.add_argument("output_json")
    args = ap.parse_args()
    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    result = evaluate(payload)
    Path(args.output_json).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "OK", "groups": len(result["groups"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
