## 0. UPDATE 2026-08-22 21:xx — a concurrent agent picked this proposal up directly

Merge PR #64 (`agent/ast-lineage-xgboost-runtime-hardening-20260822`) landed on `main` shortly
after this change's original commit (`31bff54117`) and, per its commit sequence, implements
exactly what this change proposed:

- [x] **`python/prove_atlas_xgboost_gpu_runtime_v1.py`** (commit `9bcd78536c`) — a bounded, synthetic
  XGBoost CUDA runtime proof: `xgb.QuantileDMatrix`, explicit `--device` arg (default `cuda:0`),
  synthetic matrix only, no trace-lineage read, argument-bounds validation (`rows<1024` etc. rejected).
  This is a cleaner, simpler realization of the same idea section 1 below proposed as a manual WSL
  protocol — **use this script directly instead of hand-running the WSL steps below.**
- [x] **`python/atlas_xgboost_grouped_ranking_v1.py`** (commit `340dc98b34`) — implements the exact
  qid/group design section 4 below proposed: sorts rows by `(qid, candidate_key)`, derives a stable
  `qid` array from sorted unique labels, rejects duplicate `(qid, candidate_key)` pairs, requires
  every qid group to have ≥2 rows. Docstring explicitly states "without inventing candidate identity."
- [ ] **NOT done**: neither new file is wired into `scripts/atlas/train-xgboost-reranker.py`. Verified
  by direct grep of the current `train-xgboost-reranker.py` content on `main` (`9dcb4d71c6`) — it is
  byte-identical to what this change's proposal.md originally quoted: still plain `xgb.DMatrix` (not
  `QuantileDMatrix`), still `'device': 'cuda',  # falls back to cpu if no CUDA` (silent fallback,
  unchanged), still zero occurrences of `qid`/`set_info`/`group`. **The two new Python modules exist
  as standalone utilities; the actual reranker training script that had the 3 verified bugs is
  unmodified.** This is either (a) intentional — a new Python-native training path is meant to
  eventually replace `train-xgboost-reranker.py`, or (b) an integration gap — the new pieces need to
  be wired into the existing trainer. **Not yet resolved; needs its own investigation before writing
  more code** — per root CLAUDE.md's Duplication Prevention rule, two implementations of the same
  logical capability (grouped-ranking dataset prep) now exist and must be classified
  (CANONICAL_OWNER / BACKEND / EXPERIMENT / DEAD) rather than left as an unexplained duplicate.
  Also unresolved: `prove_atlas_xgboost_gpu_runtime_v1.py` has been added but not yet actually run —
  no `docs/reports/*xgboost*gpu*` receipt exists anywhere in history as of this check. Section 1's
  checklist (8 items) still applies to whatever run eventually happens.

## 1. XGBOOST_GPU_RUNTIME_PROVEN — synthetic-matrix proof (no trace-lineage dependency)

**Superseded in practice by `python/prove_atlas_xgboost_gpu_runtime_v1.py` (see section 0) — prefer
running that script over hand-executing this WSL protocol.** Kept below as the detailed manual
fallback and as the source of the 8-item proof checklist (1.6), which still applies regardless of
which script produces the run.

Run entirely in WSL's existing `atlas-rapids-cu13` conda env (CUDA 13, already provisioned per `parent-atlas-compute-rank-cache-eval-dspy-gepa` GS1.31's correction — do not re-provision).

