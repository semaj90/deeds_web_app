#!/usr/bin/env python3
"""
train-xgboost-reranker.py

Trains an XGBoost (or LightGBM) reranker from the feature CSV produced by
export-xgboost-features.mjs. Outputs a model file and evaluation metrics.

Pipeline:
  1. Load docs/reports/xgboost-features.csv
  2. Stratified train/val split (80/20) by trace_id (prevent leakage)
  3. Train XGBoostRanker (objective=rank:pairwise) OR XGBRegressor (reg:squarederror)
  4. Evaluate NDCG@10 + MRR on held-out traces
  5. Save model to models/xgboost-reranker.ubj (binary) + feature importance JSON
  6. Write docs/reports/xgboost-training-report.json

Gate: NDCG@10 >= 0.70 (promotion threshold for Stage 4 cascade integration)

Usage:
    python scripts/atlas/train-xgboost-reranker.py
    python scripts/atlas/train-xgboost-reranker.py --objective=reg:squarederror
    python scripts/atlas/train-xgboost-reranker.py --lightgbm   # use LightGBM instead
    python scripts/atlas/train-xgboost-reranker.py --dry-run     # validate CSV only
"""

import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent.parent

CSV_PATH    = ROOT / 'docs' / 'reports' / 'xgboost-features.csv'
MODEL_DIR   = ROOT / 'models'
REPORT_DIR  = ROOT / 'docs' / 'reports'
MODEL_PATH  = MODEL_DIR / 'xgboost-reranker.ubj'
LGB_PATH    = MODEL_DIR / 'lgbm-reranker.txt'
REPORT_PATH = REPORT_DIR / 'xgboost-training-report.json'

FEATURE_COLS = [
    # Retrieval signals (all tabular, tree-splittable)
    'cosine_score',       # Qdrant ANN cosine [0,1]
    'bm25_rank_norm',     # BM25 rank position norm [0,1]
    'ann_turbovec_score', # TurboVec scalar rerank [0,1]
    'concept_overlap',    # Jaccard(query_concepts, packet_concepts) [0,1]
    'same_feature',       # binary: feature_id match
    'community_conf',     # community_confidence [0,1]
    'reward_prior',       # reward_prior / 10, clamped [0,1]
    'domain_class_match', # binary / partial: domain alignment
    'freshness_score',    # age-decay [0.1, 1.0]
    'pagerank_score',     # Karpathy blend score [0,1]
    # SOM cache hit is a plain binary signal — valid for tree splits
    # NOTE: som_cell_id (int 0–399) is NOT included — tree splits on topology
    #       indices produce arbitrary cuts across the SOM grid with no semantic
    #       meaning. SOM cell routing belongs in the PyTorch policy (Stage 5).
    'som_cache_hit',      # binary: SOM cell was a Redis cache hit [0,1]
    'provenance_git_age', # (now - git_mtime) / 365, clamped [0,1]
    # Trace context
    'packet_hit_count', 'n_retrieved', 'n_concepts', 'trace_score',
]
LABEL_COL = 'label'
ID_COL    = 'trace_id'


def ndcg_at_k(relevances: list[float], k: int = 10) -> float:
    """Compute NDCG@k for a single query's result list."""
    dcg = sum(
        (2 ** rel - 1) / math.log2(i + 2)
        for i, rel in enumerate(relevances[:k])
    )
    ideal = sorted(relevances, reverse=True)[:k]
    idcg = sum(
        (2 ** rel - 1) / math.log2(i + 2)
        for i, rel in enumerate(ideal)
    )
    return dcg / idcg if idcg > 0 else 0.0


def mrr_at_k(relevances: list[float], k: int = 10) -> float:
    """Compute MRR@k — reciprocal rank of the first relevant result."""
    for i, rel in enumerate(relevances[:k]):
        if rel > 0:
            return 1.0 / (i + 1)
    return 0.0


def load_csv(path: Path):
    """Load the feature CSV into lists of dicts."""
    import csv
    rows = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    print(f'Loaded {len(rows):,} rows from {path}')
    return rows


def build_arrays(rows: list[dict]):
    """Convert CSV rows to numpy arrays. Returns X, y, groups (trace_ids)."""
    import numpy as np

    X_list, y_list, groups = [], [], []
    for row in rows:
        try:
            x = [float(row.get(c, 0) or 0) for c in FEATURE_COLS]
            y = float(row.get(LABEL_COL, 0) or 0)
        except (ValueError, TypeError):
            continue
        X_list.append(x)
        y_list.append(y)
        groups.append(row.get(ID_COL, ''))

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)
    return X, y, groups


def train_val_split(X, y, groups: list[str], val_ratio: float = 0.2, seed: int = 42):
    """Split by trace_id to prevent data leakage between train and val."""
    import numpy as np

    unique_traces = list(set(groups))
    rng = np.random.default_rng(seed)
    rng.shuffle(unique_traces)
    n_val  = max(1, int(len(unique_traces) * val_ratio))
    val_traces  = set(unique_traces[:n_val])
    train_traces = set(unique_traces[n_val:])

    train_idx = [i for i, g in enumerate(groups) if g in train_traces]
    val_idx   = [i for i, g in enumerate(groups) if g in val_traces]

    return (X[train_idx], y[train_idx], [groups[i] for i in train_idx],
            X[val_idx],   y[val_idx],   [groups[i] for i in val_idx])


