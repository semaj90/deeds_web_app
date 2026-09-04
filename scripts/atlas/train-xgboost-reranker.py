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
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent.parent

sys.path.insert(0, str(ROOT / 'python'))
from atlas_xgboost_grouped_ranking_v1 import prepare_grouped_ranking_dataset_v1  # noqa: E402

CSV_PATH        = ROOT / 'docs' / 'reports' / 'xgboost-features.csv'
MODEL_DIR       = ROOT / 'models'
# XGBOOST-OBJECTIVE-COMPARE-01 immutable candidate outputs (3.6b): every training run writes
# HERE by default — a content-addressed, objective-specific path that a later run can never
# silently collide with or overwrite. The single canonical `xgboost-reranker.ubj`/
# `xgboost-training-report.json` paths below are touched ONLY when `--promote` is passed
# explicitly; comparing reg:squarederror vs rank:ndcg must never risk clobbering whatever the
# live sidecar currently serves.
MODEL_CANDIDATES_DIR = MODEL_DIR / 'xgboost-candidates'
REPORT_DIR  = ROOT / 'docs' / 'reports'
MODEL_PATH  = MODEL_DIR / 'xgboost-reranker.ubj'
LGB_PATH    = MODEL_DIR / 'lgbm-reranker.txt'
REPORT_PATH = REPORT_DIR / 'xgboost-training-report.json'


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def objective_slug(objective: str) -> str:
    return objective.replace(':', '-')

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


def split_rows_by_trace(rows: list[dict], val_ratio: float = 0.2, seed: int = 42):
    """Split RAW rows (not yet feature-extracted) by trace_id, before any
    grouping/sorting happens. Used by the ranking-objective path so that
    qid group boundaries (derived downstream from trace_id) are never split
    across train/val, and so a group's rows never get separated by an
    unrelated shuffle of extracted arrays."""
    import numpy as np

    unique_traces = list({row.get(ID_COL, '') for row in rows})
    rng = np.random.default_rng(seed)
    rng.shuffle(unique_traces)
    n_val = max(1, int(len(unique_traces) * val_ratio))
    val_traces = set(unique_traces[:n_val])

    train_rows = [row for row in rows if row.get(ID_COL, '') not in val_traces]
    val_rows   = [row for row in rows if row.get(ID_COL, '') in val_traces]
    return train_rows, val_rows


def build_ranking_dataset(rows: list[dict]):
    """Build a qid-grouped dataset for rank:pairwise/rank:ndcg via the
    canonical grouped-ranking preparation module (python/atlas_xgboost_grouped_ranking_v1.py).
    Rows are explicitly sorted by (trace_id, packet_key) before qid assignment —
    group boundaries are exact, never inferred from arbitrary CSV row order.
    Returns (X, y, qid, val_group_labels) where val_group_labels[i] is the
    trace_id string for row i, aligned to the (sorted) row order of X/y/qid."""
    dataset = prepare_grouped_ranking_dataset_v1(
        rows,
        FEATURE_COLS,
        qid_field=ID_COL,
        candidate_key_field='packet_key',
        label_field=LABEL_COL,
    )
    group_labels = [dataset.qid_labels[i] for i in dataset.qid]
    return dataset.X, dataset.y, dataset.qid, group_labels


def evaluate_ranking(model, X_val, y_val, val_groups: list[str]):
    """Group val rows by trace_id, rank by predicted score, compute NDCG@5, NDCG@10, MRR@10 —
    the same three metrics regardless of training objective (XGBOOST-OBJECTIVE-METRIC-ALIGNMENT-01
    'final ranking evaluation' set), so a reg:squarederror run and a rank:ndcg run are judged on
    identical criteria. Also returns PER-TRACE metrics (not just the aggregate average) so a
    future objective comparison can inspect whether a challenger's aggregate gain comes from
    broad improvement or from catastrophically damaging a small query subset."""
    preds = model.predict(X_val)

    # Group by trace_id
    trace_data: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for i, trace_id in enumerate(val_groups):
        trace_data[trace_id].append((float(preds[i]), float(y_val[i])))

    per_trace = []
    for trace_id, rows_t in trace_data.items():
        rows_sorted = sorted(rows_t, key=lambda x: x[0], reverse=True)
        relevances  = [r[1] for r in rows_sorted]
        per_trace.append({
            'trace_id':   trace_id,
            'ndcg_at_5':  ndcg_at_k(relevances, 5),
            'ndcg_at_10': ndcg_at_k(relevances, 10),
            'mrr_at_10':  mrr_at_k(relevances, 10),
            'n_candidates': len(relevances),
        })

    def _avg(key: str) -> float:
        return sum(t[key] for t in per_trace) / len(per_trace) if per_trace else 0.0

    return {
        'ndcg_at_5':  _avg('ndcg_at_5'),
        'ndcg_at_10': _avg('ndcg_at_10'),
        'mrr_at_10':  _avg('mrr_at_10'),
        'n_traces':   len(per_trace),
        'per_trace':  per_trace,
    }


