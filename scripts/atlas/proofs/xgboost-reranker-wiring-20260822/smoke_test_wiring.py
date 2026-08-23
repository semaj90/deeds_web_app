import importlib.util
import sys
import numpy as np

spec = importlib.util.spec_from_file_location('trainer', 'scripts/atlas/train-xgboost-reranker.py')
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)

print('module loaded OK, FEATURE_COLS len =', len(trainer.FEATURE_COLS))

# Build synthetic rows shaped like the real CSV: 5 traces x 4 candidates each
rng = np.random.default_rng(0)
rows = []
for t in range(5):
    trace_id = f'trace-{t}'
    for c in range(4):
        row = {col: str(round(float(rng.uniform(0, 1)), 4)) for col in trainer.FEATURE_COLS}
        row['trace_id'] = trace_id
        row['packet_key'] = f'packet:{t}:{c}'
        row['label'] = str(1.0 if c == 0 else 0.0)
        rows.append(row)

print(f'{len(rows)} synthetic rows across {len({r["trace_id"] for r in rows})} traces')

train_rows, val_rows = trainer.split_rows_by_trace(rows, val_ratio=0.2, seed=1)
print('split_rows_by_trace OK:', len(train_rows), 'train rows,', len(val_rows), 'val rows')
assert len(train_rows) + len(val_rows) == len(rows)
train_traces = {r['trace_id'] for r in train_rows}
val_traces = {r['trace_id'] for r in val_rows}
assert train_traces.isdisjoint(val_traces), 'trace leakage between train/val!'
print('no trace leakage confirmed')

X_train, y_train, qid_train, groups_train = trainer.build_ranking_dataset(train_rows)
X_val, y_val, qid_val, groups_val = trainer.build_ranking_dataset(val_rows)
print('build_ranking_dataset OK: X_train', X_train.shape, 'qid_train dtype', qid_train.dtype, 'unique qids', len(set(qid_train.tolist())))

# qid must be non-decreasing (rows sorted by qid) -- required by xgboost
qid_list = qid_train.tolist()
assert qid_list == sorted(qid_list), 'qid_train is not sorted/contiguous!'
print('qid_train is sorted/contiguous, confirmed')

# CPU training run (avoid requiring local CUDA) -- validates QuantileDMatrix + set_info(qid=...) actually work
wrapper, booster, importance, evals = trainer.train_xgboost(
    X_train, y_train, X_val, y_val, 'rank:ndcg', 'cpu',
    qid_train=qid_train, qid_val=qid_val,
)
print('train_xgboost (rank:ndcg, cpu, with qid) completed OK, booster type:', type(booster).__name__)

avg_ndcg, avg_mrr, n_traces = trainer.evaluate_ndcg(wrapper, X_val, y_val, groups_val)
print(f'evaluate_ndcg OK: ndcg={avg_ndcg:.4f} mrr={avg_mrr:.4f} n_traces={n_traces}')

print('\nALL SMOKE CHECKS PASSED')
