# Tasks — Parent Atlas Best-Fit Score Fabric

Cross-references: `parent-atlas-retrieval-lineage-dag-convergence/tasks.md` (registered
`XGBOOST-RERANKER-EVAL-01` gate — different XGBoost surface, see proposal.md Impact section),
`parent-atlas-search-classifier-sidecar/design.md` D4b (`okf-fit.ts`'s formula-based NB/LR-named
fields, first flagged there).

## 0. BEST-FIT-SCORE-AUDIT-01 — READ_ONLY_COMPLETE_WITH_FINDINGS (2026-09-03)

- [x] 0.1 DONE — full read-only audit of the retrieval scoring stack: RRF (`combineViaRRF()`,
      `rrfComponent = laneWeight / (k + laneRank)`, `k=60`, raw lane score retained but non-voting,
      per-lane dedup confirmed), `runtime-reranker.ts::blendScores()` (7 signals — dense/bm25/ast/
      graph/pagerank/domain/crossEncoder, `DEFAULT_BLEND_WEIGHTS` sums to 1.0, missing signals
      renormalize over `activeWeight` rather than counting as zero), `candidate-scorer.ts`'s
      rank/fusion fallback path (`0.70 * rankScore + 0.30 * normalizedFusionScore` when blend is
      zero), `post-process-reranker.ts` (keeps `blendedScore` immutable, computes a separate
      `finalScore` for freshness/dislike/diversity policy).
