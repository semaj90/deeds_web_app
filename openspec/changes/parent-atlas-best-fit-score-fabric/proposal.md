# Parent Atlas Best-Fit Score Fabric

## Why

`BEST-FIT-SCORE-AUDIT-01` (read-only, complete, 2026-09-03) found that the retrieval scoring
stack has real terminology and provenance problems that must close before any calibrated
`BestFitScoreV1` relevance score can be built on top of it:

1. `okf-fit.ts`'s `naive_bayes_score` / `logistic_regression_score` / `fit_margin` are hand-written
   heuristic formulas (verified against source — not ML inference), misleadingly named after real
   ML methods. The live `:8095` sidecar's `MultinomialNB`/`LogisticRegression` `predict_proba()`
   outputs are *also* stored under the same `naive_bayes_score`/`logistic_regression_score` field
   names — two genuinely different things (a hand-tuned heuristic vs. a real domain-classifier
   probability) sharing one name, in two different subsystems (`okf-fit.ts` and
   `hmm-policy-bridge.ts`).
2. `classifyOkfFit()` overwrites `classifyDomainTaxonomy()`'s own `confidence`/`classifier_version`
   fields with its own heuristic values, losing the distinction between domain-taxonomy confidence
   and the heuristic fit score.
3. `runtime-reranker.ts::blendScores()` is not runtime-validated against `BlendWeightsSchema` at
   every public call boundary — only the reranker class constructors validate their own weights.
   `scoreCandidates()` accepts a caller-supplied `blendWeights` and passes it straight through
   unparsed.
4. **Verified live in this repo** (`canonical-rerank-executor.ts:487-501`): the XGBoost sidecar's
   real prediction (`xgbScore`) is placed into `crossEncoderScore`, but `blendScores()` is called
   with `{...DEFAULT_BLEND_WEIGHTS, crossEncoder: 0}` — the XGBoost score contributes **zero**
   weight to the candidates' `blendedScore`, and thus zero influence on ranking order, while the
   returned provenance still claims the real XGBoost `modelVersion`. Confirmed by direct code
   read, not asserted from the audit alone.

## What Changes

- **New capability**: `best-fit-score-semantics` — rename the heuristic OKF/HMM fields to
  `heuristic*` names, restore `classifyDomainTaxonomy()`'s own confidence/version fields
  unclobbered, keep the old snake_case fields as deprecated compatibility aliases.
- **New capability**: `rerank-weight-boundary-validation` — require `BlendWeightsSchema.parse()`
  at every externally-reachable custom-weight call boundary, especially `scoreCandidates()`.
- **New capability**: `xgboost-rerank-activation-audit` — classify the current XGBoost path as
  `LEARNED_SCORE_OBSERVED_NOT_RANKING_ACTIVE` until proven to actually change candidate order;
  block any future calibration work from training against it until fixed and replay-proven.
- **Modified/deferred capability**: `best-fit-score-v1` — the calibrated relevance-score contract
  itself (`BestFitScoreV1`) is designed here but explicitly NOT implemented until
  `BEST-FIT-CALIBRATION-01` has real reviewed `(query, candidate, relevant)` labels and a frozen
  calibrator. `fitScore` must never be set equal to `blendedScore` and called "calibrated."

## Impact

- Affected code: `sveltekit-frontend/src/lib/server/atlas/okf-fit.ts`,
  `okf-topic-ingestion.ts`, `hmm-policy-bridge.ts`,
  `sveltekit-frontend/src/lib/server/retrieval/runtime-reranker.ts`,
  `canonical-rerank-executor.ts`, `candidate-scorer.ts`, `post-process-reranker.ts`.
- No datastore writes required by this proposal itself — task 0 (the audit) was read-only.
- Cross-references `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s
  already-registered `XGBOOST-RERANKER-EVAL-01` gate — that gate is a *future* training/eval task
  gated behind `CANDIDATE-FEATURE-MATRIX-01` and is a **different XGBoost surface** than the one
  this proposal's finding #4 concerns (the already-deployed `canonical-rerank-executor.ts` path).
  Do not conflate the two; `XGBOOST-RERANKER-EVAL-01` should read this proposal before starting,
  since training against the currently-inert live XGBoost path would validate nothing.
