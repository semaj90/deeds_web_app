#!/usr/bin/env python3
"""Compare Parent Atlas query-router predictions on an identical frozen test split.

Inputs are the frozen dataset plus one or more prediction JSONL files emitted by
train-query-router-pytorch.py / train-query-router-xgboost.py. The evaluator
fails closed when prediction query IDs do not exactly match the stable test set.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import brier_score_loss, f1_score, roc_auc_score

DOMAINS = [
    "code", "database", "retrieval", "graph", "api", "security",
    "documentation", "workflow", "testing", "unknown",
]
OPERATIONS = ["find", "explain", "debug", "modify", "compare", "trace", "test", "synthesize"]
NEED_NAMES = [
    "lexicalExact", "sparseContextual", "sparseExpansion", "semantic",
    "ast", "graph", "exactSymbol", "mutationFreshness",
]


def stable_split(query_id: str) -> str:
    bucket = int(hashlib.sha256(query_id.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{lineno}: invalid JSON: {exc}") from exc
    return rows


def load_truth(path: Path) -> dict[str, dict[str, Any]]:
    truth = {}
    for row in read_jsonl(path):
        query_id = str(row["query_id"])
        if stable_split(query_id) != "test":
            continue
        if query_id in truth:
            raise ValueError(f"duplicate test query_id in dataset: {query_id}")
        truth[query_id] = row
    if not truth:
        raise ValueError("stable test split is empty")
    return truth


def load_predictions(path: Path, expected_ids: set[str]) -> dict[str, dict[str, Any]]:
    predictions = {}
    for row in read_jsonl(path):
        query_id = str(row["query_id"])
        if query_id in predictions:
            raise ValueError(f"duplicate query_id in {path}: {query_id}")
        predictions[query_id] = row
    actual = set(predictions)
    if actual != expected_ids:
        missing = sorted(expected_ids - actual)[:10]
        extra = sorted(actual - expected_ids)[:10]
        raise ValueError(f"prediction/test ID mismatch for {path}; missing={missing} extra={extra}")
    return predictions


def ece_binary(y_true: np.ndarray, prob: np.ndarray, bins: int = 10) -> float:
    total = len(y_true)
    if total == 0:
        return 0.0
    result = 0.0
    edges = np.linspace(0.0, 1.0, bins + 1)
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (prob >= lo) & (prob <= hi if i == bins - 1 else prob < hi)
        count = int(mask.sum())
        if count == 0:
            continue
        confidence = float(prob[mask].mean())
        accuracy = float(y_true[mask].mean())
        result += (count / total) * abs(confidence - accuracy)
    return result


def multiclass_ece(labels: np.ndarray, probs: np.ndarray, bins: int = 10) -> float:
    confidence = probs.max(axis=1)
    predicted = probs.argmax(axis=1)
    correct = (predicted == labels).astype(np.float32)
    return ece_binary(correct, confidence, bins)


def safe_auc(y_true: np.ndarray, prob: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, prob))


def evaluate_model(truth: dict[str, dict[str, Any]], pred: dict[str, dict[str, Any]]) -> dict[str, Any]:
    ids = sorted(truth)
    domain_true = np.asarray([DOMAINS.index(str(truth[q]["domain_label"])) for q in ids], dtype=np.int64)
    operation_true = np.asarray([OPERATIONS.index(str(truth[q]["operation_label"])) for q in ids], dtype=np.int64)
    needs_true = np.asarray([truth[q]["retrieval_needs"] for q in ids], dtype=np.float32)
    budget_true = np.asarray([truth[q]["budget_targets"] for q in ids], dtype=np.float32)

    domain_prob = np.asarray([pred[q]["domain_probabilities"] for q in ids], dtype=np.float32)
    operation_prob = np.asarray([pred[q]["operation_probabilities"] for q in ids], dtype=np.float32)
    needs_prob = np.asarray([pred[q]["retrieval_need_probabilities"] for q in ids], dtype=np.float32)
    budget_pred = np.asarray([pred[q]["budget_predictions"] for q in ids], dtype=np.float32)

    if domain_prob.shape != (len(ids), len(DOMAINS)):
        raise ValueError(f"domain probability shape mismatch: {domain_prob.shape}")
    if operation_prob.shape != (len(ids), len(OPERATIONS)):
        raise ValueError(f"operation probability shape mismatch: {operation_prob.shape}")
    if needs_prob.shape != (len(ids), len(NEED_NAMES)):
        raise ValueError(f"retrieval need probability shape mismatch: {needs_prob.shape}")
    if budget_pred.shape != (len(ids), 3):
        raise ValueError(f"budget prediction shape mismatch: {budget_pred.shape}")
    for name, values in [("domain", domain_prob), ("operation", operation_prob), ("needs", needs_prob), ("budget", budget_pred)]:
        if not np.isfinite(values).all():
            raise ValueError(f"{name} predictions contain non-finite values")

    need_metrics = {}
    for index, name in enumerate(NEED_NAMES):
        y = needs_true[:, index].astype(np.int64)
        p = np.clip(needs_prob[:, index], 0, 1)
        need_metrics[name] = {
            "f1": float(f1_score(y, (p >= 0.5).astype(np.int64), zero_division=0)),
            "auroc": safe_auc(y, p),
            "brier": float(brier_score_loss(y, p)),
            "ece": float(ece_binary(y.astype(np.float32), p)),
        }

    return {
        "rowCount": len(ids),
        "domainMacroF1": float(f1_score(domain_true, domain_prob.argmax(axis=1), average="macro", zero_division=0)),
        "operationMacroF1": float(f1_score(operation_true, operation_prob.argmax(axis=1), average="macro", zero_division=0)),
        "domainEce": float(multiclass_ece(domain_true, domain_prob)),
        "operationEce": float(multiclass_ece(operation_true, operation_prob)),
        "retrievalNeeds": need_metrics,
        "retrievalNeedMacroF1": float(np.mean([metric["f1"] for metric in need_metrics.values()])),
        "retrievalNeedMeanBrier": float(np.mean([metric["brier"] for metric in need_metrics.values()])),
        "retrievalNeedMeanEce": float(np.mean([metric["ece"] for metric in need_metrics.values()])),
        "budgetMse": float(np.mean((np.clip(budget_pred, 0, 1) - budget_true) ** 2)),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--prediction", action="append", required=True, help="NAME=path/to/test-predictions.jsonl")
    parser.add_argument("--output", type=Path, default=Path("classifier-models/query-router-evaluation.json"))
    args = parser.parse_args()

    truth = load_truth(args.dataset)
    expected_ids = set(truth)
    results = {}
    for item in args.prediction:
        if "=" not in item:
            raise ValueError("--prediction must be NAME=PATH")
        name, value = item.split("=", 1)
        name = name.strip()
        if not name or name in results:
            raise ValueError(f"invalid/duplicate model name: {name!r}")
        predictions = load_predictions(Path(value), expected_ids)
        results[name] = evaluate_model(truth, predictions)

    report = {
        "schema": "atlas.query-router-same-corpus-evaluation.v1",
        "dataset": str(args.dataset),
        "datasetSha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
        "splitRevision": "sha256-query-id-80-10-10-v1",
        "testRowCount": len(truth),
        "models": results,
        "promotionDecision": "NOT_AUTOMATIC",
        "evidenceAuthority": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