def evaluate_ndcg(model, X_val, y_val, val_groups: list[str], k: int = 10, use_lgbm: bool = False):
    """Group val rows by trace_id, rank by predicted score, compute NDCG@k and MRR@k."""
    preds = model.predict(X_val)

    # Group by trace_id
    trace_data: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for i, trace_id in enumerate(val_groups):
        trace_data[trace_id].append((float(preds[i]), float(y_val[i])))

    ndcgs, mrrs = [], []
    for rows_t in trace_data.values():
        rows_sorted = sorted(rows_t, key=lambda x: x[0], reverse=True)
        relevances  = [r[1] for r in rows_sorted]
        ndcgs.append(ndcg_at_k(relevances, k))
        mrrs.append(mrr_at_k(relevances, k))

    avg_ndcg = sum(ndcgs) / len(ndcgs) if ndcgs else 0.0
    avg_mrr  = sum(mrrs)  / len(mrrs)  if mrrs  else 0.0
    return avg_ndcg, avg_mrr, len(ndcgs)


def train_xgboost(X_train, y_train, X_val, y_val, objective: str):
    try:
        import xgboost as xgb
    except ImportError:
        print('ERROR: xgboost not installed. Run: pip install xgboost')
        sys.exit(1)

    print(f'\nTraining XGBoost ({objective}) — {X_train.shape[0]:,} train rows, {X_val.shape[0]:,} val rows')

    params = {
        'objective':        objective,
        'learning_rate':    0.05,
        'max_depth':        6,
        'n_estimators':     300,
        'subsample':        0.8,
        'colsample_bytree': 0.8,
        'min_child_weight': 5,
        'reg_alpha':        0.1,
        'reg_lambda':       1.0,
        'tree_method':      'hist',
        'device':           'cuda',  # falls back to cpu if no CUDA
        'eval_metric':      'rmse',
        'verbosity':        0,
    }

    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=FEATURE_COLS)
    dval   = xgb.DMatrix(X_val,   label=y_val,   feature_names=FEATURE_COLS)

    evals_result: dict = {}
    booster = xgb.train(
        params,
        dtrain,
        num_boost_round=params['n_estimators'],
        evals=[(dtrain, 'train'), (dval, 'val')],
        early_stopping_rounds=30,
        evals_result=evals_result,
        verbose_eval=50,
    )

    # Wrap in sklearn API for evaluate_ndcg compatibility
    class BoosterWrapper:
        def __init__(self, b): self.b = b
        def predict(self, X):
            import xgboost as xgb
            return self.b.predict(xgb.DMatrix(X, feature_names=FEATURE_COLS))

    wrapper = BoosterWrapper(booster)
    importance = booster.get_score(importance_type='gain')
    return wrapper, booster, importance, evals_result


