#!/usr/bin/env python3
"""Bounded, lineage-aware XGBoost LTR challenger.

This is a file-to-file experiment lane. It never opens Postgres or registers a
model. Rows must already carry revision-qualified evidence and are grouped by
query before DMatrix construction. Use --dry-run to validate grouping without
requiring XGBoost or CUDA.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


REQUIRED = {
    "queryId", "candidateOrdinal", "sourceRef", "sourceRevision",
    "graphRevision", "featureRevision", "providerRevision", "labelRevision",
    "label", "features", "evidenceRefs",
}


def checksum(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_groups(path: Path) -> tuple[list[dict[str, Any]], str]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise ValueError("XGBOOST_LTR_DATASET_EMPTY")
    for index, row in enumerate(rows, 1):
        missing = sorted(REQUIRED - row.keys())
        if missing:
            raise ValueError(f"XGBOOST_LTR_LINEAGE_MISSING line={index} fields={','.join(missing)}")
        if not isinstance(row["queryId"], str) or not row["queryId"]:
            raise ValueError(f"XGBOOST_LTR_QUERY_ID_INVALID line={index}")
        if not isinstance(row["candidateOrdinal"], int) or row["candidateOrdinal"] < 0:
            raise ValueError(f"XGBOOST_LTR_ORDINAL_INVALID line={index}")
        if not row["features"] or not all(isinstance(value, (int, float)) for value in row["features"]):
            raise ValueError(f"XGBOOST_LTR_FEATURES_INVALID line={index}")
        if not row["evidenceRefs"]:
            raise ValueError(f"XGBOOST_LTR_EVIDENCE_MISSING line={index}")

    widths = {len(row["features"]) for row in rows}
    if len(widths) != 1:
        raise ValueError("XGBOOST_LTR_FEATURE_WIDTH_MISMATCH")

    groups: list[dict[str, Any]] = []
    by_query: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_query.setdefault(row["queryId"], []).append(row)
    for qid, query_id in enumerate(sorted(by_query), 0):
        candidates = sorted(by_query[query_id], key=lambda row: row["candidateOrdinal"])
        ordinals = [row["candidateOrdinal"] for row in candidates]
        if len(set(ordinals)) != len(ordinals):
            raise ValueError(f"XGBOOST_LTR_DUPLICATE_ORDINAL query={query_id}")
        lineage = {(row["sourceRevision"], row["graphRevision"], row["featureRevision"], row["providerRevision"], row["labelRevision"]) for row in candidates}
        if len(lineage) != 1:
            raise ValueError(f"XGBOOST_LTR_LINEAGE_MISMATCH query={query_id}")
        if len(candidates) < 2:
            raise ValueError(f"XGBOOST_LTR_SINGLETON_GROUP query={query_id}")
        groups.append({"qid": qid, "queryId": query_id, "candidates": candidates})
    return groups, checksum(groups)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("classifier-models/xgboost-ltr-v1"))
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    groups, lineage_checksum = load_groups(args.dataset)
    rows = [row for group in groups for row in group["candidates"]]
    result: dict[str, Any] = {
        "schema": "atlas.xgboost-ltr-training-receipt.v1",
        "status": "DRY_RUN_VALIDATED" if args.dry_run else "TRAINING_PENDING",
        "datasetChecksum": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
        "lineageChecksum": lineage_checksum,
        "queryCount": len(groups),
        "rowCount": len(rows),
        "featureWidth": len(rows[0]["features"]),
        "objective": "rank:ndcg",
        "deviceRequested": args.device,
        "canonicalWritesAllowed": False,
    }
    if args.dry_run:
        print(json.dumps(result, indent=2))
        return

    import numpy as np
    import xgboost as xgb

    matrix = np.asarray([row["features"] for row in rows], dtype=np.float32)
    labels = np.asarray([row["label"] for row in rows], dtype=np.float32)
    # QuantileDMatrix is required for the CUDA histogram path. Keep the
    # explicit query groups; qid ordering is part of the lineage checksum.
    dtrain = xgb.QuantileDMatrix(matrix, label=labels)
    dtrain.set_group([len(group["candidates"]) for group in groups])
    booster = xgb.train({"objective": "rank:ndcg", "tree_method": "hist", "device": args.device, "eval_metric": "ndcg@5"}, dtrain, num_boost_round=50)
    resolved_config = json.loads(booster.save_config())
    resolved_device = str(resolved_config.get("learner", {}).get("generic_param", {}).get("device", ""))
    if args.device == "cuda" and not resolved_device.startswith("cuda"):
        raise RuntimeError(f"XGBOOST_CUDA_DEVICE_NOT_RESOLVED:{resolved_device or 'missing'}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "model.json"
    booster.save_model(model_path)
    result.update({
        "status": "TRAINED_UNPROMOTED",
        "modelPath": str(model_path),
        "modelChecksum": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "deviceResolved": resolved_device,
        "resolvedUpdater": resolved_config.get("learner", {}).get("gradient_booster", {}).get("name"),
        "xgboostBuildInfo": xgb.build_info(),
        "promotionEligible": False,
    })
    (args.output_dir / "receipt.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
