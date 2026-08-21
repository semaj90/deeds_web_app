#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import xgboost as xgb

DOMAINS = ["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS = ["find","explain","debug","modify","compare","trace","test","synthesize"]
INPUT_DIM = 234
TENSOR_REVISION = "atlas.retrieval-router-tensor.v2"
MODEL_REVISION = "atlas.query-router-xgboost.v2"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rows(path: Path):
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(rows) < 20:
        raise ValueError("at least 20 rows required")
    for i, row in enumerate(rows, 1):
        if row.get("tensorRevision") != TENSOR_REVISION:
            raise ValueError(f"line {i}: tensorRevision mismatch")
        if len(row.get("featureTensor234", [])) != INPUT_DIM:
            raise ValueError(f"line {i}: feature width mismatch")
        if row.get("split") not in {"train","validation","test"}:
            raise ValueError(f"line {i}: invalid split")
        if row.get("domainLabel") not in DOMAINS or row.get("operationLabel") not in OPERATIONS:
            raise ValueError(f"line {i}: label mismatch")
    return rows


def matrix(rows):
    return np.asarray([r["featureTensor234"] for r in rows], dtype=np.float32)


def multiclass_labels(rows, vocabulary, field):
    return np.asarray([vocabulary.index(r[field]) for r in rows], dtype=np.int32)


def train_multiclass(x_train, y_train, x_val, y_val, classes, seed):
    model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=classes,
        n_estimators=250,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        random_state=seed,
        tree_method="hist",
        eval_metric="mlogloss",
    )
    model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
    return model


def train_binary(x_train, y_train, seed):
    model = xgb.XGBClassifier(
        objective="binary:logistic",
        n_estimators=180,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=seed,
        tree_method="hist",
        eval_metric="logloss",
    )
    model.fit(x_train, y_train, verbose=False)
    return model


def train_regression(x_train, y_train, seed):
    model = xgb.XGBRegressor(
        objective="reg:squarederror",
        n_estimators=180,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=seed,
        tree_method="hist",
    )
    model.fit(x_train, y_train, verbose=False)
    return model


def accuracy(model, x, y):
    return float(np.mean(model.predict(x) == y))


def binary_logloss(model, x, y):
    p = np.clip(model.predict_proba(x)[:, 1], 1e-7, 1 - 1e-7)
    return float(np.mean(-(y * np.log(p) + (1 - y) * np.log(1 - p))))


def mse(model, x, y):
    p = np.clip(model.predict(x), 0, 1)
    return float(np.mean((p - y) ** 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, default=Path("classifier-models/query-router-v2-xgboost"))
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rows = load_rows(args.dataset)
    train = [r for r in rows if r["split"] == "train"]
    val = [r for r in rows if r["split"] == "validation"]
    test = [r for r in rows if r["split"] == "test"]
    if not train or not val or not test:
        raise ValueError("all frozen splits must be non-empty")

    xt, xv, xs = matrix(train), matrix(val), matrix(test)
    yd_t, yd_v, yd_s = multiclass_labels(train, DOMAINS, "domainLabel"), multiclass_labels(val, DOMAINS, "domainLabel"), multiclass_labels(test, DOMAINS, "domainLabel")
    yo_t, yo_v, yo_s = multiclass_labels(train, OPERATIONS, "operationLabel"), multiclass_labels(val, OPERATIONS, "operationLabel"), multiclass_labels(test, OPERATIONS, "operationLabel")

    domain = train_multiclass(xt, yd_t, xv, yd_v, len(DOMAINS), args.seed)
    operation = train_multiclass(xt, yo_t, xv, yo_v, len(OPERATIONS), args.seed + 1)

    needs_models = []
    needs_metrics = []
    for i in range(8):
        yt = np.asarray([r["retrievalNeeds"][i] >= 0.5 for r in train], dtype=np.int32)
        yv = np.asarray([r["retrievalNeeds"][i] >= 0.5 for r in val], dtype=np.int32)
        ys = np.asarray([r["retrievalNeeds"][i] >= 0.5 for r in test], dtype=np.int32)
        model = train_binary(xt, yt, args.seed + 10 + i)
        needs_models.append(model)
        needs_metrics.append({"validationLogloss": binary_logloss(model, xv, yv), "testLogloss": binary_logloss(model, xs, ys)})

    budget_models = []
    budget_metrics = []
    for i in range(3):
        yt = np.asarray([r["budgetTargets"][i] for r in train], dtype=np.float32)
        yv = np.asarray([r["budgetTargets"][i] for r in val], dtype=np.float32)
        ys = np.asarray([r["budgetTargets"][i] for r in test], dtype=np.float32)
        model = train_regression(xt, yt, args.seed + 30 + i)
        budget_models.append(model)
        budget_metrics.append({"validationMse": mse(model, xv, yv), "testMse": mse(model, xs, ys)})

    args.output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = {}
    for name, model in [("domain", domain), ("operation", operation)]:
        path = args.output_dir / f"{name}.json"; model.save_model(path); artifacts[name] = {"path": str(path), "sha256": sha256(path)}
    for i, model in enumerate(needs_models):
        path = args.output_dir / f"retrieval-need-{i}.json"; model.save_model(path); artifacts[f"retrievalNeed{i}"] = {"path": str(path), "sha256": sha256(path)}
    for i, model in enumerate(budget_models):
        path = args.output_dir / f"budget-{i}.json"; model.save_model(path); artifacts[f"budget{i}"] = {"path": str(path), "sha256": sha256(path)}

    receipt = {
        "schema": "atlas.query-router-training-receipt.v2",
        "trainer": "xgboost",
        "modelRevision": MODEL_REVISION,
        "tensorRevision": TENSOR_REVISION,
        "datasetPath": str(args.dataset),
        "datasetChecksum": sha256(args.dataset),
        "inputDimension": INPUT_DIM,
        "trainCount": len(train), "validationCount": len(val), "testCount": len(test), "seed": args.seed,
        "objectives": {"domain": "multi:softprob", "operation": "multi:softprob", "retrievalNeeds": "binary:logistic", "budget": "reg:squarederror"},
        "validationMetrics": {"domainAccuracy": accuracy(domain, xv, yd_v), "operationAccuracy": accuracy(operation, xv, yo_v), "retrievalNeeds": needs_metrics, "budget": budget_metrics},
        "testMetrics": {"domainAccuracy": accuracy(domain, xs, yd_s), "operationAccuracy": accuracy(operation, xs, yo_s)},
        "artifacts": artifacts,
        "evidenceAuthority": False,
        "canonicalOwnerChanged": False,
        "retrievalOwnerChanged": False,
    }
    (args.output_dir / "training-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