def evaluate_ndcg(model, X_val, y_val, val_groups: list[str], k: int = 10, use_lgbm: bool = False):
    """Backward-compatible (avg_ndcg_at_k, avg_mrr_at_k, n_traces) wrapper over
    evaluate_ranking() — kept for any external caller expecting the old 3-tuple shape."""
    result = evaluate_ranking(model, X_val, y_val, val_groups)
    ndcg_key = 'ndcg_at_5' if k == 5 else 'ndcg_at_10'
    return result[ndcg_key], result['mrr_at_10'], result['n_traces']


def _find_any_value_containing(value, needle: str) -> bool:
    """Recursively search a parsed JSON structure for any string value
    containing `needle` (case-insensitive). Used to verify the device that
    actually trained the model, not merely the device that was requested."""
    if isinstance(value, dict):
        return any(_find_any_value_containing(v, needle) for v in value.values())
    if isinstance(value, list):
        return any(_find_any_value_containing(v, needle) for v in value)
    return isinstance(value, str) and needle.lower() in value.lower()


def train_xgboost(X_train, y_train, X_val, y_val, objective: str, device: str,
                   qid_train=None, qid_val=None):
    try:
        import xgboost as xgb
    except ImportError:
        print('ERROR: xgboost not installed. Run: pip install xgboost')
        sys.exit(1)

    print(f'\nTraining XGBoost ({objective}) — {X_train.shape[0]:,} train rows, {X_val.shape[0]:,} val rows, device={device}')

    # XGBOOST-OBJECTIVE-METRIC-ALIGNMENT-01: the TRAINING eval_metric (used for early stopping)
    # must match what the objective actually optimizes for — a LambdaMART ranking objective
    # (rank:ndcg/rank:pairwise) judged by RMSE during training is not a fair or meaningful
    # comparison against reg:squarederror. This is distinct from the FINAL ranking evaluation
    # (evaluate_ranking(), always NDCG@5/NDCG@10/MRR@10 regardless of objective) — that stays
    # uniform across objectives; only the in-training metric differs.
    is_ranking = objective in ('rank:pairwise', 'rank:ndcg')
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
        'device':           device,
        'eval_metric':      ['ndcg@5', 'ndcg@10'] if is_ranking else 'rmse',
        'verbosity':        0,
    }
    if is_ranking:
        # lambdarank_num_pair_per_sample=10 under the topk pair method is the documented
        # XGBoost pattern for targeting NDCG@10 (analogous to their own NDCG@6 example using 6).
        params['lambdarank_pair_method'] = 'topk'
        params['lambdarank_num_pair_per_sample'] = 10
        # Found live while smoke-testing this task: rank:ndcg's DEFAULT gain function
        # (ndcg_exp_gain=True, i.e. 2^label - 1) requires an integer relevance grade and fails
        # closed with "label must be either 0 or positive integer" — this corpus's `label` column
        # is a continuous [0,1] float, not a discrete grade. XGBoost's own docs describe exactly
        # this case: "Adjust this parameter is required when...the label is not a discrete
        # grade" — ndcg_exp_gain=False uses the raw label value directly as gain instead.
        params['ndcg_exp_gain'] = False

    # QuantileDMatrix is the current stable recommendation for GPU training
    # (lower memory footprint than a plain DMatrix's intermediate CSR build).
    # dval must share dtrain's quantile bins via ref=dtrain.
    dtrain = xgb.QuantileDMatrix(X_train, label=y_train, feature_names=FEATURE_COLS)
    dval   = xgb.QuantileDMatrix(X_val,   label=y_val,   feature_names=FEATURE_COLS, ref=dtrain)

    if qid_train is not None:
        dtrain.set_info(qid=qid_train)
        dval.set_info(qid=qid_val)

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

    # Fail closed: a caller that explicitly requested a CUDA device gets a
    # hard error if the resolved training config doesn't actually show CUDA
    # engaged — never silently accept a CPU run as equivalent to the
    # requested GPU run. `device='cpu'` requests are exempt (nothing to
    # verify). This inspects the booster's OWN resolved config, not just
    # whether the request was accepted without raising.
    if device != 'cpu':
        resolved_config = json.loads(booster.save_config())
        if not _find_any_value_containing(resolved_config, 'cuda'):
            raise RuntimeError(
                f'XGBOOST_GPU_DEVICE_FAIL_CLOSED: requested device={device!r} but the '
                f'resolved booster config shows no cuda device engaged. Refusing to '
                f'report this run as a GPU run. Pass --device cpu explicitly if a CPU '
                f'run is actually intended.'
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
    parser.add_argument('--device',     default='cuda:0', choices=['cpu', 'cuda:0', 'cuda'],
                        help='XGBoost training device. A GPU request fails closed (nonzero exit, '
                             'no report written) if CUDA does not actually engage — never silently '
                             'downgrades to CPU and reports success. Pass --device cpu for an '
                             'intentional CPU run.')
    parser.add_argument('--promote',    action='store_true',
                        help='Also copy this run\'s output to the canonical models/xgboost-reranker.ubj '
                             '(or lgbm-reranker.txt) and docs/reports/xgboost-training-report.json paths '
                             'that the live sidecar defaults to. WITHOUT this flag (the default), every '
                             'run writes ONLY to models/xgboost-candidates/ + a candidate-specific report '
                             '— the canonical path is never touched, so running reg:squarederror and '
                             'rank:ndcg back to back can never silently overwrite each other or whatever '
                             'model the sidecar currently serves.')
    args = parser.parse_args()
    is_ranking = args.objective in ('rank:pairwise', 'rank:ndcg')

    print(f'\n═══ XGBoost/LightGBM Reranker Training ═══\n')
    print(f'CSV:       {CSV_PATH}')
    print(f'Mode:      {"LightGBM" if args.lightgbm else f"XGBoost ({args.objective})"}')
    print(f'Gate:      NDCG@10 >= {args.ndcg_gate}')

    if not CSV_PATH.exists():
        print(f'ERROR: {CSV_PATH} not found. Run: npm run atlas:xgboost:export')
        sys.exit(1)

    # Dataset identity for immutable candidate output naming (3.6b) — content-addressed, not a
    # timestamp, so two runs against the byte-identical CSV produce the same dataset_rev.
    dataset_rev = sha256_file(CSV_PATH)[:16]

    rows = load_csv(CSV_PATH)

    if args.dry_run:
        X, y, groups = build_arrays(rows)
        print(f'Feature matrix: {X.shape[0]:,} × {X.shape[1]} | label range [{y.min():.3f}, {y.max():.3f}]')
        print(f'Positive labels (>0): {(y > 0).sum():,} ({100*(y>0).mean():.1f}%)')
        print(f'Unique trace IDs:     {len(set(groups)):,}')
        print('\n(dry-run — validation only, no training)')
        print('✅ CSV is valid and loadable')
        return

    # Check dependencies
    try:
        import numpy  # noqa
    except ImportError:
        print('ERROR: numpy not installed. Run: pip install numpy xgboost lightgbm')
        sys.exit(1)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    qid_train = qid_val = None
    if is_ranking and not args.lightgbm:
        # Split RAW rows by trace_id first (group-locality preserved before any
        # feature extraction/sorting), then run each split through the
        # canonical grouped-ranking builder to get an explicit, sorted qid.
        train_rows, val_rows = split_rows_by_trace(rows)
        X_train, y_train, qid_train, groups_train = build_ranking_dataset(train_rows)
        X_val,   y_val,   qid_val,   groups_val   = build_ranking_dataset(val_rows)
        print(f'Feature matrix (grouped): {X_train.shape[0] + X_val.shape[0]:,} × {X_train.shape[1]}')
        print(f'Unique trace IDs:     {len(set(groups_train) | set(groups_val)):,}')
    else:
        X, y, groups = build_arrays(rows)
        print(f'Feature matrix: {X.shape[0]:,} × {X.shape[1]} | label range [{y.min():.3f}, {y.max():.3f}]')
        print(f'Positive labels (>0): {(y > 0).sum():,} ({100*(y>0).mean():.1f}%)')
        print(f'Unique trace IDs:     {len(set(groups)):,}')
        X_train, y_train, groups_train, X_val, y_val, groups_val = train_val_split(X, y, groups)

    print(f'\nTrain: {X_train.shape[0]:,} rows ({len(set(groups_train))} traces)')
    print(f'Val:   {X_val.shape[0]:,} rows ({len(set(groups_val))} traces)')

    # 3.6b — save to the immutable, content-addressed candidate path FIRST (always). The
    # canonical models/xgboost-reranker.ubj (or lgbm-reranker.txt) is touched only afterward,
    # and only when --promote was passed explicitly.
    slug = 'lightgbm' if args.lightgbm else objective_slug(args.objective)
    candidate_model_ext = '.txt' if args.lightgbm else '.ubj'
    # Placeholder filename until the real model_rev (hash of the saved bytes) is known — models
    # can't be named by their own content hash before they're written. Renamed immediately after.
    tmp_candidate_path = MODEL_CANDIDATES_DIR / f'{slug}-{dataset_rev}-pending{candidate_model_ext}'

    if args.lightgbm:
        model, importance = train_lightgbm(X_train, y_train, X_val, y_val)
        model.save_model(str(tmp_candidate_path))
    else:
        wrapper, booster, importance, evals = train_xgboost(
            X_train, y_train, X_val, y_val, args.objective, args.device,
            qid_train=qid_train, qid_val=qid_val,
        )
        booster.save_model(str(tmp_candidate_path))
        model = wrapper

    model_rev = sha256_file(tmp_candidate_path)[:16]
    candidate_model_path = MODEL_CANDIDATES_DIR / f'{slug}-{dataset_rev}-{model_rev}{candidate_model_ext}'
    tmp_candidate_path.rename(candidate_model_path)
    print(f'\nCandidate model saved: {candidate_model_path}')
    model_path_str = str(candidate_model_path)

    # Evaluate — NDCG@5, NDCG@10, MRR@10 uniformly regardless of objective (3.6a "final ranking
    # evaluation" set), plus per-trace metrics for future per-query delta inspection.
    ranking_result = evaluate_ranking(model, X_val, y_val, groups_val)
    avg_ndcg_5  = ranking_result['ndcg_at_5']
    avg_ndcg    = ranking_result['ndcg_at_10']
    avg_mrr     = ranking_result['mrr_at_10']
    n_traces    = ranking_result['n_traces']
    print(f'\nEvaluation ({n_traces} val traces):')
    print(f'  NDCG@5:  {avg_ndcg_5:.4f}')
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
    print(f'  {"✅ GATE PASS" if gate_pass else "⚠️  GATE FAIL — more training data needed"}')
    if gate_pass and not args.promote:
        print('  (candidate output only — pass --promote to update the canonical model path)')

    report = {
        'generated':      __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'model_type':     'lightgbm' if args.lightgbm else 'xgboost',
        'objective':      'regression' if args.lightgbm else args.objective,
        'device':         'gpu-requested (see lightgbm device_type)' if args.lightgbm else args.device,
        'model_path':     model_path_str,
        'dataset_revision': dataset_rev,
        'model_revision':   model_rev,
        'promoted':         bool(args.promote),
        'train_rows':     int(X_train.shape[0]),
        'val_rows':       int(X_val.shape[0]),
        'val_traces':     n_traces,
        'ndcg_at_5':      round(avg_ndcg_5, 4),
        'ndcg_at_10':     round(avg_ndcg, 4),
        'mrr_at_10':      round(avg_mrr, 4),
        'ndcg_gate':      args.ndcg_gate,
        'gate_pass':      gate_pass,
        'per_trace':      ranking_result['per_trace'],
        'feature_importance': dict(imp_sorted),
        'promotion_cmd': (
            f'Re-run with --promote to update models/xgboost-reranker.ubj + '
            f'docs/reports/xgboost-training-report.json, OR set XGBOOST_RERANKER_PATH / pass '
            f'--model={model_path_str} to the sidecar to use this candidate directly without promoting.'
        ) if gate_pass else 'Collect more diverse traces (need ≥20 feature_ids) and retrain.',
    }

    candidate_report_path = REPORT_DIR / f'xgboost-objective-{slug}-{model_rev}.json'
    with open(candidate_report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\nCandidate report: {candidate_report_path}')

    if args.promote:
        # Explicit, separate write to the canonical paths the sidecar and dev server default to
        # — never implicit, never the default behavior.
        canonical_model_path = LGB_PATH if args.lightgbm else MODEL_PATH
        shutil.copyfile(candidate_model_path, canonical_model_path)
        with open(REPORT_PATH, 'w') as f:
            json.dump(report, f, indent=2)
        print(f'PROMOTED: {canonical_model_path}')
        print(f'PROMOTED: {REPORT_PATH}')

    if gate_pass:
        if args.promote:
            _invalidate_graph_manifest('xgboost gate-pass (promoted): NDCG@10=' + str(round(avg_ndcg, 4)))
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
