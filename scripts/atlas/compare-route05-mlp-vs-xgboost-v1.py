"""ROUTE-04 / ROUTE-05: PyTorch MLP vs XGBoost comparison on the identical frozen split/tensor.

Consumes `docs/reports/doc14-xgboost-features-v1.csv` (derived from live embeddinggemma2:q8_0,
NetworkX PageRank, and OAKLib concepts), runs deterministic train/held-out evaluation for
PyTorch MLP (`Linear(5->16->1)+Sigmoid`) and XGBoost on the exact same split, and writes
`docs/reports/route05-mlp-vs-xgboost-comparison-v1.json` (`canonicalAuthority=False`).
"""

from __future__ import annotations

import csv
import hashlib
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import xgboost as xgb

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "docs" / "reports" / "doc14-xgboost-features-v1.csv"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "route05-mlp-vs-xgboost-comparison-v1.json"


def _dcg_at_k(relevances: np.ndarray, k: int) -> float:
    rel = relevances[:k]
    if rel.size == 0:
        return 0.0
    discounts = np.log2(np.arange(2, rel.size + 2))
    return float(np.sum(rel / discounts))


def _ndcg_at_k(y_true: np.ndarray, y_pred: np.ndarray, k: int = 5) -> float:
    order_pred = np.argsort(-y_pred)
    order_ideal = np.argsort(-y_true)
    ideal = _dcg_at_k(y_true[order_ideal], k)
    if ideal <= 0.0:
        return 0.0
    return float(_dcg_at_k(y_true[order_pred], k) / ideal)


def run_frozen_mlp_vs_xgboost_v1(
    features: np.ndarray,
    targets: np.ndarray,
    *,
    seed: int = 42,
    epochs: int = 60,
) -> dict[str, Any]:
    """Train and evaluate PyTorch MLP and XGBoost on the identical frozen split."""
    x = np.asarray(features, dtype=np.float32)
    y = np.asarray(targets, dtype=np.float32).reshape(-1)
    if x.ndim != 2 or x.shape[0] < 6:
        raise ValueError("FROZEN_SPLIT_REQUIRES_AT_LEAST_6_ROWS")

    split_idx = max(4, int(round(x.shape[0] * 0.7)))
    x_train, x_eval = x[:split_idx], x[split_idx:]
    y_train, y_eval = y[:split_idx], y[split_idx:]

    tensor_checksum = f"sha256:{hashlib.sha256(x.tobytes()).hexdigest()}"

    # 1. PyTorch MLP (ROUTE-04)
    torch.manual_seed(seed)
    t0 = time.perf_counter()
    model = nn.Sequential(
        nn.Linear(x.shape[1], 16),
        nn.ReLU(),
        nn.Linear(16, 1),
        nn.Sigmoid(),
    )
    opt = torch.optim.Adam(model.parameters(), lr=0.02)
    loss_fn = nn.MSELoss()
    tx_tr = torch.from_numpy(x_train)
    ty_tr = torch.from_numpy(y_train).unsqueeze(1)
    for _ in range(epochs):
        opt.zero_grad()
        pred = model(tx_tr)
        loss = loss_fn(pred, ty_tr)
        loss.backward()
        opt.step()
    with torch.no_grad():
        mlp_pred = model(torch.from_numpy(x_eval)).squeeze(1).numpy()
    mlp_ms = round((time.perf_counter() - t0) * 1000.0, 3)

    # 2. XGBoost (ROUTE-05) on the identical frozen split
    t1 = time.perf_counter()
    xgb_reg = xgb.XGBRegressor(
        n_estimators=24,
        max_depth=3,
        learning_rate=0.15,
        random_state=seed,
        n_jobs=1,
    )
    xgb_reg.fit(x_train, y_train)
    xgb_pred = xgb_reg.predict(x_eval).astype(np.float32)
    xgb_ms = round((time.perf_counter() - t1) * 1000.0, 3)

    return {
        "schema": "atlas.route05-mlp-vs-xgboost.v1",
        "frozenTensorChecksum": tensor_checksum,
        "trainRows": int(x_train.shape[0]),
        "evalRows": int(x_eval.shape[0]),
        "pytorchMlp": {
            "evalMse": round(float(np.mean((mlp_pred - y_eval) ** 2)), 6),
            "evalNdcg5": round(_ndcg_at_k(y_eval, mlp_pred, k=min(5, len(y_eval))), 6),
            "elapsedMs": mlp_ms,
        },
        "xgboost": {
            "evalMse": round(float(np.mean((xgb_pred - y_eval) ** 2)), 6),
            "evalNdcg5": round(_ndcg_at_k(y_eval, xgb_pred, k=min(5, len(y_eval))), 6),
            "elapsedMs": xgb_ms,
        },
        "identicalFrozenSplit": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    rows: list[list[float]] = []
    targets: list[float] = []
    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            targets.append(float(r["observable_reward"]))
            rows.append([
                float(r["cosine_similarity"]),
                float(r["pagerank_prior"]),
                float(r["concept_overlap_jaccard"]),
                float(r["relation_degree_norm"]),
                float(r["chunk_char_len_norm"]),
            ])

    res = run_frozen_mlp_vs_xgboost_v1(np.asarray(rows, dtype=np.float32), np.asarray(targets, dtype=np.float32))
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**res, "reportPath": str(REPORT_PATH)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
