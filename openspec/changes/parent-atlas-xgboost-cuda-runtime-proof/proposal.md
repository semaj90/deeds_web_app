## Why

Operator review (2026-08-22) of this repo's XGBoost reranker status correctly separates two independent gates that prior audits (`docs/reports/trace-xgboost-candidate-fabric-audit-20260822.md`, `parent-atlas-compute-rank-cache-eval-dspy-gepa`, `atlas-feature-intelligence`) had conflated: **GPU runtime capability** (can this machine's CUDA 13 / RTX 3060 Ti stack actually execute XGBoost on GPU) is provable *independently* of **canonical reranker promotion** (is the training data trustworthy enough to make XGBoost the production Stage 4 reranker). The operator supplied a state classification, a concrete WSL CUDA proof protocol, and — independently verified against the live trainer script in this session — a real bug: `scripts/atlas/train-xgboost-reranker.py` supports `rank:pairwise`/`rank:ndcg` objectives but never attaches `qid`/group info to the `DMatrix`, which XGBoost's learning-to-rank objectives require.

## State classification (operator-proposed, verified against live code/artifacts 2026-08-22)

| Status | Verified? | Evidence |
|---|---|---|
| XGBOOST_PACKAGE_TRAINER_CODE_PRESENT | ✅ confirmed | `scripts/atlas/train-xgboost-reranker.py` (381 lines), `scripts/atlas/export-xgboost-features.mjs` |
| XGBOOST_CUDA_PARAMETERS_PRESENT | ✅ confirmed | trainer line 180-181: `'tree_method': 'hist', 'device': 'cuda', # falls back to cpu if no CUDA` |
| XGBOOST_CUDA_INSTALLATION_NEEDS_WORKSTATION_PROOF | open | not checked this pass — the WSL proof protocol below is the next step |
| XGBOOST_CUDA_EXECUTION_UNPROVEN | ✅ confirmed | `docs/reports/xgboost-training-report.json` (the one existing training run, 2026-08-09) records zero device/GPU info — no way to tell if that run used CPU or GPU |
| XGBOOST_GPU_RECEIPT_MISSING | ✅ confirmed | same report — no `save_config()` dump, no `nvidia-smi` correlation, no `grow_gpu_hist` evidence anywhere in this repo |
| **XGBOOST_SIDECAR_PRESENT** | ❌ **corrected — not accurate** | `scripts/reranker-sidecar.py` exists but is a **Mixedbread PyTorch CrossEncoder** sidecar (`mxbai-rerank-base-v2`, port 8099) with **zero** XGBoost references (`grep -c xgboost` → 0). It's the thing XGBoost promotion would *replace* per the trainer's own `promotion_cmd` ("activate Stage 4 cross-encoder replacement"), not an XGBoost sidecar. No dedicated XGBoost inference sidecar exists in this repo. |
| XGBOOST_SVELTEKIT_ACTIVATION_PRESENT | ✅ confirmed | `sveltekit-frontend/src/lib/server/atlas/phase-lane-registry.ts:264-278` — phase 18, `status: 'partial'`, explicitly self-documented as `nextGate: 'keep the reranker as a mock-only evaluation surface'`, `mockArtifacts: ['xgboost-reranker.mock.json']` |
| OLD_XGBOOST_GPU_INFERENCE_NOT_WIRED_PROBABLY_NOT_DESIRABLE_YET | ✅ confirmed | consistent with phase-lane-registry's explicit mock-only status |
| XGBOOST_FEATURE_EXPORTER_PRESENT | ✅ confirmed | `scripts/atlas/export-xgboost-features.mjs`, `docs/reports/xgboost-features-meta.json`, `.csv` |
| LEGACY_TRACE_CANDIDATE_IDENTITY_BLOCKED | ✅ confirmed | `docs/reports/trace-xgboost-candidate-fabric-audit-20260822.md` (a concurrent session's audit, same day): "legacy dry-run fallback... synthetic `packet:<label>:<ordinal>` references... not canonical packet identity" — now fixed to require a checksum-verified bridge, but apply mode remains blocked |
| LEARNING_TO_RANK_GROUPING_DEFECT | ✅ **confirmed, new finding this pass** | see "Verified trainer bugs" below — `dtrain`/`dval` are plain `xgb.DMatrix` with no `set_info(qid=...)` call anywhere in the file, despite `rank:pairwise`/`rank:ndcg` being selectable `--objective` values |
| CANONICAL_TRAINING_CORPUS_BLOCKED | ✅ confirmed | same audit report: `XGBOOST_DATASET_DATA_JOIN_BLOCKED`, "No lineage-valid trace dataset... exists" |
| PRODUCTION_RERANK_PROMOTION_BLOCKED | ✅ confirmed | downstream of the above two |

## Verified trainer bugs (this session, direct code read of `scripts/atlas/train-xgboost-reranker.py`)

1. **Silent CPU fallback instead of fail-closed** (line 181): `'device': 'cuda',  # falls back to cpu if no CUDA` — a requested GPU proof run that can't get CUDA silently trains on CPU and reports success, rather than failing. This is exactly how the existing `xgboost-training-report.json` ended up with zero way to tell which device actually trained it.
2. **Ordinary `DMatrix`, not `QuantileDMatrix`** (lines 186-187): `xgb.DMatrix(X_train, ...)` / `xgb.DMatrix(X_val, ...)`. Current stable XGBoost documentation recommends `QuantileDMatrix` for GPU training (better memory behavior, avoids one intermediate CSR conversion).
3. **No `qid`/group attached for ranking objectives** (confirmed by full-file read — zero occurrences of `set_info`, `qid`, or a `group` param anywhere in the file): the trainer already computes `groups` (a per-row `trace_id` list, used correctly for the *train/val split* in `train_val_split()` and for *NDCG/MRR evaluation grouping* in `evaluate_ndcg()`) but never passes that same grouping into the `DMatrix` itself. XGBoost's `rank:pairwise`/`rank:ndcg` objectives require query grouping (`qid`) to know which rows compete against which within one ranking group — without it, the ranking loss is computed over an undefined/arbitrary grouping (effectively CSV row order), which is not a valid ranking signal. The one existing training report used `reg:squarederror` (not a ranking objective), so this defect hasn't yet corrupted a real ranking run, but it would corrupt the next `rank:pairwise`/`rank:ndcg` run silently — no error, just a meaningless ranking loss.

## What Changes

1. Add a bounded WSL CUDA proof protocol as the path to `XGBOOST_GPU_RUNTIME_PROVEN` — explicitly independent of `XGBOOST_RERANKER_PRODUCTION_PROVEN`, using a synthetic matrix (no trace-lineage dependency).
2. Three bounded fixes to `scripts/atlas/train-xgboost-reranker.py`: (a) `QuantileDMatrix` instead of `DMatrix`, (b) explicit `device` CLI arg (`cpu`|`cuda:0`) that fails closed rather than silently falling back, (c) `qid` derivation from `trace_id` for `rank:pairwise`/`rank:ndcg` objectives, preferring an explicit sort-by-trace_id-then-set-qid design over inferring group boundaries from arbitrary row order.
3. Explicitly do NOT couple XGBoost's CUDA version to PyTorch's — separate runtime boundaries (`atlas-rapids-cu13` WSL env is a convenient operational home, not a hard ABI dependency).

## Non-Goals

- Does not attempt canonical reranker promotion in this change — that stays gated behind `LEGACY_TRACE_CANDIDATE_IDENTITY_BLOCKED` / `CANONICAL_TRAINING_CORPUS_BLOCKED`, tracked in the trace-fabric audit and its owning OpenSpec changes, not here.
- Does not run the WSL proof protocol as part of this proposal — it's a documented next step requiring an interactive WSL session, not something to execute blind.
- Does not touch `packages/parent-atlas/src/core/xgboost-trace-label-bridge.ts` or the trace-candidate identity work — that's a concurrent, separate, actively in-progress effort (untracked files present in the working tree as of this session) with its own audit trail; this change stays scoped to the trainer script + GPU runtime proof only.

## Impact

- **Code affected** (not yet changed): `scripts/atlas/train-xgboost-reranker.py` (3 bounded edits pending).
- **No promotion risk**: none of this changes `XGBOOST_RERANKER_PATH` activation or `phase-lane-registry.ts`'s `status: 'partial'` — GPU-runtime proof and reranker promotion remain two independently-gated claims by design.
