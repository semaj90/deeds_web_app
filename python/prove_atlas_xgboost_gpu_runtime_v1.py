#!/usr/bin/env python3
"""Bounded, synthetic XGBoost CUDA runtime proof for Parent Atlas.

This proves executor/runtime capability only. It never reads Parent Atlas
training data and never authorizes model promotion.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time
from typing import Any

import numpy as np


def _find_key(value: Any, key: str) -> list[Any]:
    found: list[Any] = []
    if isinstance(value, dict):
        for k, v in value.items():
            if k == key:
                found.append(v)
            found.extend(_find_key(v, key))
    elif isinstance(value, list):
        for item in value:
            found.extend(_find_key(item, key))
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--cols", type=int, default=32)
    parser.add_argument("--rounds", type=int, default=128)
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    if args.rows < 1_024 or args.cols < 2 or args.rounds < 1:
        raise SystemExit("XGBOOST_GPU_PROOF_BOUNDS_INVALID")

    try:
        import xgboost as xgb
    except ImportError as exc:
        raise SystemExit("XGBOOST_NOT_INSTALLED") from exc

    rng = np.random.default_rng(42)
    X = rng.normal(size=(args.rows, args.cols)).astype(np.float32)
    y = (
        X[:, 0] * 0.7
        - X[:, 1] * 0.4
        + X[:, 0] * X[:, 1] * 0.2
    ).astype(np.float32)

    matrix_started = time.perf_counter()
    dtrain = xgb.QuantileDMatrix(X, label=y)
    matrix_ms = (time.perf_counter() - matrix_started) * 1000.0

    params = {
        "objective": "reg:squarederror",
        "tree_method": "hist",
        "device": args.device,
        "max_depth": 8,
        "learning_rate": 0.05,
        "verbosity": 1,
        "seed": 42,
    }

    train_started = time.perf_counter()
    booster = xgb.train(params, dtrain, num_boost_round=args.rounds)
    train_ms = (time.perf_counter() - train_started) * 1000.0

    config = json.loads(booster.save_config())
    device_values = [str(value) for value in _find_key(config, "device")]
    actual_cuda = any(value.startswith("cuda") for value in device_values)
    requested_cuda = str(args.device).startswith("cuda")
    if requested_cuda and not actual_cuda:
        raise SystemExit(f"XGBOOST_CUDA_REQUEST_NOT_HONORED:{device_values}")

    preds = booster.predict(dtrain)
    finite_predictions = bool(np.isfinite(preds).all())
    if not finite_predictions:
        raise SystemExit("XGBOOST_GPU_PREDICTIONS_NONFINITE")

    build_info = xgb.build_info() if hasattr(xgb, "build_info") else {}
    receipt = {
        "schema": "atlas.xgboost-gpu-runtime-receipt.v1",
        "status": "XGBOOST_GPU_RUNTIME_PROVEN" if requested_cuda and actual_cuda else "XGBOOST_RUNTIME_PROVEN",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "xgboostVersion": xgb.__version__,
        "buildInfo": build_info,
        "requestedDevice": args.device,
        "configuredDevices": device_values,
        "actualCudaConfigured": actual_cuda,
        "treeMethod": "hist",
        "matrix": "QuantileDMatrix",
        "rows": args.rows,
        "cols": args.cols,
        "rounds": args.rounds,
        "matrixBuildMs": matrix_ms,
        "trainMs": train_ms,
        "predictionCount": int(preds.shape[0]),
        "predictionMin": float(np.min(preds)),
        "predictionMax": float(np.max(preds)),
        "finitePredictions": finite_predictions,
        "trainingData": "SYNTHETIC_FIXTURE",
        "canonicalWriteAttempted": False,
        "postgresWrites": False,
        "qdrantWrites": False,
        "neo4jWrites": False,
        "valkeyWrites": False,
        "modelPromotionAuthorized": False,
    }

    encoded = json.dumps(receipt, indent=2, sort_keys=True, default=str)
    print(encoded)
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(encoded + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
