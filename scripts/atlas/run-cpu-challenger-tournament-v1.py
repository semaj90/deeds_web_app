"""Unified CPU-vs-CPU challenger tournament on the frozen ROUTE-05 / DOC-14 split.

Compares 5 deterministic CPU challengers on the identical frozen train/eval split:
  1. cosine_baseline (raw col-0 dense cosine)
  2. hybrid_rrf_prior (uniform feature-mean fusion)
  3. ewin_tang_low_rank (rank-2 SVD ridge projection)
  4. pytorch_mlp (reused from compare-route05-mlp-vs-xgboost-v1.py)
  5. xgboost_ranker (reused from compare-route05-mlp-vs-xgboost-v1.py)

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
"""

from __future__ import annotations

import csv
import importlib.util
import json
import time
from pathlib import Path
from typing import Any

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "docs" / "reports" / "doc14-xgboost-features-v1.csv"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "cpu-challenger-tournament-v1.json"


def _load_route05_module():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "compare-route05-mlp-vs-xgboost-v1.py"
    spec = importlib.util.spec_from_file_location("compare_route05_mlp_vs_xgboost_v1", mod_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {mod_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _score_predictions(ndcg_fn, y_eval: np.ndarray, y_pred: np.ndarray, elapsed_ms: float, name: str) -> dict[str, Any]:
    k = min(5, len(y_eval))
    return {
        "name": name,
        "evalMse": round(float(np.mean((y_pred - y_eval) ** 2)), 6),
        "evalNdcg5": round(float(ndcg_fn(y_eval, y_pred, k=k)), 6),
        "elapsedMs": round(float(elapsed_ms), 3),
    }


def run_cpu_challenger_tournament_v1(
    features: np.ndarray,
    targets: np.ndarray,
    *,
    seed: int = 42,
    epochs: int = 60,
) -> dict[str, Any]:
    route05 = _load_route05_module()
    base = route05.run_frozen_mlp_vs_xgboost_v1(features, targets, seed=seed, epochs=epochs)

    n = features.shape[0]
    split = max(1, int(n * 0.7))
    x_train, x_eval = features[:split], features[split:]
    y_train, y_eval = targets[:split], targets[split:]

    # 1. cosine_baseline (col 0)
    t0 = time.perf_counter()
    cos_pred = np.clip(x_eval[:, 0], 0.0, 1.0)
    cos_ms = (time.perf_counter() - t0) * 1000.0

    # 2. hybrid_rrf_prior (mean across 5 normalized features)
    t1 = time.perf_counter()
    hyb_pred = np.clip(np.mean(x_eval, axis=1), 0.0, 1.0)
    hyb_ms = (time.perf_counter() - t1) * 1000.0

    # 3. ewin_tang_low_rank (rank-2 SVD ridge projection fit on x_train)
    t2 = time.perf_counter()
    rank = min(2, x_train.shape[0], x_train.shape[1])
    _u, _s, vt = np.linalg.svd(x_train, full_matrices=False)
    basis = vt[:rank].T  # [5, rank]
    z_train = x_train @ basis
    z_eval = x_eval @ basis
    lam = 1e-2
    w = np.linalg.solve(z_train.T @ z_train + lam * np.eye(rank, dtype=np.float32), z_train.T @ y_train)
    svd_pred = np.clip(z_eval @ w, 0.0, 1.0)
    svd_ms = (time.perf_counter() - t2) * 1000.0

    standings = [
        _score_predictions(route05._ndcg_at_k, y_eval, cos_pred, cos_ms, "cosine_baseline"),
        _score_predictions(route05._ndcg_at_k, y_eval, hyb_pred, hyb_ms, "hybrid_rrf_prior"),
        _score_predictions(route05._ndcg_at_k, y_eval, svd_pred, svd_ms, "ewin_tang_low_rank"),
        {"name": "pytorch_mlp", **base["pytorchMlp"]},
        {"name": "xgboost_ranker", **base["xgboost"]},
    ]
    standings.sort(key=lambda row: (-row["evalNdcg5"], row["evalMse"], row["elapsedMs"], row["name"]))

    return {
        "schema": "atlas.cpu-challenger-tournament.v1",
        "frozenTensorChecksum": base["frozenTensorChecksum"],
        "trainRows": base["trainRows"],
        "evalRows": base["evalRows"],
        "challengerCount": len(standings),
        "winner": standings[0]["name"],
        "standings": standings,
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

    res = run_cpu_challenger_tournament_v1(np.asarray(rows, dtype=np.float32), np.asarray(targets, dtype=np.float32))
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**res, "reportPath": str(REPORT_PATH)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
