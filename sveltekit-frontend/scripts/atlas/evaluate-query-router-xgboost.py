#!/usr/bin/env python3
"""Evaluate an XGBoost baseline on the exact Parent Atlas router tensor/split.

This script is evaluation-only. It consumes the same revision-qualified JSONL
as train-query-router-pytorch.py and reproduces PyTorch random_split indices
using torch.randperm + the same seed. It does not write Postgres/Qdrant/Valkey
and does not change the runtime router.

Stable baseline shape:
- domain: one multiclass XGBClassifier
- operation: one multiclass XGBClassifier
- retrieval needs: eight independent binary XGBClassifiers
- budgets: three independent XGBRegressors

We intentionally do not depend on XGBoost's experimental multi-output tree
feature for the promotion baseline.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch
import xgboost as xgb
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, mean_squared_error, roc_auc_score

DOMAINS = ["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS = ["find","explain","debug","modify","compare","trace","test","synthesize"]
MODEL_ID = "google/embeddinggemma-300m"
PROMPT_REVISION = "embeddinggemma-classification-prompt-google-model-card-v1"
SOURCE_REPRESENTATION = "classification_768"
ROUTER_REPRESENTATION = "classification_mrl_128"
PROJECTION_REVISION = "MRL_PREFIX_128_FLOAT32_L2_V1"
QUERY_FEATURE_REVISION = "atlas.query-feature-projection.v1"
TENSOR_REVISION = "atlas.query-router-tensor.v1"
BUDGET_NORMALIZATION_REVISION = "atlas.query-router-budget-normalization.v1"
INPUT_DIM = 154
NEED_DIM = 8
BUDGET_DIM = 3

REQUIRED_UNIFORM = {
    "embedding_model_id": MODEL_ID,
    "prompt_revision": PROMPT_REVISION,
    "embedding_source_representation_id": SOURCE_REPRESENTATION,
    "embedding_representation_id": ROUTER_REPRESENTATION,
    "projection_revision": PROJECTION_REVISION,
    "feature_revision": QUERY_FEATURE_REVISION,
    "tensor_revision": TENSOR_REVISION,
    "budget_normalization_revision": BUDGET_NORMALIZATION_REVISION,
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_dataset(path: Path):
    raw = path.read_bytes()
    rows: list[dict[str, Any]] = []
    lineage_sets: dict[str, set[str]] = {"embedding_model_revision": set(), "label_revision": set()}
    for lineno, line in enumerate(raw.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        item = json.loads(line)
        for key, expected in REQUIRED_UNIFORM.items():
            if item.get(key) != expected:
                raise ValueError(f"line {lineno}: {key} mismatch: {item.get(key)!r}")
        for key in lineage_sets:
            value = item.get(key)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"line {lineno}: {key} required")
            lineage_sets[key].add(value.strip())
        emb = np.asarray(item["embedding_mrl_128"], dtype=np.float32)
        qf = np.asarray(item["query_features"], dtype=np.float32)
        needs = np.asarray(item["retrieval_needs"], dtype=np.float32)
        budget = np.asarray(item["budget_targets"], dtype=np.float32)
        if emb.shape != (128,) or qf.shape != (26,) or needs.shape != (8,) or budget.shape != (3,):
            raise ValueError(f"line {lineno}: tensor shape mismatch")
        if not np.isfinite(emb).all() or not np.isfinite(qf).all() or not np.isfinite(needs).all() or not np.isfinite(budget).all():
            raise ValueError(f"line {lineno}: non-finite tensor")
        if abs(float(np.linalg.norm(emb)) - 1.0) > 1e-4:
            raise ValueError(f"line {lineno}: embedding_mrl_128 not normalized")
        if item["domain_label"] not in DOMAINS or item["operation_label"] not in OPERATIONS:
            raise ValueError(f"line {lineno}: unknown categorical label")
        rows.append(item)
    if len(rows) < 20:
        raise ValueError("at least 20 evaluation rows are required")
    for key, values in lineage_sets.items():
        if len(values) != 1:
            raise ValueError(f"mixed {key}: {sorted(values)}")
    X = np.asarray([list(row["embedding_mrl_128"]) + list(row["query_features"]) for row in rows], dtype=np.float32)
    if X.shape[1] != INPUT_DIM:
        raise ValueError(f"input width mismatch: {X.shape}")
    domain = np.asarray([DOMAINS.index(row["domain_label"]) for row in rows], dtype=np.int64)
    operation = np.asarray([OPERATIONS.index(row["operation_label"]) for row in rows], dtype=np.int64)
    needs = np.asarray([row["retrieval_needs"] for row in rows], dtype=np.float32)
    budget = np.asarray([row["budget_targets"] for row in rows], dtype=np.float32)
    lineage = {key: next(iter(values)) for key, values in lineage_sets.items()}
    return raw, rows, X, domain, operation, needs, budget, lineage


def pytorch_random_split_indices(n: int, seed: int):
    val_count = max(4, int(round(n * 0.2)))
    train_count = n - val_count
    generator = torch.Generator().manual_seed(seed)
    permutation = torch.randperm(n, generator=generator).tolist()
    return np.asarray(permutation[:train_count], dtype=np.int64), np.asarray(permutation[train_count:], dtype=np.int64)


def multiclass_metrics(y_true: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(y_true, pred)),
        "macro_f1": float(f1_score(y_true, pred, average="macro", zero_division=0)),
    }


def binary_metrics(y_true: np.ndarray, probability: np.ndarray) -> dict[str, float | None]:
    pred = (probability >= 0.5).astype(np.int64)
    auc = None
    if np.unique(y_true).size == 2:
        auc = float(roc_auc_score(y_true, probability))
    return {
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "brier": float(brier_score_loss(y_true, probability)),
        "auroc": auc,
    }


def classifier(device: str, seed: int, n_estimators: int, max_depth: int):
    return xgb.XGBClassifier(
        tree_method="hist", device=device, n_estimators=n_estimators, max_depth=max_depth,
        learning_rate=0.05, subsample=1.0, colsample_bytree=1.0, reg_lambda=1.0,
        random_state=seed, n_jobs=1,
    )


def regressor(device: str, seed: int, n_estimators: int, max_depth: int):
    return xgb.XGBRegressor(
        tree_method="hist", device=device, n_estimators=n_estimators, max_depth=max_depth,
        learning_rate=0.05, subsample=1.0, colsample_bytree=1.0, reg_lambda=1.0,
        random_state=seed, n_jobs=1, objective="reg:squarederror",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("classifier-models/query-router-v1/xgboost-evaluation-receipt.json"))
    parser.add_argument("--pytorch-receipt", type=Path)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--n-estimators", type=int, default=200)
    parser.add_argument("--max-depth", type=int, default=5)
    args = parser.parse_args()

    raw, rows, X, domain, operation, needs, budget, lineage = load_dataset(args.dataset)
    train_idx, val_idx = pytorch_random_split_indices(len(rows), args.seed)
    X_train, X_val = X[train_idx], X[val_idx]

    domain_model = classifier(args.device, args.seed, args.n_estimators, args.max_depth)
    operation_model = classifier(args.device, args.seed + 1, args.n_estimators, args.max_depth)
    domain_model.fit(X_train, domain[train_idx])
    operation_model.fit(X_train, operation[train_idx])
    domain_metrics = multiclass_metrics(domain[val_idx], domain_model.predict(X_val))
    operation_metrics = multiclass_metrics(operation[val_idx], operation_model.predict(X_val))

    need_metrics = []
    for target in range(NEED_DIM):
        model = classifier(args.device, args.seed + 10 + target, args.n_estimators, args.max_depth)
        model.fit(X_train, needs[train_idx, target].astype(np.int64))
        proba = model.predict_proba(X_val)
        positive = proba[:, 1] if proba.shape[1] > 1 else np.zeros(len(val_idx), dtype=np.float32)
        need_metrics.append(binary_metrics(needs[val_idx, target].astype(np.int64), positive))

    budget_metrics = []
    for target in range(BUDGET_DIM):
        model = regressor(args.device, args.seed + 30 + target, args.n_estimators, args.max_depth)
        model.fit(X_train, budget[train_idx, target])
        pred = np.clip(model.predict(X_val), 0.0, 1.0)
        budget_metrics.append({"mse": float(mean_squared_error(budget[val_idx, target], pred))})

    dataset_checksum = sha256_bytes(raw)
    receipt: dict[str, Any] = {
        "schema": "atlas.query-router-xgboost-evaluation-receipt.v1",
        "baselineRevision": "atlas.query-router-xgboost-one-model-per-target.v1",
        "datasetPath": str(args.dataset),
        "datasetChecksum": dataset_checksum,
        "rowCount": len(rows),
        "trainCount": int(len(train_idx)),
        "validationCount": int(len(val_idx)),
        "splitRevision": "PYTORCH_RANDOM_SPLIT_RANDPERM_V1",
        "seed": args.seed,
        "inputDimension": INPUT_DIM,
        "device": args.device,
        "xgboostVersion": xgb.__version__,
        "treeMethod": "hist",
        "multiOutputExperimentalFeatureUsed": False,
        "embeddingModelId": MODEL_ID,
        "embeddingModelRevision": lineage["embedding_model_revision"],
        "embeddingPromptRevision": PROMPT_REVISION,
        "embeddingRepresentationId": ROUTER_REPRESENTATION,
        "embeddingSourceRepresentationId": SOURCE_REPRESENTATION,
        "projectionRevision": PROJECTION_REVISION,
        "queryFeatureRevision": QUERY_FEATURE_REVISION,
        "tensorRevision": TENSOR_REVISION,
        "budgetNormalizationRevision": BUDGET_NORMALIZATION_REVISION,
        "labelRevision": lineage["label_revision"],
        "metrics": {
            "domain": domain_metrics,
            "operation": operation_metrics,
            "retrievalNeeds": need_metrics,
            "retrievalNeedsMacroF1": float(np.mean([m["f1"] for m in need_metrics])),
            "retrievalNeedsMeanBrier": float(np.mean([m["brier"] for m in need_metrics])),
            "budget": budget_metrics,
            "budgetMeanMse": float(np.mean([m["mse"] for m in budget_metrics])),
        },
        "pytorchComparison": None,
        "runtimeOwnerChanged": False,
        "evidenceAuthority": False,
        "canonicalWritesAllowed": False,
    }

    if args.pytorch_receipt:
        pytorch = json.loads(args.pytorch_receipt.read_text(encoding="utf-8"))
        for key, expected in (("datasetChecksum", dataset_checksum), ("seed", args.seed), ("rowCount", len(rows)), ("trainCount", len(train_idx)), ("validationCount", len(val_idx))):
            if pytorch.get(key) != expected:
                raise ValueError(f"PyTorch receipt mismatch for {key}: {pytorch.get(key)!r} != {expected!r}")
        pmetrics = pytorch.get("metrics", {})
        receipt["pytorchComparison"] = {
            "receiptPath": str(args.pytorch_receipt),
            "sameDatasetChecksum": True,
            "sameSeed": True,
            "sameSplitCounts": True,
            "domainAccuracyDeltaXgbMinusTorch": domain_metrics["accuracy"] - float(pmetrics.get("domain_accuracy", 0.0)),
            "operationAccuracyDeltaXgbMinusTorch": operation_metrics["accuracy"] - float(pmetrics.get("operation_accuracy", 0.0)),
            "budgetMseDeltaXgbMinusTorch": receipt["metrics"]["budgetMeanMse"] - float(pmetrics.get("budget_mse_per_row", 0.0)) / BUDGET_DIM,
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
