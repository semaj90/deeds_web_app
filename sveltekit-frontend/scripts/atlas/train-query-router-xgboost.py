#!/usr/bin/env python3
"""Train an XGBoost query-router baseline on the same frozen Atlas dataset.

This is NOT the legacy best_retrieval_lane classifier. It learns the same
logical targets as QueryRouterMLPV1:
  - domain probabilities
  - operation probabilities
  - eight independent retrieval-need probabilities
  - three normalized budget predictions

The dataset remains executor-agnostic. HNSW/CAGRA/DiskANN/BM25/miniCOIL/SPLADE
selection happens later through RetrievalExecutorCapabilityV1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, f1_score, mean_squared_error, roc_auc_score

DOMAINS = [
    "code", "database", "retrieval", "graph", "api", "security",
    "documentation", "workflow", "testing", "unknown",
]
OPERATIONS = ["find", "explain", "debug", "modify", "compare", "trace", "test", "synthesize"]
EMBED_DIM = 128
QUERY_FEATURE_DIM = 26
INPUT_DIM = EMBED_DIM + QUERY_FEATURE_DIM
NEED_DIM = 8
BUDGET_DIM = 3
MODEL_REVISION = "atlas.query-router-xgboost.v1"
FEATURE_CONTRACT_REVISION = "atlas.query-router-tensor.v1"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def split_name(query_id: str) -> str:
    """Stable 80/10/10 split independent of row order and ML framework."""
    bucket = int(hashlib.sha256(query_id.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def load_dataset(path: Path):
    raw = path.read_bytes()
    rows: list[dict[str, Any]] = []
    for lineno, line in enumerate(raw.decode("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        item = json.loads(line)
        emb = np.asarray(item["embedding_mrl_128"], dtype=np.float32)
        qf = np.asarray(item["query_features"], dtype=np.float32)
        needs = np.asarray(item["retrieval_needs"], dtype=np.float32)
        budget = np.asarray(item["budget_targets"], dtype=np.float32)
        if emb.shape != (EMBED_DIM,):
            raise ValueError(f"line {lineno}: expected 128d embedding")
        if qf.shape != (QUERY_FEATURE_DIM,):
            raise ValueError(f"line {lineno}: expected 26 query features")
        if needs.shape != (NEED_DIM,) or np.any(needs < 0) or np.any(needs > 1):
            raise ValueError(f"line {lineno}: invalid retrieval needs")
        if budget.shape != (BUDGET_DIM,) or np.any(budget < 0) or np.any(budget > 1):
            raise ValueError(f"line {lineno}: invalid budget targets")
        if not np.isfinite(emb).all() or not np.isfinite(qf).all():
            raise ValueError(f"line {lineno}: non-finite features")
        domain = str(item["domain_label"])
        operation = str(item["operation_label"])
        if domain not in DOMAINS or operation not in OPERATIONS:
            raise ValueError(f"line {lineno}: unknown labels")
        rows.append({
            "query_id": str(item["query_id"]),
            "x": np.concatenate([emb, qf]).astype(np.float32, copy=False),
            "domain": DOMAINS.index(domain),
            "operation": OPERATIONS.index(operation),
            "needs": needs,
            "budget": budget,
        })
    if len(rows) < 30:
        raise ValueError("at least 30 rows are required for train/validation/test comparison")
    return rows, sha256_bytes(raw)


def matrix(rows: list[dict[str, Any]], split: str):
    selected = [r for r in rows if split_name(r["query_id"]) == split]
    if not selected:
        raise ValueError(f"stable split {split!r} is empty")
    return (
        np.stack([r["x"] for r in selected]),
        np.asarray([r["domain"] for r in selected], dtype=np.int64),
        np.asarray([r["operation"] for r in selected], dtype=np.int64),
        np.stack([r["needs"] for r in selected]),
        np.stack([r["budget"] for r in selected]),
        [r["query_id"] for r in selected],
    )


def multiclass_model(num_class: int, seed: int):
    return xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=num_class,
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        eval_metric="mlogloss",
        random_state=seed,
        n_jobs=0,
    )


def binary_model(seed: int):
    return xgb.XGBClassifier(
        objective="binary:logistic",
        n_estimators=250,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        eval_metric="logloss",
        random_state=seed,
        n_jobs=0,
    )


def regression_model(seed: int):
    return xgb.XGBRegressor(
        objective="reg:squarederror",
        n_estimators=250,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        tree_method="hist",
        eval_metric="rmse",
        random_state=seed,
        n_jobs=0,
    )


def safe_auc(y_true: np.ndarray, y_score: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, y_score))


def evaluate(models: dict[str, Any], split_data):
    X, domain, operation, needs, budget, query_ids = split_data
    domain_prob = models["domain"].predict_proba(X)
    operation_prob = models["operation"].predict_proba(X)
    needs_prob = np.stack([model.predict_proba(X)[:, 1] for model in models["needs"]], axis=1)
    budget_pred = np.stack([np.clip(model.predict(X), 0, 1) for model in models["budget"]], axis=1)

    need_f1 = []
    need_auc = []
    for idx in range(NEED_DIM):
        pred = (needs_prob[:, idx] >= 0.5).astype(np.int64)
        need_f1.append(float(f1_score(needs[:, idx].astype(np.int64), pred, zero_division=0)))
        need_auc.append(safe_auc(needs[:, idx], needs_prob[:, idx]))

    predictions = []
    for i, query_id in enumerate(query_ids):
        predictions.append({
            "query_id": query_id,
            "domain_probabilities": domain_prob[i].tolist(),
            "operation_probabilities": operation_prob[i].tolist(),
            "retrieval_need_probabilities": needs_prob[i].tolist(),
            "budget_predictions": budget_pred[i].tolist(),
        })

    return {
        "domain_accuracy": float(accuracy_score(domain, domain_prob.argmax(axis=1))),
        "domain_macro_f1": float(f1_score(domain, domain_prob.argmax(axis=1), average="macro", zero_division=0)),
        "operation_accuracy": float(accuracy_score(operation, operation_prob.argmax(axis=1))),
        "operation_macro_f1": float(f1_score(operation, operation_prob.argmax(axis=1), average="macro", zero_division=0)),
        "retrieval_need_macro_f1": float(np.mean(need_f1)),
        "retrieval_need_f1_by_index": need_f1,
        "retrieval_need_auc_by_index": need_auc,
        "budget_mse": float(mean_squared_error(budget, budget_pred)),
        "row_count": int(X.shape[0]),
        "predictions": predictions,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("classifier-models/query-router-xgboost-v1"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rows, dataset_checksum = load_dataset(args.dataset)
    train = matrix(rows, "train")
    validation = matrix(rows, "validation")
    test = matrix(rows, "test")
    X_train, domain_train, operation_train, needs_train, budget_train, _ = train

    domain_model = multiclass_model(len(DOMAINS), args.seed)
    domain_model.fit(X_train, domain_train)
    operation_model = multiclass_model(len(OPERATIONS), args.seed + 1)
    operation_model.fit(X_train, operation_train)

    need_models = []
    for index in range(NEED_DIM):
        labels = needs_train[:, index].astype(np.int64)
        if len(np.unique(labels)) < 2:
            raise ValueError(f"retrieval need {index} has only one class in stable train split")
        model = binary_model(args.seed + 10 + index)
        model.fit(X_train, labels)
        need_models.append(model)

    budget_models = []
    for index in range(BUDGET_DIM):
        model = regression_model(args.seed + 30 + index)
        model.fit(X_train, budget_train[:, index])
        budget_models.append(model)

    models = {"domain": domain_model, "operation": operation_model, "needs": need_models, "budget": budget_models}
    validation_metrics = evaluate(models, validation)
    test_metrics = evaluate(models, test)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "query-router-xgboost-v1.pkl"
    with model_path.open("wb") as handle:
        pickle.dump(models, handle)
    model_checksum = sha256_bytes(model_path.read_bytes())

    prediction_path = args.output_dir / "test-predictions.jsonl"
    prediction_path.write_text("\n".join(json.dumps(row, sort_keys=True) for row in test_metrics.pop("predictions")) + "\n", encoding="utf-8")
    validation_metrics.pop("predictions")

    receipt = {
        "schema": "atlas.query-router-xgboost-training-receipt.v1",
        "modelRevision": MODEL_REVISION,
        "featureContractRevision": FEATURE_CONTRACT_REVISION,
        "embeddingModelId": "google/embeddinggemma-300m",
        "embeddingRepresentationId": "classification_mrl_128",
        "inputDimension": INPUT_DIM,
        "objectiveDomain": "multi:softprob",
        "objectiveOperation": "multi:softprob",
        "objectiveRetrievalNeeds": "binary:logistic",
        "objectiveBudget": "reg:squarederror",
        "datasetPath": str(args.dataset),
        "datasetSha256": dataset_checksum,
        "stableSplit": "sha256(query_id) bucket 80/10/10",
        "splitCounts": {
            "train": len(train[-1]),
            "validation": len(validation[-1]),
            "test": len(test[-1]),
        },
        "validation": validation_metrics,
        "test": test_metrics,
        "modelPath": str(model_path),
        "modelSha256": model_checksum,
        "testPredictionsPath": str(prediction_path),
        "evidenceAuthority": False,
        "canonicalWritesPerformed": False,
    }
    receipt_path = args.output_dir / "training-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
