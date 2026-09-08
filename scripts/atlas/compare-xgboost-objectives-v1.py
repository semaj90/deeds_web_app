#!/usr/bin/env python3
"""Compare immutable XGBoost objective reports without training or promotion.

This is an audit gate for XGBOOST-OBJECTIVE-COMPARE-01.  It deliberately refuses
to report an objective winner unless both reports identify the same dataset,
feature schema, and validation trace cohort.  Existing candidate artifacts and
reports are read only; no model, canonical path, or graph manifest is changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any


EXPECTED_OBJECTIVES = {"reg:squarederror", "rank:ndcg"}
METRICS = ("ndcg_at_5", "ndcg_at_10", "mrr_at_10")


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 16), b""):
            digest.update(block)
    return digest.hexdigest()


def load_report(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"report must be an object: {path}")
    objective = value.get("objective")
    if objective not in EXPECTED_OBJECTIVES:
        raise ValueError(f"unexpected objective {objective!r}: {path}")
    if not isinstance(value.get("per_trace"), list):
        raise ValueError(f"per_trace must be present and an array: {path}")
    return value


def trace_map(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in report["per_trace"]:
        if not isinstance(item, dict) or not isinstance(item.get("trace_id"), str):
            raise ValueError("per_trace contains an invalid trace record")
        trace_id = item["trace_id"]
        if trace_id in result:
            raise ValueError(f"duplicate trace_id in report: {trace_id}")
        result[trace_id] = item
    return result


def finite_metric(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def summarize(report: dict[str, Any]) -> dict[str, Any]:
    model_path = Path(report["model_path"]) if isinstance(report.get("model_path"), str) else None
    return {
        "objective": report["objective"],
        "dataset_revision": report.get("dataset_revision"),
        "feature_schema_revision": report.get("feature_schema_revision"),
        "model_revision": report.get("model_revision"),
        "model_path": str(model_path) if model_path else None,
        "model_sha256": sha256_file(model_path) if model_path else None,
        "train_rows": report.get("train_rows"),
        "val_rows": report.get("val_rows"),
        "val_traces": report.get("val_traces"),
        "metrics": {key: report.get(key) for key in METRICS},
    }


def compare(regression: dict[str, Any], ranking: dict[str, Any]) -> dict[str, Any]:
    reg_traces = trace_map(regression)
    rank_traces = trace_map(ranking)
    reg_ids = set(reg_traces)
    rank_ids = set(rank_traces)
    common = sorted(reg_ids & rank_ids)
    only_reg = sorted(reg_ids - rank_ids)
    only_rank = sorted(rank_ids - reg_ids)

    checks = {
        "objectivesPresent": True,
        "datasetRevisionMatched": regression.get("dataset_revision") == ranking.get("dataset_revision"),
        "featureSchemaRevisionMatched": regression.get("feature_schema_revision") == ranking.get("feature_schema_revision"),
        "validationTraceSetMatched": not only_reg and not only_rank,
        "validationRowCountMatched": regression.get("val_rows") == ranking.get("val_rows"),
        "perTraceCandidateCountsMatched": all(
            reg_traces[trace_id].get("n_candidates") == rank_traces[trace_id].get("n_candidates")
            for trace_id in common
        ),
        "finiteAggregateMetrics": all(
            finite_metric(regression.get(key)) and finite_metric(ranking.get(key)) for key in METRICS
        ),
        "finitePerTraceMetrics": all(
            finite_metric(reg_traces[trace_id].get(key)) and finite_metric(rank_traces[trace_id].get(key))
            for trace_id in common
            for key in METRICS
        ),
    }
    comparable = all(checks.values())
    status = "COMPARABLE_READ_ONLY" if comparable else "BLOCKED_NON_IDENTICAL_VALIDATION_COHORT"

    overlap_metrics = None
    if common:
        overlap_metrics = {
            "traceCount": len(common),
            "regression": {
                key: sum(float(reg_traces[t][key]) for t in common) / len(common) for key in METRICS
            },
            "rankNdcg": {
                key: sum(float(rank_traces[t][key]) for t in common) / len(common) for key in METRICS
            },
        }
        overlap_metrics["deltaRankMinusRegression"] = {
            key: overlap_metrics["rankNdcg"][key] - overlap_metrics["regression"][key] for key in METRICS
        }

    return {
        "schema": "parent-atlas-xgboost-objective-comparison-v1",
        "status": status,
        "promotionAllowed": False,
        "writesPerformed": False,
        "comparisonBasis": "same frozen validation trace cohort, not aggregate metrics alone",
        "checks": checks,
        "regression": summarize(regression),
        "rankNdcg": summarize(ranking),
        "validationTraceCounts": {
            "regression": len(reg_ids),
            "rankNdcg": len(rank_ids),
            "common": len(common),
            "onlyRegression": len(only_reg),
            "onlyRankNdcg": len(only_rank),
        },
        "overlapDiagnostics": overlap_metrics,
        "nonComparableTraceExamples": {
            "onlyRegression": only_reg[:10],
            "onlyRankNdcg": only_rank[:10],
        },
        "nextGate": (
            None
            if comparable
            else "rerun both objectives with one persisted frozen split/validation cohort, then compare"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("regression_report", type=Path)
    parser.add_argument("ranking_report", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    reports = [load_report(args.regression_report), load_report(args.ranking_report)]
    by_objective = {report["objective"]: report for report in reports}
    if set(by_objective) != EXPECTED_OBJECTIVES:
        raise ValueError("provide exactly one reg:squarederror and one rank:ndcg report")
    result = compare(by_objective["reg:squarederror"], by_objective["rank:ndcg"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")
    print(json.dumps({"status": result["status"], "output": str(args.output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