- [x] 0.2 DONE — exact `okf-fit.ts` formula recovered and recorded (see proposal.md's Why #1):
      `heuristicPriorScore` (misnamed `naive_bayes_score`) and `heuristicFitScore` (misnamed
      `logistic_regression_score`, `sigmoid(-1.15 + 1.80*C + 0.55*S + 0.35*L + 0.22*M + 0.05*min(N,12))`,
      thresholds 0.80 ACCEPT / 0.55 REVIEW / else ABSTAIN) are both hand-specified formulas, not
      ML inference — confirmed by reading the formula itself, not just asserted.
- [x] 0.3 DONE — confirmed `classifyOkfFit()` overwrites `classifyDomainTaxonomy()`'s own
      `confidence`/`classifier_version` with its own heuristic values (proposal.md Why #2) — real
      provenance loss, not a naming-only issue.
- [x] 0.4 DONE — traced the same heuristic-vs-real-ML naming collision into a SECOND surface,
      `hmm-policy-bridge.ts`, which independently hand-builds its own `naiveBayesScore`/
      `logisticRegressionScore` pair from different heuristics. The rename (task 1 below) must
      cover both `okf-fit.ts` and `hmm-policy-bridge.ts`, not just one.
- [x] 0.5 DONE — confirmed the live `:8095` sidecar's REAL `MultinomialNB`/`LogisticRegression`
      `predict_proba()` outputs are a domain-CLASS probability (`P(domain=retrieval | features)`),
      a different prediction task than a future `BestFitScoreV1.fitScore`
      (`P(relevant | query, candidate, features)` after calibration) — do not conflate; canonical
      names for the real sklearn outputs should be `naiveBayesDomainProbability`/
      `logisticRegressionDomainProbability` (or `...TopClassProbability`), not a bare
      `naive_bayes_score`.
- [x] 0.6 DONE — full score inventory recorded (RRF `combinedScore`, `denseScore`, `bm25Score`,
      `astScore`, `graphScore`, `pagerankScore`, `domainScore`, cross-encoder raw/normalized,
      runtime `blendedScore`, post-process `finalScore`, OKF heuristic prior/fit, sklearn NB/LR,
      eventual `BestFitScoreV1.fitScore`) — see proposal.md source audit for the full table; not
      duplicated here.
- [x] 0.7 **VERIFIED LIVE, HIGH SEVERITY — FINDING-XGB-01**: read
      `sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts:487-501` directly.
      `xgbScore` (the real XGBoost sidecar prediction) is placed into `crossEncoderScore: xgbScore`,
      but `blendScores()` is called with `{...DEFAULT_BLEND_WEIGHTS, crossEncoder: 0}` — the
      XGBoost score contributes **zero** to `blendedScore` and therefore has **zero effect on
      candidate ranking order**, while `modelVersion` in the returned provenance still names the
      real XGBoost model. Status: `LEARNED_SCORE_NOT_RANKING_ACTIVE`. Confirmed by direct code
      read this session, not taken on the audit's word alone.
- [x] 0.8 **VERIFIED LIVE — the `blendScores()` validation hole**: read
      `runtime-reranker.ts:147` (`export function blendScores(candidate, weights: BlendWeights)`)
      and confirmed it does NOT call `BlendWeightsSchema.parse()` internally — only the
      `DeterministicReranker`/`MixedbreadCanonicalReranker` class constructors validate their own
      weights (`this.blendWeights = BlendWeightsSchema.parse(weights)` at line 182). A caller
      passing a malformed `blendWeights` straight into the module-level `blendScores()` function
      (as `scoreCandidates()` does) bypasses validation entirely. Confirmed by direct code read.
- [x] 0.9 DONE — `domainScore` collision flagged: on the canonical candidate-scorer path,
      `domainScore` has already been repurposed by the unified-symbol-ranking work into a
      static/dynamic + code-provenance composite (a completed OpenSpec change already documents
      this). Feeding a real sklearn domain probability into the existing `domainScore` field would
      silently change its meaning — do not do that. A future `domainProbability` component must be
      a NEW field, evaluated separately before it earns a real reranker weight.
- [x] 0.10 DONE — provenance-field collision in `okf-topic-ingestion.ts`: `OKF_FIT_VERSION`
      (`'okf-fit-v1'`) is placed into the HMM observation's `sourceRevision` field, and
      `workspaceRevision: 'main'` is hardcoded in the feature-source manifest — a heuristic/policy
      revision string being asserted as if it were an actual source revision. Any future
      `BestFitScoreV1.provenance` must keep `sourceRevision` / `heuristicRevision` /
      `domainClassifierRevision` / `featureRevision` / `calibrationRevision` as distinct axes,
      never substituted for one another.
- [x] 0.11 NOTED, not resolved — `sveltekit-frontend/src/lib/server/atlas/ranking-index.ts` (named
      in an earlier handoff as a possible owner) does not resolve on current `main` — the real
      target owner is `runtime-reranker.ts::blendScores()`, with RRF upstream and
      `post-process-reranker.ts` downstream. Recorded so a future session doesn't waste time
      looking for a file that isn't there.

## 1. BEST-FIT-SCORE-SEMANTICS-02 (DONE, 2026-09-03 — closed by two sessions working the same
file concurrently; see note below)

- [x] 1.1 In `okf-fit.ts`: rename `naive_bayes_score` → `heuristicPriorScore`,
      `logistic_regression_score` → `heuristicFitScore`, `fit_margin` → `heuristicFitMargin`.
      Keep the old snake_case fields as deprecated compatibility aliases (do not silently break
      OKF/HMM consumers) — mark them `@deprecated` and set from the new fields.
- [x] 1.2 Fix `classifyOkfFit()` to preserve `classifyDomainTaxonomy()`'s own `confidence`/
      `classifier_version` under distinct field names (`domainTaxonomyConfidence`/
      `domainTaxonomyRevision`) instead of being overwritten by the heuristic values
      (`heuristicFitScore`/`heuristicFitRevision`).
- [x] 1.3 DONE — `hmm-policy-bridge.ts`'s `OkfHmmPolicyEvidence` interface and its two
      independently hand-tuned formulas renamed to `heuristic_prior_score`/`heuristic_fit_score`/
      `heuristic_fit_margin` (different coefficients from okf-fit.ts's heuristic — confirmed a
      genuinely separate hand-written surface, not a duplicate). **Deliberately NOT renamed**:
      `PolicyStateInput.okf.{naiveBayesScore,logisticRegressionScore,fitMargin}` in
      `policy-types.ts`, consumed by `policy-router.ts`/`policy-state.ts` — a deeper, more
      load-bearing contract this pass did not audit; `withOkfHmmEvidence()`'s mapping into it was
      kept working as-is rather than risk a production policy-routing behavior change. Flagged for
      a future, separately-scoped pass, not silently left inconsistent.
- [x] 1.4 DONE — renamed the live `:8095` sklearn outputs in `miniforge_nlp_sidecar.py`'s
      `_classify_domain_pass()`'s `features_map` to `naive_bayes_domain_probability`/
      `logistic_regression_domain_probability` (old keys kept as deprecated aliases), and updated
      `domain-taxonomy-ml-bridge.ts` to prefer the new keys with a fallback chain to the old ones.
      **Scope correction**: `train_domain_classifier.py`, `ACPToolRegistry.ts`'s
      `nlp:classify_domain`, and `trace-mcp-server.ts`'s `domain.classify` do NOT hardcode these
      field names (verified by grep) — they pass `features`/`pass_results` through generically, so
      no changes were needed there; the original task text overstated this task's file list.
- [x] 1.5 Regression tests added in `okf-fit.spec.ts` (0.80/0.55 boundary, exact formula via
      alias-sync assertion, provenance-not-clobbered assertion) and `hmm-policy-bridge.spec.ts`
      updated for the new field names. Full suite: 7/7 passing, live-run.

**Process note**: this task was worked on by two sessions concurrently, editing the same files in
real time. One session added `OKF_FIT_SCORE_SEMANTICS`/`scoreSemantics` (an explicit
`{kind:'HEURISTIC', calibrated:false, probability:false, learnedModel:false}` marker on
`OkfFitResult` and the persisted `OKFDomainClassificationSchema`) on top of the other's rename —
found and fixed one real type error this produced (`score_semantics`'s Zod-inferred tuple type
didn't structurally match the `as const` readonly tuple in code; fixed by constructing an explicit
plain object instead of passing the readonly value through). Verified together: `npx tsgo --noEmit`
clean on every touched file, `okf-fit.spec.ts` + `hmm-policy-bridge.spec.ts` 7/7 passing.

No ranking, Graphify, lineage, or datastore behavior changed by this task. `okf-topic-ingestion.ts`'s
persisted `domain_classification.confidence`/`classifier_version` DID change meaning (now the real
domain-taxonomy values, not the heuristic fit score/OKF_FIT_VERSION) — this is the deliberate fix
for finding #2/#12, not an accidental regression; downstream readers of those two persisted fields
should be re-checked if any assumed the old (buggy) meaning.

## 2. RERANK-WEIGHT-BOUNDARY-01 (DONE, 2026-09-03)

- [x] 2.1 DONE — `candidate-scorer.ts::scoreCandidates()`'s `options.blendWeights` now runs through
      `BlendWeightsSchema.parse()` before use (`const weights = options.blendWeights ?
      BlendWeightsSchema.parse(options.blendWeights) : DEFAULT_BLEND_WEIGHTS`). Checked the other
      real `runtime-reranker.ts::blendScores()` call sites first (`canonical-rerank-executor.ts`'s
      3 call sites): all construct weights internally (either `this.blendWeights`, validated at
      the reranker class's own construction, or `{...DEFAULT_BLEND_WEIGHTS, crossEncoder: 0}`
      computed inline, always valid by construction) — none accept an external caller-supplied
      value unvalidated, so `scoreCandidates()` was the one genuine gap, not a symptom of a wider
      pattern. (Note: several *other*, unrelated local functions named `blendScores` exist
      elsewhere — `ace/search-router.ts`, `cross-ranker.ts`, `parallel-orchestrator.ts` — these do
      not use `BlendWeights`/`BlendWeightsSchema` at all and are out of this task's scope.)
- [x] 2.2 DONE — added 3 tests to `candidate-scorer.spec.ts`: rejects a non-1.0-summing
      `blendWeights` (`.rejects.toThrow()`), rejects an out-of-`[0,1]`-range weight, and confirms a
      valid weights object still scores correctly (`blendedScore` closely matches the expected
      single-signal weighted value). Verified no existing caller of `scoreCandidates()` supplies a
      hand-crafted `blendWeights` that would now break (`search-runtime.ts`'s `scorerOptions` is
      externally-injected and optional, defaults to `undefined`; the two other test files calling
      `scoreCandidates()` don't pass custom weights) — confirmed by grep before declaring this
      safe, not assumed. Full `candidate-scorer.spec.ts` suite: 13/13 passing, live-run.
      `npx tsgo --noEmit` clean on `candidate-scorer.ts`.

## 3. XGBOOST-RERANK-ACTIVATION-01 (CORRECTED EXECUTION PLAN — in progress, 2026-09-03)

**Superseded the original 3.1** ("give crossEncoder a non-zero weight for xgbScore"): that fix was
rejected before being applied. Two independent problems with it, both verified against live code/
receipts, not assumed: (1) the deployed sidecar's artifact is `objective: reg:squarederror`
(training receipt `NDCG@10=0.9624`, `MRR@10=0.9624`) with no probability calibration — a raw
regression prediction has no `[0,1]` semantics, so blending it as if it were a normalized signal
is a category error, and a future `rank:ndcg`/`rank:pairwise` artifact would be a ranking score,
not a probability, either. (2) the sidecar's feature vector (`cosine_score`, `bm25_rank_norm`,
`ann_turbovec_score`, `pagerank_score`, `domain_class_match`, `trace_score`, ...) already consumes
dense/bm25/graph/pagerank/domain as inputs — re-blending the model's own output against those same
signals in `blendScores()` double-counts evidence the model was trained to weigh itself.
Architecture instead: XGBoost is a **distinct fallback ranker** behind CrossEncoder (matches
`canonical-rerank-executor.ts`'s own docstring lifecycle: "attempt CrossEncoder" → "run XGBoost
fallback"), never a `crossEncoder`-weight blend input.

- [x] 3.1 XGBOOST-SCORE-CONTRACT-01 — DONE. `scripts/atlas/serve-xgboost-reranker.py`'s `/health`
      now reports `modelType`, `modelRevision` (sha256 of the loaded model file), `objective`
      (read from the booster's own config, not guessed), `featureSchemaRevision` (sha256 of the
      ordered `FEATURE_COLS` list), `scoreSemantics` (`REGRESSION_SCORE` | `RANKING_SCORE` |
      `UNKNOWN_SCORE_SEMANTICS`, derived from the objective prefix), and `calibrated: false`
      (always — this sidecar performs no probability calibration). `/score` returns `rawScores`
      (contract-correct name) with `scores` kept as a temporary compatibility alias, plus the same
      identity fields per-response. Fails closed (HTTP 409) on a caller-asserted
      `expectedFeatureSchemaRevision` mismatch, and fails closed (HTTP 500) on a row-count
      mismatch or any non-finite (NaN/Infinity) prediction — never silently returns a partial or
      poisoned score array.
- [x] 3.2 STOP ALIASING XGBOOST AS CROSS-ENCODER — DONE. `runtime-reranker.ts`'s
      `RerankCandidateSchema`/`RerankedCandidateSchema` gained dedicated
      `learnedRerankerRawScore`, `learnedRerankerScoreNormalized`,
      `learnedRerankerNormalizationKind` (only value so far: `QUERY_LOCAL_RANK_PERCENTILE`),
      `learnedRerankerModelRevision`, `learnedRerankerKind` (`xgboost` | `lightgbm`),
      `learnedRerankerCalibrated`, `learnedRerankerIsProbability` fields. `crossEncoderScore` /
      `crossEncoderScoreNormalized` are now written ONLY by the real cross-encoder path
      (`MixedbreadCanonicalReranker`) — `canonical-rerank-executor.ts`'s old
      `scoreWithXgboostSidecar()` (which wrote `crossEncoderScore: xgbScore` at the old
      lines 487-501 cited in finding 0.7) was deleted, not patched, and replaced by
      `computeLearnedRerankerOrder()` + `resolveLearnedRerankerFallback()`.
- [x] 3.3 EXECUTION MODE — DONE. `XGBOOST_RERANK_MODE` env var (`off` | `shadow` | `active`,
      resolved per-call — not memoized at module load, so it's testable and doesn't need a
      process restart to change), default `shadow`. `off`: sidecar never called. `shadow`: sidecar
      called, learned-reranker order computed, a `XGBOOST-SHADOW-EVAL-01` receipt emitted to
      Redis list `atlas:xgboost:shadow:receipts` (best-effort, non-fatal, capped at 5000 entries)
      — but the computed order is discarded, never affecting what's served. `active`: only
      meaningful once a shadow-eval gate passes (3.5 below, not yet run); the learned reranker's
      own order becomes the CrossEncoder-unavailable fallback ranking.
- [x] 3.4 XGBOOST IS THE FALLBACK RANKER, NOT A BLEND INPUT — DONE. In `active` mode, candidates
      are ranked directly by descending `learnedRerankerRawScore` (tie-break: `retrievedRank` then
      `packetKey`) — no `blendScores()` call against dense/bm25/graph/etc. `scoreMethod:
      'LEARNED_MODEL'` is set on every learned-reranker-ranked candidate (new
      `RerankerScoreMethod` vocabulary added to `runtime-reranker.ts`:
      `SIGNAL_BLEND | LEARNED_MODEL | CROSS_ENCODER | RETRIEVAL_ORDER_FALLBACK`, matching
      `BestFitScoreV1.baseRanking.scoreMethod` in task 4 below so the two contracts share one
      vocabulary; also back-filled onto `DeterministicReranker`, `MixedbreadCanonicalReranker`,
      `localFallbackRerank`, and `retrievalOrderFallback`'s existing outputs).
      `learnedRerankerScoreNormalized` is a query-local rank percentile
      (`1 - rankIndex/(n-1)`) used only for the `blendedScore` display/cache field — explicitly
      NOT a claim that the raw score is a `[0,1]` probability (`learnedRerankerCalibrated: false`,
      `learnedRerankerIsProbability: false` always set alongside it). Never named `fitScore`.
- [x] 3.4b Tests updated in `canonical-rerank-executor.spec.ts`: the two pre-existing tests that
      asserted the old always-active behavior now explicitly set
      `XGBOOST_RERANK_MODE=active`/restore it in a `finally`; a new test proves the `shadow`
      default calls the sidecar (for the receipt) but never lets `xgboost-sidecar` become
      `provenance.modelVersion`. Full suite: 17/17 passing (`canonical-rerank-executor.spec.ts` +
      `.test.ts`), `npx tsgo --noEmit` clean on all three touched files.
- [x] 3.5a XGBOOST-SHADOW-RECEIPT-V1 — DONE. `emitShadowReceipt()` rebuilt to carry BOTH sides
      of the comparison, not just the challenger: `baseline` (`scoreMethod`, `modelVersion`,
      `orderedPacketKeys` — computed via `localFallbackRerank()` BEFORE the learned-reranker path
      runs, so the receipt compares against the EXACT object that ends up served, not a
      recomputed stand-in) and `challenger` (`scoreMethod: 'LEARNED_MODEL'`, `modelRevision`,
      `modelKind`, `calibrated: false`, `isProbability: false`, `orderedPacketKeys`, per-candidate
      `rawScore`/rank). Added `evaluationPopulation: 'CROSS_ENCODER_FALLBACK_ELIGIBLE'` and
      `eligibilityReason` (`CROSS_ENCODER_ERROR | CROSS_ENCODER_TIMEOUT |
      CROSS_ENCODER_UNAVAILABLE | POLICY_SELECTED_SHADOW`, classified from the actual CrossEncoder
      failure message — `POLICY_SELECTED_SHADOW` has no live caller yet, reserved for a future
      non-error-driven shadow route) — fallback traffic is NOT representative of all Parent Atlas
      searches, and this tag is what lets a future consumer of these receipts know that.
      `servedOrderChecksum`/`baselineOrderChecksum`/`challengerOrderChecksum` added; a mismatch
      between the first two is logged loudly (never thrown — must not affect a request that
      already succeeded) as the cheap fail-closed proof that shadow inference never leaks into
      serving.
- [x] 3.5b Bounded Valkey Stream — DONE. Replaced the `LPUSH`/`LTRIM` list with
      `XADD atlas:xgboost:shadow:receipts:v1 MAXLEN ~ 10000 * schema ... requestId ...
      modelRevision ... featureRevision ... objective ... receipt <canonical-json>` — separate
      searchable fields alongside the full canonical receipt, matching the existing repo pattern
      (`yjs-provider.ts`, `token-map-service.ts`). `featureRevision`/`objective` are placeholder
      values (`'unversioned'`/`'unknown'`) until the sidecar's `/health` contract
      (XGBOOST-SCORE-CONTRACT-01) is plumbed all the way through to this receipt — flagged, not
      silently faked as real.
- [x] 3.5c XGBOOST-SHADOW-EVAL-01 — DONE (aggregator built; not yet run against real production
      traffic — no shadow receipts exist yet outside test fixtures). New, read-only
      `scripts/atlas/evaluate-xgboost-shadow-receipts.mjs`: `XREVRANGE`s the stream, computes
      top1Changed rate, top3/top10 overlap, Spearman's rho, `servedOrderIntegrityOk` (must be
      100% — any violation is a real bug, not noise), and an `eligibilityReason` breakdown.
      Deliberately emits `promotionVerdict: null` — this script is evidence for
      XGBOOST-PROMOTION-POLICY-01 to consume, never a promotion decision by itself. Never writes
      to the stream, never touches `XGBOOST_RERANK_MODE`.
- [x] 3.5d Tests — DONE. `canonical-rerank-executor.spec.ts`'s shadow-mode test updated: mocks
      `redis.xadd` (not `lpush`/`ltrim`), asserts the stream key/`MAXLEN ~ 10000` args, and parses
      the `receipt` field to check `schema`, `evaluationPopulation`, `eligibilityReason`,
      `servedOrderChecksum === baselineOrderChecksum`, and `challenger.scoreMethod ===
      'LEARNED_MODEL'`. Also fixed a real (if benign) bug found while doing this: 3 tests'
      `finally { process.env.XGBOOST_RERANK_MODE = previousMode }` assigned literal JS `undefined`
      when no prior value existed, which Node coerces to the STRING `"undefined"` — leaked a
      confusing (harmless, since `resolveXgboostRerankMode()` falls back to `'shadow'` on any
      unrecognized value) warning into every later test in the file. Fixed to `delete
      process.env.XGBOOST_RERANK_MODE` when `previousMode === undefined`. Full suite: 17/17
      passing, `npx tsgo --noEmit` clean project-wide (3.4b full unfiltered run — the 88
      pre-existing errors it surfaced elsewhere, e.g. missing `fastmcp`/`piper-wasm`/
      `@playwright/test` and unrelated `QdrantClient` type mismatches, are all confirmed
      pre-existing and untouched by this task).
- [x] 3.6a XGBOOST-OBJECTIVE-METRIC-ALIGNMENT-01 — DONE, live-verified in
      `scripts/atlas/train-xgboost-reranker.py`. **The qid/group blocker below was already
      resolved before this task started** — verified live: `train_xgboost()` already accepts
      `qid_train`/`qid_val` and calls `dtrain.set_info(qid=...)`/`dval.set_info(qid=...)` when a
      ranking objective is selected, fed by `split_rows_by_trace()` → `build_ranking_dataset()` →
      `prepare_grouped_ranking_dataset_v1()`. What was NOT yet fixed, and now is: the training
      `eval_metric` was hardcoded to `'rmse'` even for `rank:ndcg`/`rank:pairwise` runs — a
      LambdaMART objective judged by RMSE during training/early-stopping is not a fair comparison
      basis. Now: `eval_metric = ['ndcg@5', 'ndcg@10']` + `lambdarank_pair_method = 'topk'` +
      `lambdarank_num_pair_per_sample = 10` for ranking objectives (topk/10 targets NDCG@10, the
      same pattern XGBoost's own docs use for an NDCG@6 target with num_pair_per_sample=6);
      `eval_metric = 'rmse'` unchanged for `reg:squarederror`. The FINAL ranking evaluation
      (`evaluate_ranking()`, replacing `evaluate_ndcg()` as the primary path — old name kept as a
      backward-compatible wrapper) now always reports NDCG@5, NDCG@10, and MRR@10 regardless of
      training objective, PLUS per-trace metrics (not just the aggregate) so a future comparison
      can catch a challenger that improves the average while damaging a query subset. Live-verified
      both objectives end-to-end on the real 101,708-row/930-trace corpus (CPU device, to avoid a
      GPU dependency in the smoke test): `reg:squarederror` → NDCG@10=0.9516; `rank:ndcg` →
      NDCG@10=0.9516 (see 3.6b candidate outputs for the actual model files this produced).
      **Second real bug found and fixed during this live verification, not caught by reading the
      code alone**: `rank:ndcg`'s default gain function (`ndcg_exp_gain=True`, i.e. `2^label - 1`)
      requires an integer relevance grade and failed closed with `XGBoostError: ... label must be
      either 0 or positive integer` against this corpus's real `label` column, which is a
      continuous `[0,1]` float, not a discrete grade. Fixed per XGBoost's own documented guidance
      for this exact case ("Adjust this parameter is required when...the label is not a discrete
      grade"): added `ndcg_exp_gain: False` for ranking objectives, which uses the raw label value
      directly as gain. Confirmed via a full re-run: `rank:ndcg` now trains and evaluates cleanly
      end-to-end on the real corpus (xgboost 3.2.0).
- [x] 3.6b Immutable candidate outputs — DONE. Added `models/xgboost-candidates/` +
      `--promote` flag (default `false`). Without `--promote` (now the default for every
      invocation, including the previously-documented plain `python train-xgboost-reranker.py`
      usage): the trained model saves ONLY to
      `models/xgboost-candidates/<objective-slug>-<datasetRev>-<modelRev>.ubj` (dataset/model
      revisions are sha256-derived, content-addressed — `dataset_rev` from the feature CSV's
      bytes, `model_rev` from the saved model file's own bytes) and the report saves ONLY to
      `docs/reports/xgboost-objective-<slug>-<modelRev>.json`; `models/xgboost-reranker.ubj` and
      `docs/reports/xgboost-training-report.json` (what the live sidecar and dev server default
      to) are never touched. With `--promote`: the candidate file is additionally copied to the
      canonical path and the canonical report is additionally written — an explicit, separate,
      logged step (`PROMOTED: <path>`), never implicit. Graph-manifest invalidation
      (`_invalidate_graph_manifest`) now fires only on an actual promotion, not on every candidate
      run — it was previously firing on every gate-pass regardless of whether the canonical model
      changed, which was itself a latent correctness bug this task's re-plumbing exposed and fixed.
      **Live-verified, not just read**: ran a real (non-dry-run) `reg:squarederror` training pass
      before and after — confirmed via `md5sum` that `models/xgboost-reranker.ubj`'s checksum
      (`bf9f48c068ca0f93fed5a84b7da564fb`) was byte-identical before and after the run, while a new
      candidate file (`reg-squarederror-f40d36559bfcd65b-6fa8f826aebfc58f.ubj`) and candidate
      report (`docs/reports/xgboost-objective-reg-squarederror-6fa8f826aebfc58f.json`, `promoted:
      false`) were created. This directly satisfies "do not activate globally and do not overwrite
      the current xgboost-reranker.ubj."
- [ ] 3.6c XGBOOST-OBJECTIVE-COMPARE-01 (not started — the actual frozen reg:squarederror vs
      rank:ndcg comparison run + report). 3.6a/3.6b are prerequisites for this, not this task
      itself — deliberately stopped here per explicit instruction not to proceed into the
      comparison in this pass.
- [ ] 3.7 Update `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s `XGBOOST-RERANKER-EVAL-01`
      gate to reference this task and its distinct scope (future training-eval vs. this session's
      already-deployed-path bug, now fixed) before that gate starts.
- [ ] 3.8 XGBOOST-PROMOTION-POLICY-01 (not started) — freeze `XgboostPromotionPolicyV1` semantics
      (candidateSetIdentical, featureSchemaMatched, predictionCountMatched, finitePredictions,
      deterministicReplay, primaryMetric=NDCG_AT_10, noStatisticallyCredibleRegression,
      modelRevisionRequired, datasetRevisionRequired, automaticPromotion=false, shadowRequired=true,
      canaryRequired=true) BEFORE looking at 3.6c's comparison results — do not freeze a numeric
      regression threshold (e.g. "NDCG must improve 3%") until real labeled-query variance is known.
- [ ] 3.9 XGBOOST-CANARY-01 (not started) — deterministic bucketing (`hash(requestId) % 10000 <
      configuredBasisPoints`, never `Math.random()`, so replay is reproducible), staged 1% → 5% →
      10% rollout, one-switch rollback (`XGBOOST_RERANK_MODE=shadow`, no model mutation required).
- [x] 3.8 Phase-lane registry reconciliation — checked, no change needed.
      `sveltekit-frontend/src/lib/server/atlas/phase-lane-registry.ts:264-277` (phase 18, "XGBoost
      / gradient tree boosting reranker") already correctly says `status: 'partial'`, `nextGate:
      'keep the reranker as a mock-only evaluation surface'`. This task does not contradict that:
      default mode is `shadow`, not `active` — no production promotion is being claimed by 3.1-3.4,
      so the registry's mock-only characterization stays accurate. Do not flip it to
      `'implemented'` until 3.5 passes and `XGBOOST_RERANK_MODE=active` is actually deployed
      somewhere.

## 4. BestFitScoreV1 contract (designed, NOT implemented)

Full contract shape (component objects, provenance axes, calibration block) recorded in
`proposal.md`'s design notes are captured verbatim from the audit below for implementation
reference once tasks 1-3 close:

```
BestFitScoreV1 {
  schema: 'atlas.best-fit-score.v1'
  queryId, candidateOrdinal, canonicalId, packetKey
  fitScore                 // 0..1 calibrated relevance — NEVER set equal to blendedScore
  fitDecision              // EXCELLENT | GOOD | REVIEW | WEAK — owned by calibration policy,
                            // do NOT copy OKF's 0.80/0.55 heuristic thresholds here
  calibration: { calibrationRevision, labelDefinitionRevision, decisionPolicyRevision }
  baseRanking: { rrfScore, rrfRank, rerankerScore, rerankerRank, rerankerRevision, scoreMethod }
    // scoreMethod: SIGNAL_BLEND | RANK_FUSION_FALLBACK | LEARNED_MODEL | RETRIEVAL_ORDER_FALLBACK
  components: { lexical, semantic, ast, compilerSemantic, graph, pagerank, codePrior,
                domainProbability, concept, citationAuthority, freshness, versionMatch, crossEncoder }
    // each ideally a ScoreComponentV1: { value, available, semanticKind, producerRevision,
    //   evidenceRefs[], configuredWeight?, effectiveWeight? }
  provenance: { workspaceRevision, sourceRevision, graphRevision, representationRevision,
                candidateSnapshotRevision, featureRevision, retrievalPolicyRevision,
                queryEvidencePolicyRevision, conceptRegistryRevision, rankerRevision,
                calibrationRevision }
  evidenceRefs[]
}
```

Prerequisite before any `fitScore` is emitted: `BEST-FIT-CALIBRATION-01` needs real reviewed
`(query, candidate, relevant=0|1)` labels and a frozen calibrator. Before that, the correct
intermediate artifact is `BestFitFeatureV1`/`CandidateFitExplanationV1` (reranker output + evidence
features, no calibrated score claim).

## 5. Downstream sequence (per BEST-FIT-SCORE-AUDIT-01's own recommendation, not started)

Tasks 1-3 above, then: `QUERY-EVIDENCE-POLICY-01` → `EXTERNAL-EVIDENCE-V1` →
`CONCEPT-RECOGNITION-01` (cross-reference `parent-atlas-ontology-kernel`'s concept fabric work —
`entity-concept-taxonomy-v1.ts` — before starting; do not build a third concept-recognition owner)
→ `BEST-FIT-FEATURE-V1` → `BEST-FIT-CALIBRATION-01`.
