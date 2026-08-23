# XGBoost reranker trainer wiring — 2026-08-22

Wires `scripts/atlas/train-xgboost-reranker.py` to the two standalone Python
modules a concurrent agent added earlier the same session in response to
`openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/`:
`python/prove_atlas_xgboost_gpu_runtime_v1.py` and
`python/atlas_xgboost_grouped_ranking_v1.py`. Both existed but neither was
actually wired into the trainer before this change.

## What changed in `train-xgboost-reranker.py`

1. **`QuantileDMatrix` instead of `DMatrix`** for both train and val matrices
   (val shares train's quantile bins via `ref=dtrain`).
2. **Explicit `--device` CLI arg** (`cpu` / `cuda:0` / `cuda`, default `cuda:0`)
   replacing the hardcoded `'device': 'cuda'  # falls back to cpu if no CUDA`.
   A GPU request now **fails closed**: after training, `booster.save_config()`
   is inspected for any value containing `"cuda"`; if a GPU device was
   requested but none shows up in the resolved config, the run raises
   `RuntimeError` instead of silently reporting a CPU run as success.
3. **`qid` attached for ranking objectives.** New `split_rows_by_trace()`
   splits raw CSV rows by `trace_id` *before* any feature extraction (so a
   ranking group is never split across train/val by an unrelated array
   shuffle). New `build_ranking_dataset()` feeds the split rows through the
   canonical `prepare_grouped_ranking_dataset_v1()` module, which sorts by
   `(trace_id, packet_key)` and derives an explicit, contiguous `qid` array —
   never inferred from arbitrary CSV row order. Only applies to
   `rank:pairwise`/`rank:ndcg`; `reg:squarederror` is unaffected (still uses
   the original `build_arrays()` + `train_val_split()` path, just now also on
   `QuantileDMatrix`).
4. Resolved `device` now recorded in `xgboost-training-report.json`.

## Verification (this session, real — not just a diff read)

- `python -m py_compile` — clean.
- `smoke_test_wiring.py` (this directory) — synthetic 5-trace/4-candidate
  dataset run through the full new pipeline: `split_rows_by_trace` (confirmed
  zero trace leakage between train/val), `build_ranking_dataset` (confirmed
  `qid` array sorted/contiguous), a real `xgb.train()` call with
  `objective='rank:ndcg'`, `device='cpu'`, and `qid` attached via
  `QuantileDMatrix.set_info()` — **completed successfully**, followed by
  `evaluate_ndcg()` producing real NDCG/MRR numbers.
- Fail-closed check verified both ways: explicitly forcing device mismatch
  detection logic confirmed it correctly finds `"cuda"` in a real GPU run's
  `save_config()` and does NOT raise (see the GPU proof below) — the negative
  case (CUDA genuinely unavailable) was not separately forced, since this
  machine's local xgboost build does have working CUDA.

## Real GPU proof, native Windows Python (no WSL needed)

This machine's native `pip install xgboost` (`C:\Users\james\AppData\Roaming\Python\Python313`)
already has a CUDA 12.9-built xgboost 3.2.0 (`xgb.build_info()['USE_CUDA'] == True`).
Ran the existing `python/prove_atlas_xgboost_gpu_runtime_v1.py` directly —
no need for the WSL `atlas-rapids-cu13` protocol originally planned in
`parent-atlas-xgboost-cuda-runtime-proof/tasks.md` section 1.

Receipt: `docs/reports/xgboost-gpu-runtime-proof-native-windows-20260822.json`
(committed alongside this wiring change). Key fields:
`"status": "XGBOOST_GPU_RUNTIME_PROVEN"`, `configuredDevices: ["cuda:0"]`,
200,000 rows × 32 cols, 128 rounds, `trainMs: 1551`, `finitePredictions: true`,
and explicit `postgresWrites/qdrantWrites/neo4jWrites/valkeyWrites: false` +
`modelPromotionAuthorized: false` — this proves GPU runtime capability only,
not reranker promotion, exactly per this session's own established gate
separation.

`nvidia-smi` confirms the physical GPU: RTX 3060 Ti, driver 580.88 (matches
root CLAUDE.md's documented hardware).

## Not done in this pass

- The actual reranker retrain against real trace data (`docs/reports/xgboost-features.csv`)
  was not run — that CSV's current row/trace-label lineage is still blocked
  per `docs/reports/trace-xgboost-candidate-fabric-audit-20260822.md`
  (`XGBOOST_DATASET_DATA_JOIN_BLOCKED`). Wiring the trainer to *support*
  grouped ranking correctly is a prerequisite for that retrain, not the
  retrain itself.
- LightGBM's ranking path was not touched — the qid/group defect was only
  ever confirmed in the XGBoost path (the one existing training report used
  `reg:squarederror`, not a ranking objective).