- [ ] 1.1 `wsl -d Ubuntu`, `source ~/miniforge3/etc/profile.d/conda.sh`, `conda activate atlas-rapids-cu13`, confirm `nvidia-smi` shows the RTX 3060 Ti.
- [ ] 1.2 Check for an existing XGBoost install: `python -c "import json, xgboost as xgb; print(xgb.__version__); print(json.dumps(xgb.build_info(), indent=2, default=str))"`. Inspect `build_info()`'s actual returned keys rather than assuming a fixed schema (its structure isn't a stable/guaranteed API contract per XGBoost's own docs).
- [ ] 1.3 If missing: `python -m pip install -U xgboost` (the current default Linux wheel is CUDA-13-built; do NOT install `xgboost-cpu`).
- [ ] 1.4 Run the GPU smoke test: build a synthetic 500,000×32 float32 matrix, load via `xgb.QuantileDMatrix`, train `tree_method=hist, device=cuda:0` for 300 rounds, capture elapsed time and `booster.save_config()`.
- [ ] 1.5 In a second WSL terminal, run `nvidia-smi dmon -s pucm -d 1` (or `watch -n 0.5 nvidia-smi` if `dmon` isn't supported under this WSL driver) during training to observe real VRAM allocation and GPU utilization.
- [ ] 1.6 Verify the proof checklist, all 8 items required before declaring `XGBOOST_GPU_RUNTIME_PROVEN` (not before):
  - [ ] `import xgboost` succeeds
  - [ ] `xgb.build_info()` reports CUDA-capable build
  - [ ] `device='cuda:0'` accepted without error
  - [ ] `QuantileDMatrix` training completes
  - [ ] `booster.save_config()` shows a CUDA device (`"device": "cuda:0"` or equivalent) — this is the load-bearing evidence, not just "import succeeded"
  - [ ] `save_config()` shows `grow_gpu_hist` (or the current-version-equivalent GPU updater name — verify against the installed version's actual config output, don't hardcode an assumed string)
  - [ ] `nvidia-smi` shows real VRAM allocation/GPU activity correlated with the training window
  - [ ] Predictions are finite (no NaN/Inf)
- [ ] 1.7 Write the proof receipt to `docs/reports/xgboost-gpu-runtime-proof-<date>.json` — capture `xgb.__version__`, the full `build_info()` dump, elapsed seconds, the relevant `save_config()` slice, and a note confirming the `nvidia-smi` observation (screenshot or dmon log excerpt, operator's call which is more practical). This receipt is exactly what `docs/reports/xgboost-training-report.json` is currently missing (see proposal.md's `XGBOOST_GPU_RECEIPT_MISSING` finding).
- [ ] 1.8 Declare `XGBOOST_GPU_RUNTIME_PROVEN` **only** — explicitly NOT `XGBOOST_RERANKER_PRODUCTION_PROVEN`. Do not let this proof get cited later as evidence the reranker itself is ready; it only proves the CUDA execution path works on this workstation.

## 2. Trainer fix — QuantileDMatrix

- [ ] 2.1 In `scripts/atlas/train-xgboost-reranker.py::train_xgboost()`, replace `dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=FEATURE_COLS)` / `dval = xgb.DMatrix(...)` with `xgb.QuantileDMatrix`, passing `ref=dtrain` for the validation matrix (required by `QuantileDMatrix`'s API to share quantile bins with the training matrix).
- [ ] 2.2 Update the `BoosterWrapper.predict()` inner method's `xgb.DMatrix(X, ...)` call site too if `QuantileDMatrix` requires (or benefits from) the same treatment for prediction-only inference — check XGBoost's current docs on whether `QuantileDMatrix` is train-only or also recommended for predict.

## 3. Trainer fix — explicit, fail-closed device selection

- [ ] 3.1 Add a `--device` CLI arg (choices `cpu`, `cuda:0`, or similar) to replace the hardcoded `'device': 'cuda',  # falls back to cpu if no CUDA` at line 181.
- [ ] 3.2 When `--device=cuda:0` is requested, fail closed (raise/exit nonzero) if CUDA is not actually available/usable, rather than silently training on CPU and reporting success — a requested GPU proof run must not be able to silently downgrade and still report `gate_pass: true` with no indication it ran on CPU.
- [ ] 3.3 Record the resolved device in `xgboost-training-report.json`'s output (currently absent — this is exactly what made the existing 2026-08-09 report's device unknowable after the fact).

## 4. Trainer fix — qid/group attachment for ranking objectives

- [ ] 4.1 When `--objective` is `rank:pairwise` or `rank:ndcg`, sort `X_train`/`y_train`/`groups_train` (and the val equivalents) explicitly by `trace_id` before matrix construction — don't rely on arbitrary CSV row order to define group boundaries, since XGBoost's `qid` mechanism requires same-group rows to be contiguous.
- [ ] 4.2 Derive a stable per-trace `qid` (e.g. `trace_to_qid = {t: i for i, t in enumerate(sorted(set(groups_train)))}`, applied per-row) and call `dtrain.set_info(qid=train_qid)` / `dval.set_info(qid=val_qid)` (or pass `qid=` directly to `QuantileDMatrix`'s constructor if the installed XGBoost version supports it — check current API, prefer the constructor arg over a separate `set_info()` call if both are valid).
- [ ] 4.3 Only attach `qid` for the ranking objectives (`rank:pairwise`, `rank:ndcg`) — `reg:squarederror` doesn't use it and shouldn't be forced through the sort/group machinery.
- [ ] 4.4 Add a regression test (or at minimum a `--dry-run`-style assertion) verifying that for a ranking objective, every `qid` group's rows are contiguous in the matrix and group boundaries match `trace_id` boundaries exactly — this defect was silent before (no error, just a meaningless ranking loss), so a structural check is the only way future changes won't reintroduce it silently.

## 5. Explicitly out of scope here (tracked elsewhere)

- [ ] 5.1 Do not attempt to unblock `LEGACY_TRACE_CANDIDATE_IDENTITY_BLOCKED` or `CANONICAL_TRAINING_CORPUS_BLOCKED` as part of this change — owned by the trace-candidate-fabric audit (`docs/reports/trace-xgboost-candidate-fabric-audit-20260822.md`) and whatever OpenSpec change the concurrent in-progress `xgboost-trace-label-bridge.ts`/`xgboost-trace-packet-reference.ts` work lands under.
- [ ] 5.2 Do not promote `XGBOOST_RERANKER_PATH` or change `phase-lane-registry.ts`'s phase-18 `status: 'partial'` as part of this change.