def train_lightgbm(X_train, y_train, X_val, y_val):
    try:
        import lightgbm as lgb
    except ImportError:
        print('ERROR: lightgbm not installed. Run: pip install lightgbm')
        sys.exit(1)

    print(f'\nTraining LightGBM — {X_train.shape[0]:,} train rows, {X_val.shape[0]:,} val rows')

    dtrain = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_COLS)
    dval   = lgb.Dataset(X_val,   label=y_val,   feature_name=FEATURE_COLS, reference=dtrain)

    params = {
        'objective':      'regression',
        'metric':         'rmse',
        'learning_rate':  0.05,
        'num_leaves':     63,
        'max_depth':      -1,
        'min_data_in_leaf': 20,
        'feature_fraction': 0.8,
        'bagging_fraction': 0.8,
        'bagging_freq':   5,
        'lambda_l1':      0.1,
        'lambda_l2':      1.0,
        'verbose':        -1,
        'device_type':    'gpu',   # falls back to cpu
    }

    callbacks = [lgb.early_stopping(30, verbose=False), lgb.log_evaluation(50)]
    model = lgb.train(params, dtrain, num_boost_round=300,
                      valid_sets=[dtrain, dval], callbacks=callbacks)

    importance = dict(zip(FEATURE_COLS, model.feature_importance(importance_type='gain').tolist()))
    return model, importance


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--objective',  default='reg:squarederror',
                        choices=['reg:squarederror', 'rank:pairwise', 'rank:ndcg'])
    parser.add_argument('--lightgbm',   action='store_true', help='Use LightGBM instead of XGBoost')
    parser.add_argument('--dry-run',    action='store_true', help='Validate CSV only, no training')
    parser.add_argument('--ndcg-gate',  type=float, default=0.70, help='Min NDCG@10 to pass gate')
    args = parser.parse_args()

    print(f'\n═══ XGBoost/LightGBM Reranker Training ═══\n')
    print(f'CSV:       {CSV_PATH}')
    print(f'Mode:      {"LightGBM" if args.lightgbm else f"XGBoost ({args.objective})"}')
    print(f'Gate:      NDCG@10 >= {args.ndcg_gate}')

    if not CSV_PATH.exists():
        print(f'ERROR: {CSV_PATH} not found. Run: npm run atlas:xgboost:export')
        sys.exit(1)

    rows = load_csv(CSV_PATH)
    X, y, groups = build_arrays(rows)

    print(f'Feature matrix: {X.shape[0]:,} × {X.shape[1]} | label range [{y.min():.3f}, {y.max():.3f}]')
    print(f'Positive labels (>0): {(y > 0).sum():,} ({100*(y>0).mean():.1f}%)')
    print(f'Unique trace IDs:     {len(set(groups)):,}')

    if args.dry_run:
        print('\n(dry-run — validation only, no training)')
        print('✅ CSV is valid and loadable')
        return

    # Check dependencies
    try:
        import numpy  # noqa
    except ImportError:
        print('ERROR: numpy not installed. Run: pip install numpy xgboost lightgbm')
        sys.exit(1)

    X_train, y_train, groups_train, X_val, y_val, groups_val = train_val_split(X, y, groups)
    print(f'\nTrain: {X_train.shape[0]:,} rows ({len(set(groups_train))} traces)')
    print(f'Val:   {X_val.shape[0]:,} rows ({len(set(groups_val))} traces)')

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    if args.lightgbm:
        model, importance = train_lightgbm(X_train, y_train, X_val, y_val)
        model.save_model(str(LGB_PATH))
        print(f'\nModel saved: {LGB_PATH}')
        model_path_str = str(LGB_PATH)
    else:
        wrapper, booster, importance, evals = train_xgboost(
            X_train, y_train, X_val, y_val, args.objective
        )
        booster.save_model(str(MODEL_PATH))
        print(f'\nModel saved: {MODEL_PATH}')
        model     = wrapper
        model_path_str = str(MODEL_PATH)

    # Evaluate
    avg_ndcg, avg_mrr, n_traces = evaluate_ndcg(model, X_val, y_val, groups_val)
    print(f'\nEvaluation ({n_traces} val traces):')
    print(f'  NDCG@10: {avg_ndcg:.4f}')
    print(f'  MRR@10:  {avg_mrr:.4f}')

    # Feature importance (top 10)
    imp_sorted = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    print('\nTop feature importance (gain):')
    for feat, gain in imp_sorted[:10]:
        print(f'  {feat:<25} {gain:.1f}')

    # Gate
    gate_pass = avg_ndcg >= args.ndcg_gate
    print(f'\n══ Gate ══════════════════════════')
    print(f'  {"✅" if gate_pass else "❌"} NDCG@10 = {avg_ndcg:.4f} (gate ≥{args.ndcg_gate})')
    print(f'  {"✅ GATE PASS — promote to Stage 4" if gate_pass else "⚠️  GATE FAIL — more training data needed"}')

    report = {
        'generated':    __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'model_type':   'lightgbm' if args.lightgbm else 'xgboost',
        'objective':    'regression' if args.lightgbm else args.objective,
        'model_path':   model_path_str,
        'train_rows':   int(X_train.shape[0]),
        'val_rows':     int(X_val.shape[0]),
        'val_traces':   n_traces,
        'ndcg_at_10':   round(avg_ndcg, 4),
        'mrr_at_10':    round(avg_mrr, 4),
        'ndcg_gate':    args.ndcg_gate,
        'gate_pass':    gate_pass,
        'feature_importance': dict(imp_sorted),
        'promotion_cmd': (
            'Set XGBOOST_RERANKER_PATH env var to model_path and restart the dev server '
            'to activate Stage 4 cross-encoder replacement.'
        ) if gate_pass else 'Collect more diverse traces (need ≥20 feature_ids) and retrain.',
    }

    with open(REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\nReport: {REPORT_PATH}')

    if gate_pass:
        _invalidate_graph_manifest('xgboost gate-pass: NDCG@10=' + str(round(avg_ndcg, 4)))
    else:
        sys.exit(1)


def _invalidate_graph_manifest(reason: str) -> None:
    """
    Fire graph-refresh-manifest invalidation after a successful training run.
    The graph manifest is stale once a new reranker model is available —
    the next graphify:daily run should regenerate with updated ranking signals.
    Non-fatal: if Node.js is unavailable the manifest simply stays stale.
    """
    manifest_script = ROOT / 'scripts' / 'atlas' / 'write-graph-refresh-manifest.mjs'
    if not manifest_script.exists():
        print(f'[train-xgboost] warning: manifest script not found at {manifest_script}')
        return
    node_exe = os.environ.get('NODE_PATH', 'node')
    try:
        subprocess.run(
            [node_exe, str(manifest_script), '--invalidate', '--reason', reason],
            cwd=str(ROOT),
            check=True,
            timeout=30,
        )
    except FileNotFoundError:
        print('[train-xgboost] warning: node not found — manifest invalidation skipped')
    except subprocess.CalledProcessError as e:
        print(f'[train-xgboost] warning: manifest invalidation exited {e.returncode}')
    except subprocess.TimeoutExpired:
        print('[train-xgboost] warning: manifest invalidation timed out')


if __name__ == '__main__':
    main()
