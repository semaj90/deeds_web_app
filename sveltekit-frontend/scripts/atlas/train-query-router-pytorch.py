#!/usr/bin/env python3
"""Train the Parent Atlas query router on frozen feature tensors.

Input JSONL rows must contain:
  query_id: str
  embedding_mrl_128: list[128]  # EmbeddingGemma classification prompt lineage
  query_features: list[26]      # QUERY_FEATURE_ORDER_V1
  domain_label: str
  operation_label: str
  retrieval_needs: list[8]      # [0,1] targets
  budget_targets: list[3]       # normalized [candidate, hops, rerank]

This trainer is intentionally small. It does not encode text and never owns the
EmbeddingGemma model. It consumes frozen numeric features, trains a multi-head
MLP, writes metrics/manifest/checkpoint, and can optionally export ONNX via the
current torch.onnx.export(..., dynamo=True) path.

Train/validation/test membership is derived from SHA-256(query_id) so PyTorch,
XGBoost and static baselines evaluate the exact same rows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

DOMAINS = [
    "code", "database", "retrieval", "graph", "api", "security",
    "documentation", "workflow", "testing", "unknown",
]
OPERATIONS = ["find", "explain", "debug", "modify", "compare", "trace", "test", "synthesize"]
EMBED_DIM = 128
QUERY_FEATURE_DIM = 26
RETRIEVAL_NEED_DIM = 8
BUDGET_DIM = 3
INPUT_DIM = EMBED_DIM + QUERY_FEATURE_DIM
FEATURE_CONTRACT_REVISION = "atlas.query-router-tensor.v1"
MODEL_ARCH_REVISION = "atlas.query-router-mlp.v1"
STABLE_SPLIT_REVISION = "sha256-query-id-80-10-10-v1"


@dataclass
class Row:
    query_id: str
    features: np.ndarray
    domain: int
    operation: int
    needs: np.ndarray
    budget: np.ndarray


class RouterDataset(Dataset):
    def __init__(self, rows: list[Row]):
        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        return (
            torch.from_numpy(row.features),
            torch.tensor(row.domain, dtype=torch.long),
            torch.tensor(row.operation, dtype=torch.long),
            torch.from_numpy(row.needs),
            torch.from_numpy(row.budget),
        )


class QueryRouterMLPV1(nn.Module):
    def __init__(self, input_dim: int = INPUT_DIM, hidden: int = 192, dropout: float = 0.10):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.LayerNorm(input_dim),
            nn.Linear(input_dim, hidden),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden // 2),
            nn.GELU(),
        )
        trunk_dim = hidden // 2
        self.domain = nn.Linear(trunk_dim, len(DOMAINS))
        self.operation = nn.Linear(trunk_dim, len(OPERATIONS))
        self.needs = nn.Linear(trunk_dim, RETRIEVAL_NEED_DIM)
        self.budget = nn.Linear(trunk_dim, BUDGET_DIM)

    def forward(self, x: torch.Tensor):
        h = self.trunk(x)
        return self.domain(h), self.operation(h), self.needs(h), self.budget(h)


class OnnxWrapper(nn.Module):
    def __init__(self, model: QueryRouterMLPV1):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor):
        domain_logits, operation_logits, needs_logits, budget_logits = self.model(x)
        return (
            torch.softmax(domain_logits, dim=-1),
            torch.softmax(operation_logits, dim=-1),
            torch.sigmoid(needs_logits),
            torch.sigmoid(budget_logits),
        )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_split(query_id: str) -> str:
    bucket = int(hashlib.sha256(query_id.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def load_rows(path: Path) -> tuple[list[Row], str]:
    raw = path.read_bytes()
    rows: list[Row] = []
    for lineno, line in enumerate(raw.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        item = json.loads(line)
        emb = np.asarray(item["embedding_mrl_128"], dtype=np.float32)
        qf = np.asarray(item["query_features"], dtype=np.float32)
        needs = np.asarray(item["retrieval_needs"], dtype=np.float32)
        budget = np.asarray(item["budget_targets"], dtype=np.float32)
        if emb.shape != (EMBED_DIM,):
            raise ValueError(f"line {lineno}: embedding_mrl_128 must be 128d")
        if qf.shape != (QUERY_FEATURE_DIM,):
            raise ValueError(f"line {lineno}: query_features must be {QUERY_FEATURE_DIM}d")
        if needs.shape != (RETRIEVAL_NEED_DIM,) or np.any(needs < 0) or np.any(needs > 1):
            raise ValueError(f"line {lineno}: retrieval_needs must be {RETRIEVAL_NEED_DIM} values in [0,1]")
        if budget.shape != (BUDGET_DIM,) or np.any(budget < 0) or np.any(budget > 1):
            raise ValueError(f"line {lineno}: budget_targets must be {BUDGET_DIM} normalized values in [0,1]")
        if not np.isfinite(emb).all() or not np.isfinite(qf).all():
            raise ValueError(f"line {lineno}: non-finite features")
        domain_label = str(item["domain_label"])
        operation_label = str(item["operation_label"])
        if domain_label not in DOMAINS:
            raise ValueError(f"line {lineno}: unknown domain_label {domain_label}")
        if operation_label not in OPERATIONS:
            raise ValueError(f"line {lineno}: unknown operation_label {operation_label}")
        features = np.concatenate([emb, qf]).astype(np.float32, copy=False)
        rows.append(Row(
            query_id=str(item["query_id"]),
            features=features,
            domain=DOMAINS.index(domain_label),
            operation=OPERATIONS.index(operation_label),
            needs=needs,
            budget=budget,
        ))
    if len(rows) < 30:
        raise ValueError("at least 30 training rows are required for stable train/validation/test splits")
    return rows, sha256_bytes(raw)


def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def rows_for_split(rows: list[Row], split: str) -> list[Row]:
    selected = [row for row in rows if stable_split(row.query_id) == split]
    if not selected:
        raise ValueError(f"stable split {split!r} is empty")
    return selected


def evaluate(model: QueryRouterMLPV1, loader: DataLoader, device: torch.device) -> dict[str, float]:
    model.eval()
    totals = {"domain_correct": 0, "operation_correct": 0, "count": 0, "needs_bce": 0.0, "budget_mse": 0.0}
    bce = nn.BCEWithLogitsLoss(reduction="sum")
    mse = nn.MSELoss(reduction="sum")
    with torch.no_grad():
        for x, domain, operation, needs, budget in loader:
            x, domain, operation, needs, budget = [v.to(device) for v in (x, domain, operation, needs, budget)]
            dlog, olog, nlog, blog = model(x)
            totals["domain_correct"] += int((dlog.argmax(-1) == domain).sum().item())
            totals["operation_correct"] += int((olog.argmax(-1) == operation).sum().item())
            totals["count"] += int(x.shape[0])
            totals["needs_bce"] += float(bce(nlog, needs).item())
            totals["budget_mse"] += float(mse(torch.sigmoid(blog), budget).item())
    count = max(1, totals["count"])
    return {
        "domain_accuracy": totals["domain_correct"] / count,
        "operation_accuracy": totals["operation_correct"] / count,
        "retrieval_needs_bce_per_row": totals["needs_bce"] / count,
        "budget_mse_per_row": totals["budget_mse"] / count,
    }


def write_predictions(model: QueryRouterMLPV1, rows: list[Row], path: Path) -> None:
    model.eval()
    lines: list[str] = []
    with torch.no_grad():
        for row in rows:
            x = torch.from_numpy(row.features).unsqueeze(0)
            dlog, olog, nlog, blog = model(x)
            lines.append(json.dumps({
                "query_id": row.query_id,
                "domain_probabilities": torch.softmax(dlog, dim=-1)[0].tolist(),
                "operation_probabilities": torch.softmax(olog, dim=-1)[0].tolist(),
                "retrieval_need_probabilities": torch.sigmoid(nlog)[0].tolist(),
                "budget_predictions": torch.sigmoid(blog)[0].tolist(),
            }, sort_keys=True))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("classifier-models/query-router-v1"))
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--export-onnx", action="store_true")
    args = parser.parse_args()

    set_seed(args.seed)
    rows, dataset_checksum = load_rows(args.dataset)
    train_rows = rows_for_split(rows, "train")
    validation_rows = rows_for_split(rows, "validation")
    test_rows = rows_for_split(rows, "test")
    train_ds = RouterDataset(train_rows)
    validation_ds = RouterDataset(validation_rows)
    test_ds = RouterDataset(test_rows)
    generator = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation_ds, batch_size=args.batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False)

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but torch.cuda.is_available() is false")
    device = torch.device("cuda" if (args.device == "cuda" or (args.device == "auto" and torch.cuda.is_available())) else "cpu")

    model = QueryRouterMLPV1().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    domain_loss = nn.CrossEntropyLoss()
    operation_loss = nn.CrossEntropyLoss()
    needs_loss = nn.BCEWithLogitsLoss()
    budget_loss = nn.MSELoss()

    best_state: dict[str, torch.Tensor] | None = None
    best_score = -math.inf
    history: list[dict[str, Any]] = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        loss_sum = 0.0
        rows_seen = 0
        for x, domain, operation, needs, budget in train_loader:
            x, domain, operation, needs, budget = [v.to(device) for v in (x, domain, operation, needs, budget)]
            optimizer.zero_grad(set_to_none=True)
            dlog, olog, nlog, blog = model(x)
            loss = (
                domain_loss(dlog, domain)
                + operation_loss(olog, operation)
                + 0.75 * needs_loss(nlog, needs)
                + 0.25 * budget_loss(torch.sigmoid(blog), budget)
            )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            loss_sum += float(loss.item()) * x.shape[0]
            rows_seen += int(x.shape[0])

        metrics = evaluate(model, validation_loader, device)
        score = metrics["domain_accuracy"] + metrics["operation_accuracy"] - 0.1 * metrics["retrieval_needs_bce_per_row"]
        history.append({"epoch": epoch, "train_loss": loss_sum / max(1, rows_seen), **metrics})
        if score > best_score:
            best_score = score
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    if best_state is None:
        raise RuntimeError("training produced no checkpoint")
    model.load_state_dict(best_state)
    model.to("cpu").eval()
    validation_metrics = evaluate(model, validation_loader, torch.device("cpu"))
    test_metrics = evaluate(model, test_loader, torch.device("cpu"))

    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "query-router-v1.pt"
    torch.save({"state_dict": model.state_dict(), "domains": DOMAINS, "operations": OPERATIONS}, checkpoint_path)
    checkpoint_digest = sha256_bytes(checkpoint_path.read_bytes())
    prediction_path = args.output_dir / "test-predictions.jsonl"
    write_predictions(model, test_rows, prediction_path)

    manifest = {
        "schema": "atlas.query-router-training-receipt.v1",
        "modelArchitectureRevision": MODEL_ARCH_REVISION,
        "featureContractRevision": FEATURE_CONTRACT_REVISION,
        "embeddingModelId": "google/embeddinggemma-300m",
        "embeddingRepresentationId": "classification_mrl_128",
        "embeddingSourceRepresentationId": "classification_768",
        "inputDimension": INPUT_DIM,
        "embeddingDimension": EMBED_DIM,
        "queryFeatureDimension": QUERY_FEATURE_DIM,
        "datasetPath": str(args.dataset),
        "datasetChecksum": dataset_checksum,
        "rowCount": len(rows),
        "splitRevision": STABLE_SPLIT_REVISION,
        "trainCount": len(train_rows),
        "validationCount": len(validation_rows),
        "testCount": len(test_rows),
        "seed": args.seed,
        "optimizer": "AdamW",
        "epochs": args.epochs,
        "batchSize": args.batch_size,
        "learningRate": args.lr,
        "weightDecay": args.weight_decay,
        "trainingDevice": str(device),
        "domains": DOMAINS,
        "operations": OPERATIONS,
        "validationMetrics": validation_metrics,
        "testMetrics": test_metrics,
        "checkpoint": str(checkpoint_path),
        "checkpointSha256": checkpoint_digest,
        "testPredictions": str(prediction_path),
        "evidenceAuthority": False,
        "canonicalOwnerChanged": False,
    }

    if args.export_onnx:
        onnx_path = args.output_dir / "query-router-v1.onnx"
        sample = torch.zeros((1, INPUT_DIM), dtype=torch.float32)
        onnx_program = torch.onnx.export(
            OnnxWrapper(model),
            (sample,),
            dynamo=True,
            input_names=["features"],
            output_names=["domain_probabilities", "operation_probabilities", "retrieval_needs", "budget"],
            dynamic_shapes=({0: torch.export.Dim("batch")},),
        )
        onnx_program.save(str(onnx_path))
        manifest["onnx"] = {"path": str(onnx_path), "sha256": sha256_bytes(onnx_path.read_bytes()), "exporter": "torch.onnx.export(dynamo=True)"}

    (args.output_dir / "training-receipt.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "history.json").write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
