#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

REQUIRED_TENSOR = "atlas.retrieval-router-tensor.v2"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def score(receipt: dict) -> float:
    m = receipt.get("testMetrics", {})
    domain = float(m.get("domainAccuracy", 0.0))
    operation = float(m.get("operationAccuracy", 0.0))
    if receipt.get("trainer") == "pytorch":
        need_penalty = float(m.get("retrievalNeedsBcePerRow", 10.0)) * 0.05
        budget_penalty = float(m.get("budgetMsePerRow", 10.0)) * 0.02
    else:
        val = receipt.get("validationMetrics", {})
        needs = val.get("retrievalNeeds", [])
        budget = val.get("budget", [])
        need_penalty = (sum(float(x.get("testLogloss", 10.0)) for x in needs) / max(1, len(needs))) * 0.05
        budget_penalty = (sum(float(x.get("testMse", 10.0)) for x in budget) / max(1, len(budget))) * 0.02
    return domain + operation - need_penalty - budget_penalty


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pytorch-receipt", type=Path, required=True)
    ap.add_argument("--xgboost-receipt", type=Path, required=True)
    ap.add_argument("--output", type=Path, default=Path("docs/reports/query-router-v2-comparison.json"))
    ap.add_argument("--min-domain-accuracy", type=float, default=0.75)
    ap.add_argument("--min-operation-accuracy", type=float, default=0.75)
    args = ap.parse_args()

    receipts = [load(args.pytorch_receipt), load(args.xgboost_receipt)]
    for receipt in receipts:
        if receipt.get("tensorRevision") != REQUIRED_TENSOR:
            raise ValueError(f"tensor revision mismatch: {receipt.get('tensorRevision')}")
        if receipt.get("evidenceAuthority") is not False or receipt.get("retrievalOwnerChanged") is not False:
            raise ValueError("router receipt illegally claims evidence/retrieval authority")

    checksums = {r.get("datasetChecksum") for r in receipts}
    if len(checksums) != 1 or None in checksums:
        raise ValueError(f"SAME_CORPUS_GATE_FAILED dataset checksums={sorted(str(x) for x in checksums)}")

    rows = []
    for receipt in receipts:
        tm = receipt.get("testMetrics", {})
        rows.append({
            "trainer": receipt.get("trainer"),
            "domainAccuracy": float(tm.get("domainAccuracy", 0.0)),
            "operationAccuracy": float(tm.get("operationAccuracy", 0.0)),
            "compositeScore": score(receipt),
        })
    rows.sort(key=lambda row: row["compositeScore"], reverse=True)
    winner = rows[0]
    quality_gate = winner["domainAccuracy"] >= args.min_domain_accuracy and winner["operationAccuracy"] >= args.min_operation_accuracy

    report = {
        "schema": "atlas.query-router-comparison.v2",
        "tensorRevision": REQUIRED_TENSOR,
        "datasetChecksum": next(iter(checksums)),
        "sameCorpusPass": True,
        "results": rows,
        "winner": winner["trainer"],
        "qualityGatePass": quality_gate,
        "promotionDecision": "SHADOW_ELIGIBLE" if quality_gate else "REJECTED_OFFLINE",
        "productionOwnerChanged": False,
        "retrievalOwnerChanged": False,
        "nextGate": "shadow-runtime" if quality_gate else "improve-dataset-or-model",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
