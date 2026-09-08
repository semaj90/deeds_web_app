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
- [ ] 3.6c XGBOOST-OBJECTIVE-COMPARE-01 remains open. Added the read-only comparison gate
      `scripts/atlas/compare-xgboost-objectives-v1.py` and ran it against the two existing,
      immutable candidates. Both reports share dataset revision `f40d36559bfcd65b`, the same
      feature-schema state, finite aggregate/per-trace metrics, and 42 overlapping traces, but
      they do **not** represent one frozen validation cohort: 144 trace IDs are unique to each
      report and validation rows differ (`19,844` vs `20,199`). The audit therefore emits
      `BLOCKED_NON_IDENTICAL_VALIDATION_COHORT`, keeps `promotionAllowed=false`, and records
      overlap metrics only as diagnostics (rank-minus-regression delta `0.0` on all three
      metrics). Report: `docs/reports/xgboost-objective-compare-v1.json`. To close this task,
      persist one deterministic train/validation split and rerun both objectives against that
      exact cohort; do not select an objective or promote either artifact from the current
      reports.
- [x] 3.7 **Confirmed already satisfied (2026-09-05) — no new edit needed.**
      `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s `XGBOOST-RERANKER-EVAL-01` gate
      already carries a `BEST-FIT-SCORE-AUDIT-01` cross-reference (dated 2026-09-03, predating this
      re-check) that correctly distinguishes the future `CandidateFeatureMatrixV1` training/eval
      path from the already-deployed `canonical-rerank-executor.ts:487-501` path, and explicitly
      names this fabric change's `XGBOOST-RERANK-ACTIVATION-01` (task 3) as the place that must
      resolve the `crossEncoder: 0` intent question before that gate starts. No further edit
      required — re-read it to confirm it still matches this task's request rather than assuming.
- [x] 3.8 XGBOOST-PROMOTION-POLICY-01 — frozen as a checksum-bound, read-only
      `XgboostPromotionPolicyV1` contract in
      `sveltekit-frontend/src/lib/server/retrieval/xgboost-promotion-policy-v1.ts`, with focused
      tests. It requires candidate-set identity, feature-schema match, prediction-count match,
      finite predictions, deterministic replay, `primaryMetric=NDCG_AT_10`, no statistically
      credible regression, model/dataset revisions, `shadowRequired=true`, and
      `canaryRequired=true`; `automaticPromotion=false` is enforced by schema. The review helper
      can return only `READY_FOR_EXPLICIT_REVIEW` or `BLOCKED` and always reports
      `promotionAllowed=false`; it does not choose a canary, change `XGBOOST_RERANK_MODE`, or
      write artifacts. No numeric regression threshold is frozen until real labeled-query variance
      is known.
      The remaining canary task is intentionally separate.
      (candidateSetIdentical, featureSchemaMatched, predictionCountMatched, finitePredictions,
      deterministicReplay, primaryMetric=NDCG_AT_10, noStatisticallyCredibleRegression,
      modelRevisionRequired, datasetRevisionRequired, automaticPromotion=false, shadowRequired=true,
      canaryRequired=true) BEFORE looking at 3.6c's comparison results — do not freeze a numeric
      regression threshold (e.g. "NDCG must improve 3%") until real labeled-query variance is known.
- [x] 3.9 XGBOOST-CANARY-01 — frozen as a checksum-bound, pure canary plan and assignment
      contract in `sveltekit-frontend/src/lib/server/retrieval/xgboost-canary-v1.ts`. Assignment
      uses `sha256(requestId)` modulo 10,000, supports only disabled/1%/5%/10% stages, binds model
      and dataset revisions, and records rollback as `shadow`. Focused tests prove replay stability,
      stage/basis-point validation, tamper rejection, and disabled-stage exclusion. The adapter never
      changes `XGBOOST_RERANK_MODE`, writes impressions/artifacts, or performs a model rollout; live
      canary execution remains separately unauthorized.
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

## 6. ORNITH-CROSS-RANKER-CHALLENGER-01 (EVALUATION-ONLY DECISION, 2026-09-06)

This is an additive evaluation decision under the existing best-fit/rerank owner. It does not
create a second reranker, fusion owner, semantic lane, cache identity, or model-serving profile.

- [x] Owner and role classified. EmbeddingGemma remains the canonical first-stage bi-encoder and
      `semantic_768` producer. `MixedbreadCanonicalReranker`/the configured dedicated CrossEncoder
      remains the current second-stage production reranker. SearchRuntime remains the sole fusion
      owner and physical semantic executors remain one logical semantic lane/one vote.
- [x] Ornith runtime identity verified read-only through the local `/v1/models` endpoint as
      `ornith-1.5-9b`. No live completion, model installation, cache write, or serving-profile
      change was performed for this decision.
- [x] Legacy boundary checked. `sveltekit-frontend/src/lib/server/retrieval/cross-ranker.ts`
      exposes a separate `executeUnifiedCrossRanking()` implementation that directly persists to
      `semantic_top_k`/`retrieval_decision_log`; no current source call sites were found. It is not
      a production SearchRuntime owner and must not receive Ornith wiring or become a second fusion
      path. Any retirement or archival decision belongs to the retrieval-fusion owner.
- [x] Fixture-only comparison contract implemented in
      `sveltekit-frontend/src/lib/server/retrieval/rerank-shadow-evaluation-v1.ts` with focused
      tests in `rerank-shadow-evaluation-v1.spec.ts`. It validates a shared bounded candidate
      population, canonical identity/source revisions, deterministic candidate/order checksums,
      served-order integrity, optional reviewed-label NDCG@10/MRR@10, top-K overlap, rank
      displacement, and resource deltas. It has no model, network, cache, or datastore dependency.
- [x] Mixedbread sidecar contract hardened on 2026-09-06. The request now binds the selected
      model ID, the response must echo that exact model ID and contain one finite normalized score
      for every requested position, and malformed/duplicate/unknown rows fail closed instead of
      becoming implicit zero scores. `scripts/reranker-sidecar.py` applies sigmoid once to the
      mxbai ranking logits so the HTTP score contract is bounded `[0,1]`; the TypeScript adapter
      and focused tests cover order restoration and request identity. This proves the adapter
      contract only; it does not prove that the live sidecar is loaded or production-authorized.
-     **Live health reconciliation 2026-09-06:** `GET http://127.0.0.1:8099/health` currently
      reports `healthy`, `model_loaded=true`, `device=cuda`, the expected mxbai model ID,
      `max_length=512`, and current VRAM, but the running process omits the newer
      `model_dtype`, `score_semantics`, and `score_range` fields that are present in the
      checked-in sidecar source. Treat this as a stale-process/version-drift observation;
      do not claim live normalization metadata until the sidecar is restarted under an
      explicitly authorized service operation. No restart was performed in this task.
- [ ] Freeze a read-only shadow comparison over the same revision-qualified post-fusion candidate
      set (bounded to at most 12 candidates), preserving `CandidateOrdinal`/canonical identity,
      source revisions, and the candidate-set checksum for every arm: current dedicated
      CrossEncoder baseline, any dedicated reranker challenger, and Ornith judge/challenger.
-     **Live fixture observation 2026-09-06:** `scripts/atlas/rerank-shadow-01-harness.mjs`
      reached the mxbai sidecar (`mixedbread-ai/mxbai-rerank-base-v2`, CUDA-loaded) and
      emitted `docs/reports/rerank-shadow-01-live-fixture-v1.json`. On the three-query,
      hand-labeled fixture, mxbai measured top-1 agreement `1/3`, MRR `0.50`, and Recall@3
      `1/3`; this is fixture evidence only because candidates are not yet a
      revision-qualified post-fusion cohort.
- [ ] Compare Recall@K/MRR/NDCG@10, top-1 agreement, top-K overlap, rank displacement, latency,
      token use, GPU memory, failures, and evidence-identity preservation. Emit an evaluation
      receipt; do not change served order, SearchRuntime fusion, cache keys, or promotion state.
- [x] Promotion boundary frozen: do not promote Ornith to the canonical reranker based on model
      family, Qwen lineage, or a single qualitative result. If a purpose-trained reranker is
      required, evaluate it first as a dedicated challenger; Ornith remains an optional expensive
      judge/listwise shadow lane.

Gate prerequisites: the RF6 live replay/candidate identity bridge and an explicit bounded live
evaluation authorization. Until both exist, this is `UNVERIFIED`, not production reranker
readiness. No new OpenSpec change is warranted.

## 7. AtlasGemmaMicro / REAP research boundary (2026-09-06)

The proposed `AtlasGemmaMicro` is a future model-research artifact, not a
current production reranker or a new fusion owner. The repository currently
contains MTP assistant configuration (`MTP_DRAFT_MODEL`) but no proven
standalone Gemma-derived checkpoint, detached token-embedding forward path,
multi-head output contract, teacher corpus, or real REAP expert-pruning run.
The configured assistant must therefore remain target-activation/KV-coupled
compatibility machinery until its forward contract is independently verified.

- [x] Ownership boundary recorded: EmbeddingGemma remains the canonical
      `semantic_768` producer; mxbai/Mixedbread remains the dedicated
      CrossEncoder owner; SearchRuntime remains the single fusion owner;
      Ornith remains synthesis/judge-only; any future micro-model is a
      revisioned challenger behind this change.
- [x] MICRO-01 Freeze a standalone-vs-target-coupled checkpoint receipt,
      including model/config/tokenizer/template revisions and a checksum. The
      read-only inventory `python/atlas_gemma_rank_checkpoint_inventory_v1.py`
      inspected `models/gemma4_assistant_huggingface_7_3_26` and emitted
      `docs/reports/atlas-gemma-rank-checkpoint-inventory-v1.json` with
      `tensorCount=50`, `status=BLOCKED_TARGET_COUPLED_ASSISTANT`,
      `num_key_value_heads=2`, `num_kv_shared_layers=4`,
      `use_bidirectional_attention=null`, and twelve missing standalone
      attention tensors: eight K/V projection weights plus four trainable KNorm
      weights. The config-derived plan is three sliding layers with K/V
      `[512,256]` and KNorm `[256]`, followed by one full layer with K/V
      `[1024,256]` and KNorm `[512]`; no shape mismatches were observed. The
      inspected SafeTensors file is 159,138,208 bytes with SHA-256
      `sha256:12875062fc25c51e8fa9b62abd2de7ad48b7d63f8559d5d604fbd5a3d6bcff16`.
      The refreshed receipt checksum is
      `sha256:07043690893f46b09bda55ff5aec579edcf5609082b4885f685d5e599f4b01a6`.
      A target-activation assistant cannot be relabeled as a standalone model.
- [x] AGMR-02 Derive and validate the no-training standalone shape contract without
      using `Gemma4AssistantConfig` or mutating the upstream `config.json`.
      `python/atlas_gemma_rank_standalone_shape_proof_v1.py` emits
      `docs/reports/atlas-gemma-rank-standalone-shape-proof-v1.json` with custom
      `model_type=atlas_gemma_rank`, `num_kv_shared_layers=0`,
      `use_bidirectional_attention=all`, `use_cache=false`, a scalar rank head,
      and config-derived K/V/KNorm shapes. The test fixture has six expected
      attention tensors and the real four-layer checkpoint has twelve expected
      new attention tensors; no training, CUDA allocation, or weight mutation is
      performed. This proves the derived shape/config contract, not forward-pass
      compatibility or embedding-row alignment. A separate read-only in-memory
      construction smoke on 2026-09-06 used Transformers 5.5 and instantiated
      `Gemma4ForCausalLM` with the derived config: four K projections, four V
      projections, and four KNorm tensors were present, with
      `weightsLoaded=false` and `weightsMutated=false`. This proves native
      class construction only; it does not prove checkpoint loading, forward
      compatibility, or ranking quality.
- [x] AGMR-03 Define the exact inherited-tensor allow-list and alignment plan without
      initializing weights or allocating CUDA memory. `python/atlas_gemma_rank_tensor_alignment_proof_v1.py`
      verifies the real checkpoint's 46 inherited tensors, excludes the four
      target-coupled projection/centroid tensors, derives all matrix shapes from
      the layer configuration, records BF16 source dtype, checks conservative
      8-wide GEMM dimension alignment, and records the existing mxbai
      `sigmoid_once` score contract. The receipt explicitly reports
      `cudaAllocated=false`, `gemmExecuted=false`, and `weightsMutated=false`.
      This proves tensor/shape alignment only; it does not prove a forward pass,
      ordered-embedding alignment, or RTX runtime performance.
      A read-only native-class compatibility smoke on 2026-09-06 constructed
      `Gemma4ForCausalLM` from the derived config and found 46 exact
      checkpoint-name/shape matches, zero shape mismatches, and 13 model-only
      tensors (the twelve standalone attention tensors plus the future rank
      head). No checkpoint tensors were loaded or written; this is compatibility
      evidence, not a standalone checkpoint or forward-pass proof.
      Loader note: the multimodal `Gemma4Model(Gemma4Config(...))` path places
      the text tensors below a `language_model.` prefix and therefore has zero
      direct checkpoint-name matches. A future loader must either use the
      text-only `Gemma4ForCausalLM` boundary or declare and test an explicit,
      checksum-bound prefix mapping; it must not silently rely on partial
      `strict=False` loading.
      A separate bounded CUDA smoke on 2026-09-06 verified only that the host can
      execute a finite FP16 `[1024,256] @ [256,1]` GEMM on an NVIDIA GeForce RTX
      3060 Ti (compute capability 8.6, Torch CUDA 12.8); it did not load the
      checkpoint or claim model-forward compatibility.
- [x] AGMR-04 Prove isolated in-memory inherited loading and new-tensor
      initialization without producing a model artifact. `python/atlas_gemma_rank_load_init_proof_v1.py`
      uses the text-only `Gemma4ForCausalLM` boundary, removes the unused
      vocabulary head, loads 46 exact inherited checkpoint tensors, initializes
      the 12 K/V/KNorm tensors and a separate scalar rank head in BF16, and
      verifies finite values, zero shape mismatches, and unchanged source
      SafeTensors checksum. It emits
      `docs/reports/atlas-gemma-rank-load-init-proof-v1.json` with
      `status=LOAD_INIT_IN_MEMORY_PROVEN`, `forwardExecuted=false`,
      `trainingPerformed=false`, and `checkpointMutated=false`. This does not
      prove ordered-token embedding alignment, model forward quality, or adapter
      compatibility.
- [x] AGMR-05 Run a bounded synthetic forward smoke after AGMR-04. The
      read-only `python/atlas_gemma_rank_forward_smoke_v1.py` loads the same 46
      inherited tensors, initializes the 12 standalone attention tensors and
      scalar rank head in memory, and produces finite BF16 hidden states with
      shape `[1,5,256]` plus a finite scalar score with shape `[1,1]`. It emits
      `docs/reports/atlas-gemma-rank-forward-smoke-v1.json` with
      `status=FORWARD_SHAPE_FINITE_PROVEN`, `forwardExecuted=true`,
      `deterministicCpuForwardProven=true`, `rankingQualityProven=false`, and
      `checkpointMutated=false`; the same in-memory model and synthetic token
      sequence now produce bit-exact hidden states and scores on a repeated CPU
      pass. The input remains synthetic; this does not prove tokenizer target
      compatibility, relevance quality, mxbai parity, CUDA forward behavior, or
      production readiness.
- [x] AGMR-06 (2026-09-06, operator request: "breadth test 50 queries AtlasGemmaRankV1") — real
      tokenizer breadth/stability test, closing part of AGMR-04/05's flagged tokenizer-alignment
      gap. New `python/atlas_gemma_rank_breadth_50_v1.py`: loads the same 46 inherited tensors +
      12 standalone attention tensors as AGMR-05, but replaces AGMR-05's single synthetic token
      sequence with the checkpoint's REAL tokenizer (`PreTrainedTokenizerFast` over the checkpoint's
      own `tokenizer.json`) run against 51 real, diverse strings drawn from this session's own work
      (TypeScript/Python/prose, lengths 25-160 chars — not fabricated placeholder text). Result
      (`docs/reports/atlas-gemma-rank-breadth-50-v1.json`): `status=BREADTH_STABILITY_PROVEN`,
      `allFinite=true` across all 51 real-tokenized forward passes, 46/46 inherited tensors loaded
      each run, checksum unchanged before/after (`checkpointMutated=false`), CPU-only
      (`cudaAllocated=false`), latency 6.8-29.9ms/query (mean 10.8ms) on CPU. **This is a breadth/
      stability proof, NOT a rank-quality evaluation** — `rankHeadTrained=false`,
      `rankingQualityProven=false` — the scalar rank head is still Xavier-random-initialized
      (never trained), so raw scores (observed range -25.0 to 29.75, mean 5.4) are diagnostic only
      and carry no relevance meaning. What this proves: the real tokenizer + standalone backbone
      combination is numerically stable across genuinely varied real text, not just one synthetic
      sequence — closing the "does this survive real input diversity" question independent of
      whether the (still-untrained) head's output means anything. Query count is 51, not exactly 50
      — an off-by-one in the fixture list, not corrected by re-running since it doesn't change the
      result's validity. `MICRO-03`/`MICRO-04` (teacher receipts, real shadow rank-quality
      evaluation against mxbai) remain the actual next gates for a meaningful quality claim.
- [x] AGMR-07 (2026-09-07) Downloaded and independently verified a second AGMR donor candidate
      ("donor B"): `google/gemma-4-E4B-it-qat-q4_0-unquantized-assistant`. Confirmed the HF repo
      genuinely existed via its own API (`?blobs=true`) *before* downloading — matched the claimed
      159,138,208-byte size and sha256 exactly. Downloaded to `models/gemma4-e4b-qat-assistant-
      2026-07-20/` (gitignored like donor A, `rg --no-ignore`-searchable), re-computed `sha256sum`
      locally, matches the HF API's reported hash. Donor A (`models/gemma4_assistant_huggingface_
      7_3_26/`) was never touched or modified. Registered in `models/model-manifest.json`
      (`gemma4-e4b-qat-assistant-donor-b`, `canonical: false`). Manually parsed the safetensors
      binary header (no dependency) and confirmed all 50 tensor names/shapes/dtypes match donor A
      exactly — same architecture, different trained weight values (different hash), consistent
      with a genuine QAT fine-tune. `tokenizer.json` is byte-identical to donor A's (shared vocab).
      Full inventory: `docs/reports/atlas-gemma-rank-checkpoint-inventory-donor-b-v1.json`.
- [x] AGMR-08 (2026-09-07) Ran the existing, completely unmodified
      `atlas_gemma_rank_standalone_init_export_v1.py` against donor B (`--seed 17`, same seed as
      donor A for comparability), output to a new sibling directory
      `models/atlas-gemma-rank-v1-donor-b/standalone-init-bf16/`. Result: `shapeMismatches: []`
      (zero), identical tensor-count structure to donor A (60 exported = 46 inherited + 12 new
      standalone-attention + 2 rank-head, confirmed by name in `rankHeadTensorNames`), identical
      `derivedConfig`. `forwardExecuted=false`, `trainingPerformed=false` — correctly conservative.
- [x] AGMR-09 (2026-09-07) Ran `atlas_gemma_rank_cuda_forward_probe_v1.py` (found the actual
      execution environment first — `/home/james/.venvs/atlas-cutile-cu132/`, `torch 2.14.0+cu132`,
      `transformers 5.5.0`, CUDA available — rather than assuming one) against donor B's *original*
      checkpoint dir (the script reconstructs the standalone model in-process from the raw
      checkpoint; pointing it at the already-exported standalone-init dir fails with
      `TEXT_CONFIG_MISSING`, confirmed by cross-checking donor A's own prior invocation). Result:
      `status=CUDA_BF16_FORWARD_FINITE_ORDER_PROVEN_PARITY_OPEN`, same category as donor A
      (`absoluteMaxDelta` 0.406 for B vs 0.3125 for A — same non-parity classification, not a red
      flag). Receipt: `docs/reports/atlas-gemma-rank-cuda-forward-donor-b-v1.json`.
- [x] AGMR-10 (2026-09-07) Added an additive `--attention-backend {auto,math}` flag to
      `atlas_gemma_rank_cuda_forward_probe_v1.py` (default `auto` preserves all prior receipts'
      behavior exactly — regression-verified against donor A's existing receipt, byte-identical
      `absoluteMaxDelta`). `math` pins PyTorch's SDPA to the reference math kernel via
      `torch.nn.attention.sdpa_kernel`. Real result for both donors: MATH mode did **not** improve
      CPU/GPU parity — larger deltas for both (A: 0.625, B: 1.0), and for donor A specifically
      flipped `rankingOrderAgreement` to `false` (status `BLOCKED_CUDA_BF16_FORWARD_PARITY`).
      Honest finding, not a defect: `cpuRepeatExact`/`gpuRepeatExact` stayed `true` under MATH for
      both (each device internally deterministic); only cross-device agreement got worse, most
      likely because the rank head is still Xavier-random/untrained on a tiny 3-row fixture where
      near-tied scores flip order easily. MATH-backend pinning as a reproducibility oracle needs a
      trained head or a less noise-sensitive fixture before it says anything meaningful. Receipts:
      `docs/reports/atlas-gemma-rank-cuda-forward-donor-{a,b}-math-v1.json`.
- [x] AGMR-11 (2026-09-07) Ran `atlas_gemma_rank_ordered_embedding_alignment_proof_v1.py`
      unmodified against donor B. Result identical to donor A:
      `status=ORDERED_EMBEDDING_PERMUTATION_PROVEN_TARGET_ALIGNMENT_OPEN`, same
      `embeddingShape [262144,256]`, `permutationRoundTrip=true`. Expected (shared tokenizer, so
      identical local-permutation mechanics) — `canonicalTargetAlignmentProven` stays `false` for
      both donors, blocked on the same still-missing canonical target-embedding reference, not a
      donor-specific gap. Receipt: `docs/reports/atlas-gemma-rank-ordered-embedding-alignment-
      proof-donor-b-v1.json`.
- [x] AGMR-12 (2026-09-07) Direct donor-A-vs-donor-B forward-output comparison, built from the two
      existing `auto`-mode receipts (identical fixture, no rerun needed). Confirmed
      `inputIdsMatch=true`/`outputShapeMatch=true` before comparing. Real result:
      `cpuAbsMaxDelta=18.0`, `gpuAbsMaxDelta=18.2`, ranking order differs between donors on both
      devices — expected and not evaluated as pass/fail, since different pretrained weights
      feeding a still-untrained rank head are not expected to agree. **No promotion decision made
      or implied.** Receipt: `docs/reports/atlas-gemma-rank-donor-ab-forward-comparison-v1.json`.
      Real quality comparison still requires a trained rank head and the existing mxbai teacher
      corpus (`MICRO-03`/`MICRO-04`), neither touched by AGMR-07..12.
- [x] AGMR-13 (2026-09-07) Ran the existing, completely unmodified `atlas_gemma_rank_micro05_
      train_smoke_v1.py` (CPU-only, float32, self-identification margin-ranking-loss smoke) against
      donor B's original checkpoint dir, mirroring donor A's pre-existing `MICRO-05` train-smoke
      receipt so both donors sit at the same proof-ladder depth. Real result:
      `status=TRAIN_LOOP_MECHANICALLY_PROVEN`, loss `6.499→0.0` (converged by step 3, vs donor A's
      step 5), `finalCorrectRankingCount=10/10`, `backboneUnmutatedOnDisk=true` (checksum before
      load / after load / after training all equal donor B's real hash
      `9d0e2053067590cae9a8f4fcc57eefbe20dff90599360458ebd451e5cb5c947d` — backbone genuinely
      frozen, only the Xavier-initialized rank head trained). Same caveat as donor A's original
      receipt applies unchanged: this is a trivial near-string-match task on 10 pairs, proves the
      training *mechanism* works end-to-end (forward + margin loss + backward + optimizer step),
      not real cross-document ranking quality — `rankingQualityProven` stays `false` for both
      donors. Receipt: `docs/reports/atlas-gemma-rank-micro05-train-smoke-donor-b-v1.json`.
- [x] AGMR-03A Record the precision boundary for the existing runtime. The live
      `:8090` Ornith process is a separate GGUF inference profile using CUDA
      offload, Flash Attention, and `q8_0/q8_0` KV-cache types; `-ctk`/`-ctv`
      select KV-cache storage and do not convert model weights to INT8. The
      live `:8081` EmbeddingGemma process remains the separate FP16 embedding
      lane. The mxbai `:8099` sidecar loads its CUDA model in FP16 and exposes
      the already-frozen `sigmoid_once(raw_ranking_logit)` score contract;
      its health response now reports `model_dtype`, score semantics, and
      score range explicitly. Upstream stock llama-server names are `-fa` /
      `--flash-attn`, `-ctk` / `--cache-type-k`, `-ctv` / `--cache-type-v`,
      `-ngl` / `--n-gpu-layers`, `-b` / `--batch-size`, `-ub` /
      `--ubatch-size`, `--cache-prompt`, and `--cache-reuse`.
      This is a contract/documentation proof only; no live process was
      restarted and no model, cache, datastore, or projection was changed.
- [ ] AGMR-03B Run a separate FP16-versus-INT8 precision parity benchmark
      before any INT8 promotion. A valid INT8 candidate must be an explicit
      quantized model or supported quantized execution artifact, not merely
      `-ctk q8_0`/`-ctv q8_0`. Compare finite scores, top-K overlap, NDCG/MRR
      where labels exist, latency, peak VRAM, and CUDA GEMM/forward stability
      on the same revision-qualified fixture. Keep FP16 as the reference
      path; do not alter the canonical mxbai or Ornith runtime profile from
      this task.
- [x] AGMR-03C (2026-09-06) Prove the local ordered-embedding permutation and
      tokenizer bounds without loading or rewriting the embedding matrix. The
      read-only `python/atlas_gemma_rank_ordered_embedding_alignment_proof_v1.py`
      validated `masked_embedding.token_ordering` against the
      `model.embed_tokens.weight` shape `[262144,256]`: all 262,144 canonical
      token IDs are present exactly once in the ordered-position array, the
      inverse lookup round-trips, and all parsed tokenizer IDs plus discovered
      special-token IDs are in bounds. The recorded direction is
      `ordered_position_to_canonical_token_id`, matching the upstream masked
      embedder gather/scatter contract. It emits
      `docs/reports/atlas-gemma-rank-ordered-embedding-alignment-proof-v1.json`
      with `status=ORDERED_EMBEDDING_PERMUTATION_PROVEN_TARGET_ALIGNMENT_OPEN`,
      `embeddingMatrixLoaded=false`, and `canonicalTargetAlignmentProven=false`.
      This closes only the assistant-local permutation integrity check. A
      canonical Gemma 4 target embedding table or verified upstream relabeling
      fixture is still required before claiming target-token alignment or
      training a standalone ranker.
- [x] MICRO-02 (2026-09-06, TypeScript-side contract only — no head, no training, no GPU) Defined
      and validated a bounded input-projection contract on top of the EXISTING
      `RetrievalCandidateFeatureMatrixV1` ([C,25] Float32Array + Uint8Array presence mask,
      `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`) rather
      than defining a new `CandidateFeatureMatrixV1` from scratch — that name is already used by a
      genuinely distinct tool-routing contract in `neural-routing/contracts.ts` (18 named routing
      features: lexical/semantic/AST/graph/hyperedge/intent/domain/capability/historical-success-
      failure/evidence-coverage/freshness/latency/VRAM), confirmed real via direct read; reusing that
      name here would have created exactly the kind of second competing owner section 9's cross-
      check already flagged as a risk to avoid. New file:
      `sveltekit-frontend/src/lib/server/atlas/contracts/atlas-feature-input-v1.ts` —
      `AtlasFeatureInputV1Schema` (`matrixSchema`, `matrixRevision`, `candidateOrdinal`,
      `canonicalId`, `featureNames` (all 25 `CANDIDATE_FEATURE_NAMES`, enum-checked),
      `values`/`presenceMask` (length-25 arrays), `evidenceRefs`) plus
      `projectToAtlasFeatureInputs()` — a pure, read-only reshape of the existing matrix into one
      typed record per candidate row. It computes nothing new: values/presence mask are copied
      verbatim from the source `Float32Array`/`Uint8Array`, `candidateOrdinal` is the existing row
      index, `canonicalId` is the existing `candidate_packet_keys` entry — satisfying "features
      remain derived observations; the model cannot mint source identity, revisions,
      CandidateOrdinal, ontology tuples, or retrieval votes" by construction (there is no code path
      in this file that could mint any of those). 8/8 tests pass
      (`atlas-feature-input-v1.spec.ts`): valid row, strict rejection, wrong-length values/mask
      rejected, out-of-range presence-mask value rejected, correct per-candidate projection
      (verified against `buildCandidateFeatureMatrix()`'s real output, not a hand-built fixture),
      absent-feature correctly yields `presenceMask=0`/`value=0` (not silently treated as a real
      zero observation), `evidenceRefs` attachment, and a feature-count mismatch guard. Rank/span/
      route/utility heads themselves are NOT built by this task — this is the typed boundary they
      will eventually consume, per MICRO-02's own scope.
- [x] MICRO-03 (2026-09-06, first slice: mxbai/EmbeddingGemma/Ornith only — LangExtract/ACE/
      workflow-outcome receipts not yet built) Built `AtlasGemmaTeacherReceiptV1`
      (`sveltekit-frontend/src/lib/server/atlas/contracts/atlas-gemma-teacher-receipt-v1.ts`, 5/5
      tests pass) and a populator, `scripts/atlas/build-atlas-gemma-teacher-receipt-v1.mjs`, that
      makes NO new inference calls — it reshapes the already-real mxbai/EmbeddingGemma/Ornith scores
      already collected in `docs/reports/rerank-shadow-01-live-fixture-v1.json` into the formal
      receipt shape. Result: `docs/reports/atlas-gemma-teacher-receipt-v1.json`, 45 observations
      (3 queries × 5 candidates × 3 teacher models), schema-valid. **Correctly marked
      `distillationEligible=false`** with a stated reason
      (`candidateIdentityQualified=false` — the source fixture is a hand-labeled 3-query fixture,
      not a frozen, revision-qualified post-RRF cohort per `MICRO-04`'s own stricter bar) — the
      schema itself enforces this via a `superRefine` that rejects `distillationEligible=true`
      without `candidateIdentityQualified=true`, so a future caller can't silently promote this
      receipt past its own honesty gate. Note: EmbeddingGemma/Ornith observations use reciprocal-
      rank (`1/(rank+1)`) as `rawScore` rather than a fabricated logit, since the source fixture
      only preserved rank order for those two methods, not raw scores (mxbai's own raw margin
      wasn't preserved either — same limitation, recorded not hidden). LangExtract, ACE, and
      workflow-outcome teacher receipts are NOT built by this slice — no source data exists yet to
      populate them from (LangExtract's own domain-mismatch finding, `EVIDENCE-CARD-01`/02, means a
      LangExtract teacher receipt for code candidates has nothing real to draw from right now
      either). A real `MICRO-04` shadow evaluation still needs a genuinely revision-qualified
      candidate cohort — this receipt does not satisfy that bar and should not be cited as if it did.
- [x] MICRO-04 (2026-09-06, first slice: structural/latency only — rank quality, grounded-span
      parity, routing lift, and utility prediction NOT proven, since the head remains untrained)
      Built `python/atlas_gemma_rank_shadow_04_v1.py`, run against the real checkpoint. Frozen
      cohort: the same 3 queries × 5 real candidates as the `MICRO-03` teacher receipt, each
      candidate revision-qualified via a real sha256 content-hash `sourceRevision` plus a shared
      `workspaceRevision` constant (`cohortRevisionQualified=true`) — deliberately NOT round-tripped
      through the TypeScript `CandidateOrdinalMapV1` materializer for this Python-side test (noted
      explicitly as a simplification, not hidden). Result:
      `docs/reports/atlas-gemma-rank-shadow-04-v1.json`, `status=SHADOW_STRUCTURAL_PROVEN` — all 15
      real-tokenized forward passes finite, checkpoint checksum unchanged (`checkpointMutated=false`),
      `servedOrderChanged=false`, `cacheIdentityChanged=false`, CPU-only, per-candidate latency
      11.8–42.4ms (mean 17.7ms). **Latency explicitly NOT averaged against mxbai's own recorded
      per-query latency** in the teacher receipt — different units (per-candidate in-process CPU vs.
      per-query GPU+network round trip) that would misrepresent both if combined; the report states
      this rather than producing a misleading single number. This closes the "runs end-to-end
      against a properly-identified, frozen cohort" requirement structurally. **Does not close**:
      rank quality (head still Xavier-random, per `AGMR-04`/`AGMR-06`), grounded-span parity (no
      `SpanHead` exists), routing lift (no `RouteHead` exists), or utility prediction (no training
      data). A real quality verdict needs `MICRO-05`'s training step first, which stays gated behind
      GPU/training authorization.
- [x] MICRO-04-CPU-BATCH (2026-09-06, read-only timing/shape comparison) Added
      `python/atlas_gemma_rank_cpu_batch_benchmark_v1.py` and generated
      `docs/reports/atlas-gemma-rank-cpu-batch-benchmark-v1.json`. The benchmark uses the same
      3-query × 5-candidate fixture as the mxbai receipt, formats each input as a bounded
      `[QUERY] ... [DOCUMENT] ...` pair, and runs one padded batch of 15 on CPU for three warm
      repeats. Result: `status=CPU_BATCH_SHAPE_FINITE_PROVEN`, padded length 78, forward latency
      194.8–232.8ms (mean 218.5ms; 14.6ms per candidate), model load 2.35s, all finite,
      `cudaAllocated=false`, `rankHeadTrained=false`, and `checkpointMutated=false`. Existing
      mxbai live receipt is retained separately at 236.6–556.5ms per HTTP request containing five
      candidates (CUDA sidecar); these are not averaged because they are different units. This
      closes CPU batch mechanics/timing only. It does not prove Gemma ranking quality, mxbai parity,
      CUDA forward, ONNX export, or WebGPU timing. A real quality comparison remains gated on a
      trained/revision-qualified Gemma head and the live parity protocol.
- [x] MICRO-04-TRAIN-SMOKE (2026-09-06, operator-authorized bounded training proof — explicitly NOT
      MICRO-05, which is a separate MoE/REAP expert-pruning gate below, unaffected by this) Built
      `python/atlas_gemma_rank_micro05_train_smoke_v1.py` (filename inherited from an initial
      mislabel — content is correct, not renamed given context budget) — a bounded CPU training-loop
      proof, not a production training run: 10 self-identification pairs (does the model score a
      query's own real text higher than an unrelated real text — a trivial/near-string-match task,
      explicitly stated as such, not real cross-document relevance), margin-ranking loss, only the
      randomly-initialized scalar rank head trains (backbone frozen via `requires_grad_(False)` on
      every backbone parameter), 20 optimizer steps. Result:
      `docs/reports/atlas-gemma-rank-micro05-train-smoke-v1.json`,
      `status=TRAIN_LOOP_MECHANICALLY_PROVEN` — loss dropped 5.49→0.0, 10/10 pairs correctly ranked
      after training, backbone weights verified byte-identical on disk before/after
      (`backboneUnmutatedOnDisk=true`), no CUDA, no model artifact written
      (`modelArtifactWritten=false`). **Found and fixed one real bug getting here**: the initial
      `margin_ranking_loss` call passed a `target` tensor of shape `[1]` against `[1,1]`-shaped
      scores — PyTorch rejected it (`RuntimeError`); fixed by shaping the target as `[1,1]` to match.
      **What this proves**: the forward→loss→backward→optimizer-step training mechanism is real and
      functional for this architecture. **What it does NOT prove**: ranking quality on real
      cross-document relevance (10 trivial self-id pairs is far too small and far too easy a task to
      generalize from), and it does not touch the `SpanHead`/`RouteHead` training the same file's
      section 9 describes — this is rank-head-only. A real training run needs the actual
      `MICRO-03` teacher-receipt data (currently 45 observations from a 3-query fixture — also too
      small for real training, per that entry's own honesty note) scaled up substantially first.
- [x] MICRO-04-MXBAI-LIVE-CORPUS (2026-09-06, bounded read-only live capture) Added
      `python/atlas_gemma_rank_mxbai_teacher_corpus_v1.py` and captured the existing frozen
      3-query × 5-candidate cohort through the healthy `:8099` mxbai sidecar. The script binds the
      exact requested model ID, validates one finite `[0,1]` score for every requested candidate,
      rejects duplicate/unknown/incomplete rows, and preserves each candidate's content-derived
      `sourceRevision` plus the cohort `workspaceRevision`. Receipt:
      `docs/reports/atlas-gemma-rank-mxbai-teacher-corpus-v1.json` (15 observations). A second
      replay produced identical score values and candidate ordering; transport telemetry/checksums
      differ as expected because latency/VRAM fields are live measurements. This is **not** a
      distillation-ready corpus: the current HTTP contract exposes `sigmoid_once_normalized` scores,
      not raw CrossEncoder logits, and the cohort has not been round-tripped through the canonical
      TypeScript `CandidateOrdinalMapV1`. Accordingly `candidateIdentityQualified=false`,
      `canonicalOrdinalMapProven=false`, `rawLogitsAvailable=false`, and
      `distillationEligible=false` remain explicit in the receipt. No datastore, model, cache, or
      artifact mutation was performed; the sidecar performed inference only.
- [x] MICRO-04-MXBAI-SHADOW-COMPARE (2026-09-06, untrained baseline only) Added
      `python/atlas_gemma_rank_mxbai_shadow_compare_v1.py` and compared the exported standalone
      BF16 initialization against the captured mxbai receipt on the same 3-query × 5-candidate
      texts. The report `docs/reports/atlas-gemma-rank-mxbai-shadow-compare-v1.json` proves finite
      student scores and a repeatable structural comparison: top-1 agreement `2/3`, mean top-3
      overlap `0.555556`, mean Spearman rank correlation `-0.033333`, CPU scoring elapsed `461.409ms`.
      These values are **not** relevance quality or parity evidence: the AtlasGemma scalar head is
      Xavier-initialized and untrained, the teacher scores are normalized rather than logits, and
      the cohort is not canonical-ordinal qualified. No training, quantization, CUDA allocation,
      datastore write, or model-artifact mutation occurred. The existing live shadow-quality task
      remains open until a trained student and a canonical SearchRuntime cohort are available.
- [ ] MICRO-04-MXBAI-CANONICAL-TEACHER-CORPUS (blocked until separately authorized) Replace the
      fixture cohort with a current SearchRuntime post-RRF cohort that round-trips through the
      canonical `CandidateOrdinalMapV1`, preserves exact source/workspace revisions and candidate
      text, and either extends the sidecar contract with an explicitly named raw-logit field or
      records normalized scores as the deliberate teacher target. Do not mark eligible merely from
      a live sidecar response; require identity, score-semantics, replay, and held-out quality
      evidence first.
- [x] MICRO-05-GPU-STACK-RECONCILIATION (2026-09-06, read-only environment census) recorded the
      current deployment split in `docs/reports/atlas-gpu-inference-stack-readiness-v1.json`.
      Windows, WSL RAPIDS, and the isolated CUDA 13.2/cuTile experiment are explicitly separated;
      `npm run dev:gpu` and llama-server `:8090` remain proven only for the existing
      `ornith-1.5-9b` synthesis/tool-use lane. The report records that AtlasGemmaRank is not loaded
      by llama-server, no standalone ONNX/WebGPU ranker artifact exists, the Windows ONNX Runtime
      providers are CPU/Azure only, and Triton/TensorRT-LLM is still a scaffold. It also records the
      isolated `torch 2.14.0+cu132`/cuTile 1.5.0 SM86 GEMM experiment separately from the proven
      WSL RAPIDS environment. This closes reconciliation only; it is not an installation, model
      forward, parity, or promotion claim. Next gates remain an uncontended CUDA forward, ONNX
      INT8 parity, and only then Q4/WebGPU/Triton/TensorRT-LLM evaluation.
- [x] MICRO-05-CUDA-BF16-FORWARD (2026-09-06, isolated WSL CUDA 13.2 probe) Added
      `python/atlas_gemma_rank_cuda_forward_probe_v1.py` and generated
      `docs/reports/atlas-gemma-rank-cuda132-forward-probe-v1.json`. The real standalone
      AtlasGemma-derived text backbone loaded 46 inherited tensors and initialized 12 standalone
      attention tensors, then executed a three-item BF16 batch on the RTX 3060 Ti under PyTorch
      `2.14.0+cu132`. CPU/GPU outputs were finite, repeat-deterministic per device, and preserved
      candidate order; CPU mean was 10.07ms, GPU mean 7.58ms, peak allocation 155.98MiB. The
      maximum scalar delta was 0.3125, so numerical CPU/GPU parity remains open and no ranking
      quality or model promotion is claimed. The upstream checkpoint checksum remained unchanged.
- [x] MICRO-05-CUDA-PRECISION-DIAGNOSTIC (2026-09-06) Added
      `python/atlas_gemma_rank_cuda_precision_diagnostic_v1.py` and generated
      `docs/reports/atlas-gemma-rank-cuda132-precision-diagnostic-v1.json`. Using three real
      breadth-fixture texts without padding, FP32 CPU/GPU outputs matched within `0.000406`,
      while BF16 drift reached `3.8125`; GPU BF16 versus GPU FP32 drift reached `8.843043`.
      Both modes were finite, deterministic, and preserved ordering. This isolates the remaining
      discrepancy to BF16 execution/kernel numerics in the derived untrained path rather than
      checkpoint or tokenizer alignment. FP32 is the current numerical reference; BF16 parity
      and ranking quality remain open.
- [x] MICRO-05-CUDA-FP16-CONTROL (2026-09-06) Added the read-only GPU FP16 control
      `python/atlas_gemma_rank_cuda_fp16_control_v1.py` and generated
      `docs/reports/atlas-gemma-rank-cuda132-fp16-control-v1.json`. On the same three real-token
      texts, FP16 GPU output was finite and repeat-deterministic, but differed from GPU FP32 by
      `1.955785` maximum absolute delta and did not preserve the three-item ordering. This is a
      precision control result, not ranking-quality evidence; FP32 remains the numerical reference
      and FP16/BF16 promotion remains blocked.
- [x] MICRO-05-CUDA-FP16-BATCH-CONTROL (2026-09-06) Repeated the same control on twelve real
      breadth-fixture texts and generated `docs/reports/atlas-gemma-rank-cuda132-fp16-control-12-v1.json`.
      The maximum FP16-versus-FP32 GPU delta remained `1.955785`, ordering agreement remained
      false, and all outputs were finite and repeat-deterministic. The half-precision discrepancy
      therefore persists at the bounded cohort size; this remains diagnostic evidence only.
- [ ] MICRO-05 Only after V1 shadow evidence exists may a separate, explicitly
      scoped MoE/REAP experiment evaluate expert pruning. Dense Gemma E2B is
      not an MoE target for REAP, and no expert-pruning claim may be inferred
      from layer/channel surgery.

## Cross-cutting status note (2026-09-06) — CUDA/RTX, breadth, agentic dense search, cache alignment

Tying together several threads from this session for anyone picking this file up next: **all
AtlasGemmaRank work to date (AGMR-01..06, MICRO-01..04, MICRO-04-TRAIN-SMOKE) has run CPU-only —
`cudaAllocated=false` on every single receipt.** No RTX/CUDA execution has been attempted for this
model family yet; the RTX 3060 Ti has been under real contention from concurrent live services
(mxbai sidecar, Ornith, other GPU work) for most of this session, and every proof script here
deliberately stayed CPU-side to avoid collision. A future CUDA run is a separate, explicit step, not
implied by anything done so far. **Breadth** (`AGMR-06`, 51 real diverse strings) and **shadow
structural** (`MICRO-04`, 15 real candidates) proofs both confirm the standalone backbone is
numerically stable across real, varied text on CPU — this is the foundation a future **agentic dense
search** integration (AtlasGemmaRank as a cheap first-pass reranker ahead of mxbai, per this file's
own section 9 pipeline diagram) would need, but no such integration exists yet — nothing here is
wired into `SearchRuntime` or any live retrieval path. **Cache alignment** (`ContextPrefixIdentityV1`,
section 9/11's Headroom-inspired prefix-reuse design) is now contract-only: the canonical prefill
owner exposes the identity on receipts, but there is still no live prefill cache wiring, KV reuse
measurement, or request mutation.

Safe order remains: finish the current bounded mxbai/CrossEncoder shadow gate,
close candidate identity and feature-matrix receipts, then evaluate a
standalone micro-model challenger. This section adds no runtime model, cache,
GPU, datastore, or OpenSpec ownership.

## 8. Fine-tuning, adapter, and quantization boundary (2026-09-06)

This is a research/evaluation plan under the existing reranker owner. It does
not authorize training, adapter merge, model replacement, live serving, or
datastore writes. `parent-atlas-kv-cache-adaptation-research` remains the owner
for llama-server KV-cache/TurboQuant experiments; `parent-atlas-code-ingestion-pipeline`
remains the owner for canonical `semantic_768` and MRL representations. The
term `qvkm` is intentionally not frozen as a schema or format: if it means a
custom Q/K/V memory or KV-cache quantization mode, it must first be identified
by an actual binary/config contract and evaluated under the KV-cache owner.

### Precision roles

- **mxbai reference:** existing CUDA `float16` CrossEncoder computation;
  preserve the raw ranking logit internally and apply `sigmoid` exactly once
  at the HTTP boundary to produce a bounded `[0,1]` score. This is a ranking
  score, not a calibrated probability.
- **AtlasGemma research reference:** BF16 upstream tensors, FP16 CUDA forward
  and GEMM parity as the first reference implementation. Newly initialized K/V,
  KNorm, feature adapter, and rank-head tensors must be checksum-bound.
- **INT8/INT4 candidates:** weight-only or backend-specific artifacts are
  separate candidates, never implied by llama-server `-ctk/-ctv`. Those flags
  select KV-cache storage. A quantized model candidate requires its own model
  artifact checksum, runtime/backend, calibration data, and quality/latency/
  VRAM receipt.
- **Ornith:** current GGUF synthesis profile remains unchanged. No legal/code
  adapter is merged into the live `:8090` model through this task.

### Adapter and fine-tuning tasks

- [ ] FT-01 Freeze an eligible legal/code reranker dataset from
      revision-qualified query/candidate pairs. Each row must retain canonical
      candidate identity, source/workspace revisions, candidate-set checksum,
      teacher revision, and label provenance. Exclude hidden thoughts, KV state,
      raw tensors, synthetic identity, and unreviewed claims.
- [ ] FT-02 Emit `AdapterArtifactManifestV1` for every LoRA/QLoRA candidate:
      standalone AtlasGemmaRank base checksum plus donor checkpoint checksum, tokenizer/template revisions, adapter method, target
      modules, rank/alpha/dropout, training dtype, quantization format, dataset
      checksum, seed, software/runtime revision, and held-out evaluation refs.
      The manifest is an artifact receipt, not promotion authority.
-      The base checksum must identify the standalone derived architecture actually
      loaded by training; the Google assistant donor is retained as separate lineage,
      never substituted as the adapter base.
- [ ] FT-03 Keep legal and code adaptation distinguishable. Start with separate
      `LEGAL_RERANKER` and `CODE_RERANKER` adapter revisions unless a mixed-domain
      dataset proves a single adapter is better. Domain selection is a routing
      decision; it cannot alter source identity, candidate identity, semantic
      lane identity, or SearchRuntime fusion.
- [ ] FT-04 Establish an FP16/BF16 teacher-student baseline before quantized
      training. Compare mxbai teacher logits/order against the AtlasGemma
      challenger on the same frozen cohorts; preserve raw scores and rank-order
      metrics independently from normalized display scores.
- [ ] FT-05 Produce INT8 and INT4 candidates only as immutable, content-addressed
      artifacts. INT4 must identify the actual format/backend (for example GGUF
      weight-only or another explicitly supported executor); INT8 must identify
      its kernel/runtime path. Do not claim INT8 because KV cache is `q8_0`.
- [ ] AGMR-TRAINABLE-TENSOR-POLICY-01 Freeze a trainability census before FT-02:
      classify inherited donor tensors, standalone K/V/KNorm tensors, feature adapter,
      and rank head as `FROZEN_BASE`, `LORA_TARGET`, `FULLY_TRAINABLE`,
      `MODULE_TO_SAVE`, or `NON_TRAINABLE`. Evaluate QLoRA-QV-only, LoRA-all-linear,
      and QLoRA-all-linear as distinct challengers.
- [ ] AGMR-PRECISION-AXES-01 Record four independent precision axes in every training
      and serving receipt: training compute dtype, base-weight storage, serving artifact
      format, and runtime KV-cache dtype. QLoRA, INT4 serving, and q4 KV cache are not
      interchangeable labels.
- [ ] AGMR-QAT-LINEAGE-01 Keep Donor B labeled as an official QAT-derived Gemma4
      assistant donor. An AtlasGemmaRank donor-B variant inherits QAT weights but is not
      itself a QAT-trained model until its newly initialized standalone tensors are
      trained and measured.
- [x] FT-06 closed 2026-09-07. **Most of this was already satisfied by
      `TextRelevanceObservationV2Schema`** (section 11 above, closed 2026-09-06): per-observation
      non-finite rejection (`rawScore: z.number().finite()`), the `rawRankingLogit -> sigmoid_once
      -> normalizedRankingScore` boundary (`rawScore`/`normalization`/`normalizedScore` via
      `normalizeTextRelevanceScoreV2()`), and calibration emitting a distinct
      `calibratedScore` field that never overwrites raw/normalized (`superRefine` rejects
      `calibratedScore` without the `LATE_HEAD_CALIBRATION_V1` marker) — all pre-existing, verified
      by re-reading the file and its 10 existing passing tests before writing anything new. **The
      real remaining gap**: duplicate-candidate-row and missing-score rejection are properties of a
      SET of observations for one candidate cohort, not expressible in a per-observation schema —
      confirmed via reading the existing spec file that no batch-level check existed anywhere.
      Added `validateTextRelevanceObservationBatchV2()` to the same file: rejects a batch containing
      a duplicate `canonicalId` (naming every duplicate, not just the first), and optionally rejects
      a batch missing a score for any id in a caller-supplied expected-candidate-set. Additive only —
      the existing per-observation schema and its 10 tests are untouched. 7 new tests added (17/17
      total passing, no regressions). **"Reject... a second sigmoid" is honestly scoped, not
      falsely claimed as solved**: a genuine second-sigmoid misuse (re-normalizing an
      already-normalized `[0,1]` value as a fresh raw logit) is undetectable from the value alone —
      `0.5` is indistinguishable between "a legitimate small raw logit" and "an accidentally
      re-fed already-normalized score." No heuristic detection was invented for this; instead, a
      test demonstrates the danger directly (double-normalizing produces a silently wrong value)
      so the risk is documented rather than falsely claimed as prevented.
- [ ] FT-07 Run the QKV/KV-cache precision experiment through the existing
      llama-server owner. Record `-ctk/--cache-type-k`, `-ctv/--cache-type-v`,
      Flash Attention, GPU-layer count, batch/ubatch sizes, prompt-cache/reuse
      settings, context length, binary revision, and model checksum. Prove
      cache hit behavior, score/output parity, peak VRAM, and failure behavior.
      KV cache remains ephemeral and cannot enter adapter training receipts or
      durable memory.
- [ ] FT-08 Prove CUDA tensor alignment for each candidate artifact on the RTX
      3060 Ti reference environment: finite FP16/BF16/INT8/INT4-compatible
      operations where the selected backend actually supports them, aligned
      dimensions, no silent CPU fallback, and no out-of-range outputs. A small
      GEMM smoke is not a model-forward or ranking-quality proof.
- [ ] FT-09 Run the same frozen evaluation for FP16, INT8, and INT4 candidates:
      top-1 agreement, Recall@K, MRR/NDCG, rank displacement, score finiteness,
      calibration metrics only where labels exist, latency, peak VRAM, and
      legal/code slice breakdown. Reject a candidate on identity, revision,
      normalization, or score-count mismatch even if quality is high.
- [ ] FT-10 Keep all adapter and quantization candidates shadow-only until the
      dedicated reranker shadow gate is proven. Shadow runs must not alter
      SearchRuntime order, RRF votes, cache identity, canonical model paths,
      or the live Ornith profile.
- [ ] FT-11 Permit promotion only through a separate explicit promotion receipt
      naming the exact base model, adapter, quantized artifact, runtime flags,
      score-normalization revision, held-out metrics, rollback artifact, and
      serving target. No task in this section promotes a model by itself.

### Existing built-in capabilities to reuse

- `EmbeddingGemma` remains the canonical first-stage `semantic_768` producer;
  do not fine-tune it as a reranker or create a second dense identity lane.
- `SearchRuntime` remains the sole fusion owner; mxbai is the dedicated
  CrossEncoder and AtlasGemma is a challenger until shadow evidence closes.
- Existing `CandidateFeatureMatrixV1`, `CandidateOrdinalMapV1`, ACE,
  LangExtract, and workflow receipts are feature/evidence inputs, not adapter
  identity owners.
- Existing llama-server `--cache-prompt`, `--cache-reuse`, `-ctk`, and `-ctv`
  are runtime/cache controls. They do not quantize model weights and do not
  replace an INT4/INT8 artifact pipeline.

## 9. Runtime timing and cache boundary (2026-09-06)

This records process-level evidence only. It must not be read as warm-model
latency, CPU/GPU parity, or production cache integration.

- [x] CPU baseline recorded for the read-only synthetic forward smoke:
      approximately 14.4 seconds wall time for the whole process, including
      model construction, checkpoint loading, one forward pass, and report
      emission. A separate no-checkpoint-load one-off forward took
      approximately 12.1 seconds. These are startup/process timings, not a
      per-request or steady-state forward benchmark.
- [x] GPU availability boundary recorded: the RTX 3060 Ti reported only
      approximately 348 MiB free while live services occupied the card. No
      Gemma model-forward timing was run under that condition. The earlier
      CUDA evidence is limited to an untimed finite FP16 GEMM smoke and does
      not prove model-forward performance or ranking quality.
- [x] Gemma cache boundary recorded: the current proof scripts set
      `use_cache=false` and do not write BitFrost, Valkey, Redis, prompt-cache,
      document-token representations, KV state, or tensors. Existing mxbai
      production caching remains separate (full-result and per-score Redis
      tiers); Ornith llama-server prompt/KV caching remains a separate runtime
      profile.
- [ ] Run a safe warm CPU benchmark separating initialization/checkpoint load
      from repeated forward latency (2026-09-06 CPU subproof complete). The existing benchmark now
      accepts both the upstream assistant config and the exported standalone
      `gemma4_text` config, reports p50/p95 alongside min/max/mean, and records
      that this run is intentional CPU execution (`cpuFallback=false`, no GPU
      probe, peak VRAM unavailable). The first attempt exposed and fixed the
      config-shape mismatch against the current standalone artifact. Five warm
      repeats over the frozen 15-candidate batch remain the bounded CPU proof;
      report: `docs/reports/atlas-gemma-rank-cpu-warm-benchmark-v1.json`.
      Repeat the same fixture on GPU only after sufficient VRAM headroom is
      available and record CUDA/peak-VRAM evidence separately before closing
      this combined task.
- [x] Define and test a revision-qualified Gemma representation-cache key
      (2026-09-06). Added `gemma-representation-cache-key-v1.ts` and focused
      tests. The identity binds the Gemma representation/model/adapter,
      tokenizer and input-template revisions, canonical candidate/source
      identity plus source-content checksum, optional feature/graph revisions,
      tokenization/max-token/normalization policy, late-interaction dimension,
      and produced representation checksum. Reuse requires an exact `PROVEN`
      receipt; `FAILED`/`PARTIAL` or any changed identity field fail closed.
      This is an identity-only contract: it does not reuse mxbai score keys or
      write BitFrost/Valkey/Redis/tensor state. Runtime cache integration remains
      separately gated.

## 9. Multi-head architecture, DAG routing, and rollout phasing (2026-09-06, operator review)

An operator-authored architecture review (2026-09-06) proposed the same `AtlasGemmaRankV1` surgery
this section's AGMR-01..05/MICRO-01..05 already independently verified — confirmed by cross-checking
the review's specific factual claims against the real receipts rather than accepting them at face
value: `google-gemma4-e4b-assistant` checkpoint (159,138,208 bytes, SHA-256
`12875062fc25c51e8fa9b62abd2de7ad48b7d63f8559d5d604fbd5a3d6bcff16`), 4 layers, hidden 256, target-KV-
coupled (`num_kv_shared_layers=4`, matches the review's "shared_kv_states from the full Gemma target"
description), `use_ordered_embeddings` concern already reflected in AGMR-04's explicit note that
ordered-token embedding alignment is NOT yet proven. **AGMR-01 through AGMR-05 and AGMR-03A are
already the standalone-transplant work item 1 of the review describes** ("Make the Gemma assistant
standalone") — do not re-open or duplicate that gate. `RetrievalCandidateFeatureMatrixV1`
([C,25] float32 + presence mask, `src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`)
and `neural-routing/contracts.ts`'s separate `CandidateFeatureMatrixV1` (18 named tool-routing
features: lexical/semantic/AST/graph/hyperedge/intent/domain/capability/historical-success-failure/
evidence-coverage/freshness/latency/VRAM) were both verified real and are genuinely distinct
capabilities (retrieval-candidate ranking vs. tool-routing), not a naming collision needing
reconciliation — the review's own text already correctly separates these two, cited by name.
`OntologyLinkedTupleV1`-family contracts (`src/lib/server/atlas/ontology-linked-tuple-postgres.ts`
and siblings) were verified real.

**What the review adds that is NOT yet tracked anywhere in this repo** (recorded here, in the
existing AtlasGemmaMicro owner file, per the Duplication Prevention rule — not as a new competing
OpenSpec change):

- [ ] **RouteHead typed action enum**: contract slice implemented 2026-09-06 in
      `atlas/retrieval/route-head-decision-v1.ts` with focused tests. The bounded enum
      (`STOP`, `AST_EXPAND`, `CALL_GRAPH_EXPAND`, `ONTOLOGY_EXPAND`, `HYPEREDGE_EXPAND`,
      `SEMANTIC_EXPAND`, `LANGEXTRACT`, `MXBAI_ESCALATE`, `ORNITH_ESCALATE`) is checksum-bound to
      request/candidate/ordinal/feature/model/route revisions, evidence refs, and candidate
      ordinals. Unknown actions, duplicate ordinals, missing evidence, and non-STOP decisions
      without a candidate fail closed; `canonicalAuthority=false` and `executionDelegated=true`
      make the model non-authoritative. The task remains open for the deterministic DAG builder,
      prerequisite validation, and head shadow/training evidence; the deterministic admission
      slice now rejects request/snapshot/ordinal/feature revision drift before any future DAG
      builder can dispatch a helper. A read-only adapter now compiles admitted proposals into
      the existing `ContextToolDagV1` owner only after resolving CandidateOrdinal through a
      supplied canonical-ID map; unresolved ordinals and canonical-ID collisions fail closed.
      No route action is executed here.
      This keeps the model's output auditable (a typed enum choice) rather than free-form DAG JSON.
      Cross-reference: `parent-atlas-code-langextract-evidence-lane`'s design.md section 5 already
      recorded a `RouteHead` for the LangExtract-vs-8095-escalation decision specifically; this is
      the broader DAG-expansion version of the same head-output-boundary discipline, not a
      conflicting proposal — both should converge on one `RouteHead` output contract when built,
      not become two competing route heads.
- [ ] **SpanHead/EntityHead LangExtract distillation** (256-wide span/entity classification heads,
      trained from `parent-atlas-code-langextract-evidence-lane`'s `CODE-LANGEXTRACT-01`-proven
      8095/llama-server extraction path as the teacher). That change already recorded this as
      future/out-of-scope design (section 5); this note is the cross-reference the other direction,
      so a reader starting from this file also finds it.
- [x] **`ContextPrefixIdentityV1` contract** (Headroom-inspired, but explicitly NOT copying Headroom's
      request-mutating `CacheAligner` behavior — Headroom's own docs describe that component as an
      off-by-default detector, not a live rewriter, and this repo should borrow only the
      measurement principle): a contract separating a request's STABLE PREFIX
      (`modelRevision`, `templateRevision`, `toolSchemaRevision`, `systemPolicyRevision`,
      `stableEvidenceRevision`) from its VOLATILE SUFFIX (current query, new tool result, new
      candidate spans). Implemented as the strict, checksum-bound
      canonical `sveltekit-frontend/src/lib/server/atlas/prefill/context-prefix-identity-v1.ts`
      contract, with the older compiler path reduced to a compatibility export, plus deterministic
      prefill-receipt coverage; this is a KV-cache/prefill identity measurement, not a
      reranking or retrieval-identity concern. Distinct scope from this file's existing cache-key
      task above (which is about a Gemma *representation* cache key, not prefill-token accounting).
- [x] **`ContextPrefixReuseObservationV1` contract**: canonical prefill receipts may carry the
      measured `prefixReuseRatio`, `prefixDriftBytes`, `cachedPrefillTokens`, and
      `newPrefillTokens` values. The contract accepts observed counts only; it does not infer cache
      hits, persist KV state, or mutate requests.
- [x] **llama-server prompt telemetry normalization**: normalize nested
      `usage.prompt_tokens_details.cached_tokens` and the legacy
      `usage.prompt_tokens_cached` field through
      `llama-prompt-cache-telemetry-v1.ts`; the Cline in-memory monitor now records new prompt
      tokens rather than completion tokens. Missing cache telemetry remains explicitly unavailable.
- [ ] **Context-prefix cache wiring and measurement**: connect the proven identity to the existing
      prefill/turbo-prefix consumers (the canonical prefill receipt and opted-in prompt-key seam are
      now wired). **Partial implementation (2026-09-06):** streaming Cline and ACP/OpenCode-style
      llama-server callers now request the optional usage block and route observed prompt cache
      counters through the shared `recordLlamaPromptCacheTelemetry()` helper; this includes the
      non-streaming Ornith summary wrapper (including its fallback), TurboQuant, and the central
      inference-router fallback, all using their resolved/requested runtime model identity.
      Missing cache telemetry remains unavailable and no KV state is persisted. Mocked summary
      and streamed llama responses
      now proves the request flag, source-attributed counters, matching-prefix observation, and
      mismatch fail-closed behavior in
      `sveltekit-frontend/src/lib/server/atlas/prefill/llama-prompt-cache-telemetry-v1.spec.ts`.
      A typed bridge now composes the existing logical prefill identity with explicit tool-schema
      and system-policy revisions; it never infers those missing owners. Remaining work is to pass
      that identity from real stable-prefix callers and emit the complete
      `ContextPrefixReuseObservationV1`/prefill receipt in those consumers. Receipt construction
      now rejects prefix model/template drift and observations that are not bound to the supplied
      prefix identity. Do not mutate requests or persist KV state; keep the live cache rollout
      separately authorized. **Producer audit (2026-09-06):** production code currently does not
      call `buildPrefillReceiptV1`; the active neural-decoder path emits its own shadow caller
      receipt. Do not attach prompt-prefix observations to that decoder receipt or treat its
      latent cache as prompt KV state. A future production prefill producer must explicitly
      compose the typed prefix identity before this task can close.
- [ ] **Explicit 3-phase rollout naming** for whenever MICRO-04's shadow evaluation eventually
      passes: Phase A (shadow only, mxbai stays the served owner, AtlasGemma scores recorded but
      never served — this is what MICRO-04 already specifies); Phase B (AtlasGemma primary, mxbai as
      a low-confidence fallback); Phase C (AtlasGemma + a result cache, mxbai called only on
      disagreement/uncertainty, Ornith as an exceptional-case judge). This file's existing MICRO-04
      already covers Phase A's evidence bar; Phases B/C are new, explicitly gated behind Phase A
      passing, and are recorded here only as target shape, not authorized work.
- [ ] **Control-plane-vs-tensor-plane packet boundary**: if/when `QueryPacketV1`, `CandidatePacketV1`,
      `RankObservationV1`, `DagDecisionV1`, `ExecutionReceiptV1`-shaped control objects are
      introduced for this pipeline, they must stay JSON/Zod-shaped control objects carrying
      identities/refs/revisions only — never raw numerical arrays (semantic vectors, centroid
      matrices, training batches). This restates, for this specific pipeline, the existing repo-wide
      Wire Format Layering Rule (root CLAUDE.md) rather than inventing a new rule; no such packet
      types were found to already exist under this name, so this is a fresh reminder to apply the
      existing rule when they are eventually built, not a correction of an existing violation.

**Explicitly not authorized by this section**: implementing any of the above, training any head,
building the 8099 `/v1/rerank/features`, `/v1/extract/spans`, or `/v1/route` endpoints the review
proposes as future 8099 surface, or modifying the live `:8090`/`:8099`/`:8095` services. This section
is planning-only, matching this file's own established discipline throughout sections 1-8.

## 10. Quantized-artifact inventory boundary (2026-09-06)

The repository and adjacent local model workspace contain quantized artifacts, but none is the
promotable standalone `AtlasGemmaRankV1` artifact:

- [x] Existing E2B runtime artifact classified as a separate synthesis/MTP lane:
      `models/gemma4-e2b-rotorquant-iq4xs/gemma-4-E2B-it-RotorQuant-IQ4_XS.gguf`
      (approximately 3.08 GiB).
- [x] Archived assistant artifact verified read-only with the existing GGUF checker:
      `C:/Users/james/Desktop/archived-from-tmp-20260825/atomic-mtp/gemma-4-E4B-it-assistant.Q4_K_M.gguf`
      (approximately 75 MiB; `token_embd.weight` `(256,262144)`, embedding length `256`,
      centroid KV `(256,2048)`). It is E4B/MTP assistant evidence, not the E2B standalone ranker.
- [x] Existing export paths located: `scripts/unsloth-training/merge-and-export.sh`,
      `sveltekit-frontend/notebooks/rotorquant-local-quant.ipynb`, and the archived
      `quantize-gemma4-edge-assistant-mtp.sh`. They convert supported HF/GGUF/MTP artifacts;
      they do not create the missing standalone Gemma ranker architecture.
- [x] `C:/Users/james/Downloads/llama/llama.cpp/convert_hf_to_gguf.py` and
      `C:/Users/james/Desktop/llama-server-cuda/llama-quantize.exe` are available locally.
      The quantizer exposes `Q4_K_M`, `Q8_0`, IQ formats, `--imatrix`, and `--dry-run`.
- [x] `scripts/quantize_model_local.py` is not accepted as quantization evidence: its INT4/INT8
      branches retain half-precision weights and save HF files rather than emitting a verified
      quantized model artifact.
- [x] Quantized-artifact rescan (2026-09-06) emitted
      `docs/reports/atlas-gemma-rank-quantized-artifact-inventory-v1.json`. It confirms no
      standalone AtlasGemmaRank INT8/INT4 artifact exists. The Hugging Face BF16 seed is
      `159,138,208` bytes with SHA-256
      `12875062fc25c51e8fa9b62abd2de7ad48b7d63f8559d5d604fbd5a3d6bcff16` and filesystem timestamp
      2026-07-03; the 171,766,880-byte F16 GGUF is a Gemma4 E4B MTP assistant from the same date.
      Existing Gemma4 generation GGUFs, EmbeddingGemma Q8, and browser Q4F16 assets are separate
      runtime lanes and do not satisfy the standalone ranker INT8 gate.
- [x] Clean Gemma 4 E4B legal adapter located and inspected read-only:
      `vendor/models/lora/gemma4-legal-text/adapter_model.safetensors` contains exactly 588
      language-model LoRA tensors across 42 layers and 7 target modules (`q_proj`, `k_proj`,
      `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`), with complete A/B pairs and no
      audio/vision/projector keys. SHA-256:
      `1f16e3884b7501de4c420e9946c7545ac77fdb5b45fd6c74c27226fe0d570728`.
- [x] Matching adapter metadata is present separately at
      `C:/Users/james/Downloads/gemma4-legal-text-only-adapter/adapter_config.json` and declares
      `unsloth/gemma-4-E4B-it-unsloth-bnb-4bit`, LoRA rank/alpha `16/16`, and multimodal exclusions.
      The weights and metadata have not been copied, merged, or promoted; their split locations
      remain an artifact-packaging gap.
- [ ] Obtain and checksum the exact Gemma 4 E4B base weight snapshot before PEFT loading. The
      local Hugging Face cache currently exposes the matching 42-layer/2560-hidden configuration
      but not the complete base weight files, so no merge or compatibility claim is authorized.
- [x] Reject `vendor/models/lora/gemma4-legal-grpo/adapter_model.safetensors` for text-only merge
      until independently re-surgeried: its inspected inventory contains 884 tensors spanning
      language, vision, and audio towers. Do not point `LEGAL_LORA_PATH` at it as a canonical
      adapter. **Independently re-verified 2026-09-06** (read-only safetensors header parse, no
      load, no CUDA, no mutation): exactly 884 tensors, breaking down to 588 `language_model.*` +
      224 `vision_tower.*` + 72 `audio_tower.*` (sums to 884 exactly, zero unclassified keys) —
      confirms the file genuinely mixes towers and the language-only 588 count is not a coincidence
      relative to the clean `gemma4-legal-text` adapter (which has exactly 588 language-only
      tensors and zero vision/audio keys, per section 10 above). The rejection stands.
- [x] Produce the first separate, untrained standalone BF16 initialization artifact with
      `python/atlas_gemma_rank_standalone_init_export_v1.py` under the ignored path
      `models/atlas-gemma-rank-v1/standalone-init-bf16/`. The artifact contains 46 exact inherited
      tensors, 12 initialized standalone K/V/KNorm tensors, and two scalar rank-head tensors
      (60 tensors total), with source/artifact checksums in `atlas-rank-manifest.json`. A fresh
      in-memory reload proved the derived `Gemma4ForCausalLM` config accepts all 58 backbone
      tensors, all values are finite, and the rank head is present. This is an untrained research
      initialization only; it does not close the trained checkpoint, ordered target alignment,
      mxbai parity, quantization, or serving gates.
- [x] Reload and execute the exported initialization artifact with
      `python/atlas_gemma_rank_standalone_artifact_forward_check_v1.py`. Receipt
      `docs/reports/atlas-gemma-rank-standalone-init-forward-check-v1.json` proves the saved
      `Gemma4ForCausalLM` backbone accepts all 58 model tensors, the six-token real tokenizer
      input produces hidden shape `[1,6,256]`, and the BF16 scalar rank-head output is finite.
      This is exported-artifact forward integrity only; the rank head is untrained and no
      relevance, mxbai parity, quantization, or serving claim follows.
- [ ] Produce a standalone AtlasGemma BF16/FP16 checkpoint, add explicit llama.cpp architecture
      and tensor mapping support if GGUF serving is required, then export F16 before producing
      Q8_0/Q4_K_M candidates. Quantization remains downstream of forward compatibility, mxbai
      teacher parity, and rank-quality evidence.

- [ ] `ONNX-EXPORT-01` (2026-09-06, first real attempt, NOT closed — a real parity bug found, not
      plumbing) — feasibility check for the client-side-ONNX-reranker direction recorded in root
      `CLAUDE.md`'s "Client Model Direction" note. Built
      `python/atlas_gemma_rank_onnx_export_feasibility_v1.py`, loading the already-materialized
      standalone artifact (`models/atlas-gemma-rank-v1/standalone-init-bf16/model.safetensors`,
      60 tensors incl. the untrained rank head) directly rather than re-deriving it in memory.
      **Two real environment bugs found and fixed before getting a result, not glossed over:**
      (1) the modern `torch.export`-based path (`dynamo=True`) needs the `onnxscript` package,
      not installed by default — installed it (`pip install onnxscript`, no other capability
      exists in this repo for this, matches `DEPENDENCY-CAPABILITY-GUARD-01`'s bar for a genuine
      gap). (2) `torch.onnx`'s dynamo exporter prints a "✅" progress checkmark to stdout, which
      crashes with `UnicodeEncodeError` on Windows' default `cp1252` console codepage — the export
      had actually completed `torch.export.export()` tracing successfully before dying on this
      print, so no `.onnx` file was ever written; fixed by forcing UTF-8 stdout/stderr
      (`sys.stdout.reconfigure(encoding="utf-8", errors="replace")`) before importing torch.
      **Result once both were fixed: the export mechanically succeeds (`onnx.checker.check_model`
      passes) but produces numerically wrong output.** `maxAbsDeltaPytorchVsOnnx: 4.386` against a
      `1e-3` tolerance — far outside acceptable parity. Isolated one candidate cause and ruled it
      out: torch's own exporter warns `dynamic_axes` is unreliable under `dynamo=True`; re-ran with
      a fixed-shape export (no `dynamic_axes`) and got an almost identical delta (4.3863 vs 4.3863),
      so dynamic shape handling is NOT the cause. **The "suspiciously small file" theory below was
      retracted the same session, not left standing as a false lead.**

      ~~(a) the exported `.onnx` file is suspiciously small (~1.2-1.4MB against a 154MB source
      checkpoint), consistent with the embedding-lookup step getting constant-folded/specialized
      for the one traced probe input rather than exported as a full `Gather` op~~ — **FALSE,
      checked directly by loading the graph with `onnx.load()` and inspecting node/initializer
      counts: `backbone.embed_tokens.weight [262144, 256]` IS present as a real, full initializer,
      and the graph has a real `Gather` op (2 of them, plus 1 `GatherND`), not a constant-folded
      lookup.** The "small file" was never small — the dynamo exporter writes large tensors to a
      sibling `<name>.onnx.data` external-data file (standard ONNX convention for big tensors),
      which the original size check (`onnx_path.stat().st_size` only) never accounted for. Real
      total: 1.2MB graph + **309.6MB external-data file = 310.9MB**, which roughly matches the
      154MB bf16 source doubled to fp32, as expected — not anomalous at all. Fixed the checker
      script to sum both files (`onnxGraphFileBytes`/`onnxExternalDataFileBytes`/`onnxTotalBytes`),
      re-ran, confirmed `browserSizeFeasible: false` is now the correct (and different) verdict —
      310MB is not viable for browser delivery regardless of the parity bug, a separate real
      blocker from the numerical one.

      **Bisection by token count, 2026-09-06 (same session, further narrowing) — the divergence is
      sudden, not gradual, and appears exactly at 2 tokens.** Swept `n_tokens` 1 through 5 on the
      same real model/artifact: `n=1` delta `2.0e-5` (parity, well within `1e-3`... actually within
      a slightly looser but clearly-matching tolerance), `n=2` delta `2.509`, `n=3` delta `1.398`,
      `n=4` delta `2.055`, `n=5` delta `1.382` — large and inconsistent-magnitude at every length
      ≥2, not a threshold effect at some larger sliding-window boundary. This rules out a
      window-size-dependent onset and confirms the bug is in the base multi-token attention path
      itself, present as soon as there is more than one token to attend across.

      **RoPE/`position_ids` ruled out as the cause, same session.** The wrapper's `forward()` never
      passed `position_ids` explicitly, leaving Gemma4's internal derivation to run under
      `torch.export`'s symbolic tracing. Added an explicit
      `torch.arange(seq_len).unsqueeze(0).expand(...)` `position_ids` argument and re-ran the same
      2/3-token probes: **identical deltas** (`2.509421`, `1.397575`, to the exact same decimal) —
      explicit position_ids changed nothing, so RoPE position handling is not where the divergence
      originates.

      **Confirmed this reranker uses bidirectional, not causal, attention** — `derived_text_config()`
      sets `use_bidirectional_attention: "all"` deliberately (correct for a reranker; it is not
      autoregressive generation). This reframes suspect (b): the remaining candidate is not a causal
      mask construction bug (there is no causal mask here) but Gemma4's sliding-window-vs-full
      attention **layer alternation and window-chunking logic** specifically — consistent with the
      `Eq((2//s72), 1) | Eq((2//s72), 2)` symbolic-shape guard warning from the original export,
      and with the graph containing `IsNaN`/`Where`/`Tanh` combinations matching Gemma's
      logit-softcapping/masking mechanics. **Not chased further this pass** — isolating this
      precisely would mean patching transformers' `Gemma4Attention`/window-chunking code directly to
      compare per-layer hidden states between eager and traced execution, or checking whether this
      is an already-known upstream `transformers`/`torch.onnx` compatibility gap for Gemma4's
      specific attention shape — both meaningfully larger efforts than the three isolation tests
      above. **Status: `ONNX_EXPORT_PARITY_FAILED`, not `ONNX_EXPORT_FEASIBILITY_PROVEN`** — do not
      treat ONNX export as viable for this model until the parity gap is root-caused and closed,
      and separately note the 310MB total size is its own blocker for browser use even if parity is
      eventually fixed. Receipt: `docs/reports/atlas-gemma-rank-onnx-export-feasibility-v1.json`
      (the bisection/position_ids probes above were exploratory, ad hoc console runs, not saved to
      their own receipt files — reproducible directly from this note's exact commands if needed).
      No training, no CUDA, no client wiring, no checkpoint mutation (`checkpointMutated: false`,
      source checksum
      unchanged).

### ONNX-ARTIFACT-RETENTION-01 — failed export evidence classified 2026-09-08

- [x] Confirmed `.tmp/atlas-gemma-rank-onnx` contains reproducibility artifacts from the Sept 6
      feasibility probes: 17 files totaling approximately 2.35 GiB, including repeated external
      data files around 309 MB each.
- [x] Classified the directory as `REPRODUCIBILITY_EVIDENCE_ONLY`: it is not the live client model,
      not a browser/WebGPU artifact, and not eligible for model promotion.
- [x] Independently reproduced on native Windows 2026-09-07 using the donor-B standalone BF16
      artifact and the installed ONNX 1.19.0 / ONNX Runtime 1.27.0 stack. Export completed with
      no script error, but `maxAbsDeltaPytorchVsOnnx=17.41263771057129` and
      `parityWithinTolerance=false`; the report status is `ONNX_EXPORT_PARITY_FAILED`.
      The reproduced graph is 1,227,666 bytes plus 309,657,600 bytes of external data
      (`onnxTotalBytes=310,885,266`, `browserSizeFeasible=false`). Receipt:
      `docs/reports/atlas-gemma-rank-donor-b-onnx-repro-v1.json`; repro output:
      `.tmp/atlas-gemma-rank-onnx-repro-donor-b/`. This confirms the existing export directory
      is reproducibility evidence, not a usable WebGPU client model.
- [ ] Retain the failed export artifacts until an explicit archive/cleanup decision is authorized;
      no deletion or move was performed.

### ONNX-PER-LAYER-LOCALIZATION-01 — diagnostic harness added 2026-09-08

- [x] Added the read-only PyTorch-vs-ONNX localization probe at
      `python/atlas_gemma_rank_onnx_layer_localization_v1.py`. It exports one fixed-shape prefix
      at a time around the four Gemma4 transformer blocks and records finite hidden-state deltas;
      all changes are in-memory and the checkpoint remains untouched.
- [x] Native Windows run completed against donor-B. Layer 1 (`sliding_attention`) passed with
      `maxAbsDelta=2.872943878173828e-05`; layer 2 (`sliding_attention`) was the first divergence
      with `maxAbsDelta=35.857757568359375`. Layer 3 remained divergent at `35.76685333251953`
      and layer 4 (`full_attention`) at `38.06773376464844`. All reference and ONNX outputs were
      finite. Receipt: `docs/reports/atlas-gemma-rank-onnx-layer-localization-v1.json`.
- [x] Audited the installed Transformers Gemma4 configuration path. The derived config records
      `use_bidirectional_attention="all"` and `layer_types=[sliding_attention, sliding_attention,
      sliding_attention, full_attention]`; Transformers derives `sliding_window=257` from the
      upstream 512-token value for bidirectional attention. This is a tracked hypothesis for the
      layer-2 failure, not a proven cause, and the config was not changed.
- [x] Closed as already covered by the earlier diagnostics: dynamic-vs-fixed shape export,
      sequence lengths 1–5, explicit `position_ids`, and the canonical
      `use_bidirectional_attention="all"` interpretation were already tested. A causal-mask
      variant would not be an equivalent reranker and would duplicate evidence rather than
      localize the multi-token sliding-attention export failure.
- [x] Attempted a layer-2 full-attention control, but it was invalid before export: the inherited
      sliding layer has 256-wide geometry while the full-attention path requires 512-wide rotary
      geometry. Receipt: `docs/reports/atlas-gemma-rank-onnx-layer2-full-control-v1.json`.
      This confirms layer labels cannot be changed independently of tensor geometry; it is not a
      parity result.
- [x] Audited the installed `Gemma4TextAttention` implementation. Sliding layers select
      `head_dim=config.head_dim` and `sliding_window=config.sliding_window`; full layers select
      `global_head_dim` and do not share the same rotary geometry. Both use the same bidirectional
      switch (`is_causal = use_bidirectional_attention != "all"`). No source patch was made.
- [x] Closed the causal-path investigation: the existing sequence-length, explicit-position,
      fixed-shape, and per-layer probes already exclude causal masking, position derivation, and
      dynamic axes as the primary explanation. The usable deployment reference therefore remains
      the PyTorch FastAPI lane; ONNX/WebGPU stays blocked pending a real fix for traced
      multi-token sliding attention.
- [ ] Root-cause the layer-2 sliding-attention export mismatch before attempting any ONNX runtime
      workaround or browser wiring; retain the final-score parity failure as the promotion gate.
      blocks. Capture finite hidden-state summaries/checksums after each block for the same fixed
      input, then compare the first divergent layer and attention mode (`sliding` or `full`).
- [ ] Keep the probe separate from the exporter and preserve the existing final-score receipt;
      do not patch Transformers, alter the checkpoint, train weights, or promote ONNX output until
      the divergence is localized and a fixed-shape parity fixture passes at `1e-3`.
- [ ] Record exporter/runtime revisions, input token checksum, layer layout checksum, and output
      deltas in a dedicated receipt. If tracing cannot expose stable block boundaries, classify the
      gate as `UNPROVEN` rather than inferring the failing layer.

- [x] `GEMMA-RANK-FASTAPI-01` (2026-09-06) — bounded FastAPI serving proof, sidestepping the ONNX
      parity bug entirely by serving the real PyTorch model directly. Built
      `python/atlas_gemma_rank_service.py`, mirroring `python/atlas_neural_decoder_service.py`'s
      established pattern exactly (lazy-loaded runtime, `/health`, same
      `canonicalAuthority`/`writesPerformed`/`rankHeadTrained` honesty fields on every response).
      Loads the standalone artifact directly (`ATLAS_GEMMA_RANK_ARTIFACT_DIR`, defaults mirror the
      decoder's absolute-then-relative-then-fallback convention) and exposes
      `POST /v1/gemma-rank/score` (batch of texts → last-token-hidden-state-through-rank-head
      scores, same scoring convention every other AtlasGemmaRank proof script already uses).
      **Live-tested end to end, not just written**: started the service locally (port 8122, CPU),
      hit `/health` (confirmed `weightsSha256` matches the standalone artifact's own manifest
      checksum `afcce712ce...39` exactly) and `POST /v1/gemma-rank/score` with two real texts —
      returned finite scores `[12.268, -12.907]`. One real bug found and fixed before this worked:
      the default artifact-dir candidates assume the process runs from the repo root (matching how
      the neural-decoder's Docker `WORKDIR /app` guarantees this) — running it manually from
      `python/` broke the relative default; fixed for this test by setting
      `ATLAS_GEMMA_RANK_ARTIFACT_DIR` explicitly, not by changing the default (correct for the
      intended Docker deployment). **Scores returned by this service are not meaningful relevance
      signals** — same untrained-Xavier-rank-head caveat as every other AtlasGemmaRank proof; this
      closes the serving-pattern proof only, not a production reranker.

      **Dockerfile + compose entry added 2026-09-06, UNBUILT — Docker Desktop's CLI could not
      reach the daemon pipe on this host (`dockerDesktopLinuxEngine`), so `docker build` was never
      run.** Added `docker/atlas-gemma-rank/Dockerfile`, reusing the exact same pinned base image
      as the sibling `docker/atlas-neural-decoder/Dockerfile`
      (`pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime@sha256:d0a2f...411`) rather than introducing
      a second pinned image identity, plus `transformers`/`safetensors`/`tokenizers` on top (the
      one real new dependency surface versus the decoder's plain-torch image). Added a matching
      `atlas-gemma-rank` service entry to `docker/docker-compose.gpu.yml` (port 8122,
      `ATLAS_GEMMA_RANK_DEVICE: cpu` — no CUDA claim), read-only checkpoint volume mount, and a
      Python-based healthcheck (no `curl` in the base image, same pattern as the decoder's entry).
      YAML syntax verified (`python -c "import yaml; yaml.safe_load(...)"`, passes). **Both files
      are source-only and unverified against a real container** — a live Docker daemon check
      (found mid-session: Docker Desktop's own GUI showed an unrelated container,
      `atlas-gpu-8098`, as running, but `docker ps`/`docker info` both failed with the identical
      pipe-connection error regardless of target, so this is a host-level Docker Desktop
      connectivity issue, not specific to this new service) confirmed `docker build`/`docker
      compose up` could not be attempted this pass. Do not treat this image as proven until it
      actually builds and its `/health` + `/v1/gemma-rank/score` endpoints are checked live from
      inside a real container — same bar as every other service in this repo.

### AGMR-MXBAI-TEACHER-01 — distillation eligibility remains open

- [x] Existing mxbai teacher receipt is structurally valid and live, but correctly remains
      `distillationEligible=false`: it contains sigmoid-normalized scores, not raw CrossEncoder
      logits, and its candidates are not proven through the canonical `CandidateOrdinalMapV1`.
- [x] Audited the available Python shadow fixture as a possible bridge. Its identifiers are
      fixture labels (for example `evidence-card` and `firecrawl-provider`), not proven packet,
      symbol, or tree owners. Content hashes provide source evidence but do not establish canonical
      ownership, so this fixture must not be adapted into a production ordinal map by fabrication.
- [ ] Capture a new read-only teacher cohort after canonical ordinal/source-revision binding is
      proven. Preserve the sidecar's normalized score contract and, only if explicitly supported
      by the sidecar, record the raw logit as a separate non-serving training observation; never
      replace the serving score or apply sigmoid twice.
- [ ] Require query/candidate checksums, candidate-set checksum, workspace/source/representation
      revisions, model revision, and complete one-row-per-candidate coverage before allowing
      rank-head or late-interaction distillation.

## 10A. Reranker and browser model-route reconciliation (2026-09-06)

This closes a model-identity ambiguity without changing the canonical reranker.

- [x] The active canonical second-stage reranker is
      `mixedbread-ai/mxbai-rerank-base-v2`, served by the dedicated `:8099`
      sidecar on CUDA. `MixedbreadCanonicalReranker` and the sidecar request
      contract both bind that model identity and apply `sigmoid_once` to the
      raw ranking logit. The live health probe on 2026-09-06 reported
      `model_loaded=true`, `device=cuda`, and that exact model ID.
- [x] The Gemma 4 assistant artifacts are not the reranker and are not browser
      models. The BF16 upstream package is used by the AGMR inventory/shape/load/
      forward proofs; its F16 GGUF sibling is used by
      `scripts/launch-gemma4-mtp-benchmark.ps1` as an optional llama.cpp MTP draft
      model. Both remain target-KV-coupled assistant/MTP machinery, not a standalone
      ranker.
- [x] Exact format sweep resolved the apparent missing integration: the upstream
      `model.safetensors` is `159,138,208` bytes (151.77 MiB) and its config declares
      `bfloat16`; `tokenizer.json` is `32,169,440` bytes (30.68 MiB), with
      `config.json` and `tokenizer_config.json` also required by a Transformers loader.
      The converted `gemma-e4b-assistant-mtp-f16.gguf` is `171,766,880` bytes
      (163.81 MiB / 171.77 MB). The latter is the F16 GGUF draft artifact, not a
      standalone ranker. The safetensors file is currently consumed only by the
      read-only AGMR proof scripts; no live reranker or browser launcher loads it.
- [x] Runtime consumers are format-specific: llama.cpp's MTP launcher consumes the
      GGUF through `--model-draft` beside a target GGUF; the browser helper consumes
      the separate `onnx-community/gemma-4-E2B-it-ONNX` assets; the canonical `:8099`
      reranker consumes `mixedbread-ai/mxbai-rerank-base-v2`. Therefore “the file is
      present” does not constitute integration, and copying the safetensors or
      tokenizer into a runtime directory would not make it a reranker.
- [x] Relocated the two representations into ignored, searchable model paths:
      `models/gemma4_assistant_huggingface_7_3_26/` contains the BF16 upstream
      package, and `models/atlas-gemma4-e4b-assistant/mtp-f16/` contains the renamed
      F16 MTP draft. The launcher, manifest, and AGMR receipts now resolve the new
      paths; artifact bytes and checksums are unchanged.
- [x] Live runtime sweep confirms the assistant is not currently wired into llama-server:
      the active `:8090` process has no `--model-draft` or `--spec-draft-model` argument.
      Repository `.env` is internally fail-closed for MTP (`ENABLE_MTP_DRAFTER=true` but
      `TURBO_PROFILE=turboquant-safe`, whose contract disables speculative decoding) and
      still names the older `.tmp/atomic-mtp` Q4 draft path. This is configuration evidence,
      not a live enablement claim.
- [ ] MTP enablement remains a separate explicitly authorized runtime step: select an
      AtomicBot-compatible llama-server binary, point `MTP_DRAFT_MODEL` at the relocated
      F16 GGUF (or a verified compatible Q4 assistant), set a compatible profile, restart
      only the intended `:8090` process, and prove draft-load/throughput behavior. Do not
      switch the current stock/Ornith server automatically and do not treat MTP drafting
      as standalone reranker integration.
- [x] The active browser Gemma 4 lane is the separate
      `onnx-community/gemma-4-E2B-it-ONNX` model, loaded through the existing
      Transformers.js client path with `q4f16` and WebGPU preference. The local
      static asset is under `sveltekit-frontend/static/gemma4_e2b_onnx/` and
      is a text-generation helper, not a reranker.
- [x] Added the missing `@playwright/test` 1.55.0 development dependency and
      corrected Playwright application-base detection so reserved port `5178`
      (QUIC/Caddy) cannot be mistaken for the SvelteKit app. The focused
      headless `chromium-webgpu` checks passed 3/3: WebGPU API presence,
      E2B hook installation, and availability response shape. The run reported
      `gpu-probe-failed`/no adapter, so real browser GPU inference remains open.
- [x] **Browser model ownership guard** (2026-09-06) Added
      `sveltekit-frontend/src/lib/ai/browser-model-policy.ts` and focused tests. Browser generation
      resolves only to the Gemma 4 E2B ONNX `q4f16` WebGPU helper; browser embeddings resolve only
      to the EmbeddingGemma ONNX `semantic_768` lane; browser reranking fails closed with
      `BROWSER_ATLAS_RERANKER_UNAVAILABLE`. The policy cannot select the MTP GGUF or mxbai sidecar.
      This does not create a browser reranker: a separately exported standalone AtlasGemma artifact
      and ONNX/WebGPU parity receipt remain required.

- [x] **WebGPU executor taxonomy reconciliation** (2026-09-07). The repository's current
      browser path remains `TRANSFORMERS_JS`/ONNX Runtime WebGPU for Gemma 4 generation and
      `ORT_RAW`/ONNX Runtime WebGPU for the EmbeddingGemma `semantic_768` helper. The
      `webml-community/gemma-4-webgpu-kernels` Space is a separate experimental
      `FABLE_WEBGPU_RAW` executor with custom WGSL/Fable kernels; it is not the same runtime,
      model artifact, or reranker. Its QAT mobile model (`google/gemma-4-E2B-it-qat-mobile-transformers`)
      is a separate multi-gigabyte artifact, not the 159 MB BF16 E2B assistant seed. No Fable
      bundle was copied, vendored, installed, or selected by the browser policy.
- [ ] **FABLE-WEBGPU-RTX3060TI-01** — Admit the custom Fable executor only as a bounded shadow
      candidate after pinning the exact Space commit, engine checksum, model revision, and
      shader/kernel manifest. On the RTX 3060 Ti, prove actual WebGPU adapter/device selection,
      deterministic fixed-prompt execution, finite logits, valid token IDs, no subgroup/kernel
      corruption, and parity against a trusted reference. Record TTFT, prefill/decode throughput,
      peak VRAM/RAM, context length, model-load bytes, and network/offline behavior in the existing
      `KernelPerfReceiptV1`/GPU receipt path. This gate must not make Fable a new retrieval lane,
      reranker, fusion owner, or canonical model authority.
- [ ] **FABLE-WEBGPU-PARITY-02** — Compare the Fable shadow against the existing ONNX/Transformers.js
      browser helper on a frozen prompt set and against a trusted server reference. Require valid
      output-shape/token checksums and a documented quality/performance decision before any browser
      deployment consideration. `npm run dev:gpu` remains the server-side Ornith/Vite launcher and
      is not evidence for this browser-specific gate.

The existing `dev:gpu` command starts the server-side Ornith `:8090`, optional
EmbeddingGemma lane, NLP sidecar, and Vite. It does not launch Chrome and does
not select the mxbai `:8099` reranker. Browser proof is a separate Playwright
project and must not be interpreted as server-reranker promotion.

## 11. Score-type-aware normalization, calibration identity, and rollout Phase D (2026-09-06, operator review)

A second same-day operator review correctly identified a real limitation in an already-shipped
contract, not a hypothetical future concern — verified by reading the live code, not assumed:
`sveltekit-frontend/src/lib/server/atlas/contracts/candidate-relevance-scores-v1.ts`'s
`TextRelevanceScoreV1Schema` hard-codes exactly one normalization shape
(`logitDelta` + `probability: sigmoid(logitDelta)`), which is correct for mxbai's margin-based
scoring but will NOT generalize to AtlasGemma's proposed late-interaction MaxSim head — a MaxSim
score's magnitude depends on query token count, projection dimension, normalization, and masking,
so blindly applying the same `sigmoid()` to it would silently produce a meaningless value. This is a
genuine, confirmed gap in the closed `parent-atlas-retrieval-staging-planes` change's contract, not a
new invention — recorded here (the AtlasGemma owner file) rather than by reopening that closed
change, per this file's own established practice in section 9.

- [x] **Score-type-aware normalization contract** (2026-09-06) Added
      `sveltekit-frontend/src/lib/server/atlas/contracts/text-relevance-observation-v2.ts` and
      focused tests. `TextRelevanceObservationV2` now carries `scoreType`
      (`MXBAI_MARGIN` | `ATLAS_GEMMA_CROSS_LOGIT` | `ATLAS_GEMMA_MAXSIM`), `rawScore`, and
      separate `normalizedScore`/`normalization` (`SIGMOID_V1` | `LATE_HEAD_CALIBRATION_V1` | `null`).
      The deterministic helper applies sigmoid exactly once only to margin/cross-logit scores;
      uncalibrated MaxSim stays unnormalized, while any late-head calibrated value is kept in a
      distinct `calibratedScore` field. The schema rejects missing or mismatched normalization,
      disguised MaxSim probabilities, non-finite raw values, and calibration without its explicit
      method marker. This is additive and does not alter the live mxbai sidecar or existing V1
      consumers. Tests: 8/8 passed.
- [x] **`CalibrationIdentityV2`** (2026-09-06) Added alongside
      `TextRelevanceObservationV2`. `CalibrationIdentityV2` is keyed on the full tuple
      `{scoreType, modelRevision, adapterRevision, weightRevision, domain (code|legal|mixed),
      inferenceMode (late32|late64|late128|cross|mxbai), quantization (bf16|fp16|int8|int4),
      labelSetRevision, calibrationMethod}` and receives a deterministic checksum helper. The
      observation schema requires the identity to match every applicable model/domain/runtime axis
      before accepting `calibratedScore`; uncalibrated observations keep it `null`. Tests cover
      changed-axis checksum invalidation and cross-model identity rejection. No global calibration
      curve, reviewed labels, or calibrated production score was created.
- [x] **`LateInteractionHead` (MaxSim) bounded primitive** (2026-09-06) Added
      `sveltekit-frontend/src/lib/server/atlas/retrieval/late-interaction-maxsim-v1.ts` and focused
      tests. The helper validates revision-qualified representation metadata, token ordinals, vector
      dimensions, and finite values, then computes raw ColBERT-style MaxSim over an in-memory bounded
      cohort. It supports only the nested 32/64/128 dimensions and never applies sigmoid or creates
      a probability. This is explicitly not a full-corpus token index, cache writer, PLAID lifecycle,
      or retrieval/fusion owner. Tests: 8/8 passed. Broader representation materialization remains a
      separate gate.
- [ ] **Rollout Phase D** (extends this file's existing 3-phase shadow rollout, section 9, with a
      4th phase gated behind Phase C's cache-and-escalation evidence): once `SpanHead`/`RouteHead`
      pass their own shadow evidence (MICRO-03/04-equivalent gates for those heads specifically),
      `SpanHead` replaces routine `LangExtract` calls and `RouteHead` assists ACE's DAG decisions,
      with `mxbai` and `LangExtract` remaining as oracles/fallbacks rather than being removed. This
      is a target-shape note only — no head exists yet to gate this phase on.

**Verified already-satisfied, no action needed**: the review's concern that Ornith VLM might need to
borrow Gemma's multimodal projector is already false in this repo — `models/model-manifest.json`'s
`ORNITH_MODEL_GEMMA_PROJECTOR` entry (despite its confusing id) documents a real, separate, official
`mmproj-Ornith-1.5-9B-BF16.gguf` (880MB, SHA-256-verified against the HF-published ETag), explicitly
noting "Never load this against a gemma4-family model, and never load gemma4-mmproj against
ornith-1.5." AtlasGemma ranking work needs no vision projector at all, and Ornith needs no borrowed
one — both already true, not a gap this proposal closes.

**Noted, not actioned**: the review's WebGPU/Transformers.js v4 correction (Node/Bun/Deno can now run
ONNX Runtime WebGPU directly, so a future ONNX export of a standalone AtlasGemma checkpoint would not
need headless-Chrome/Playwright unless proving literal browser parity) is recorded here for whoever
reaches the "ORT/TensorRT parity, WebGPU after that" step this file's section 9 already lists last in
its build order — no ONNX export exists yet to apply this to.

**Explicitly not authorized by this section**: implementing `TextRelevanceObservationV2`,
`CalibrationIdentityV2`, `LateInteractionHead`, or Phase D. Same planning-only discipline as sections
7-10.

## 12. Flagged risk — active MTP benchmark script may hit an architecture mismatch (2026-09-06)

**Not this session's work — flagging a live risk in a concurrently-active script, not touching it.**
`scripts/launch-gemma4-mtp-benchmark.ps1` (repo root scripts/, modified today 2026-09-06 16:52 —
active, current work, likely by a concurrent session) launches
`Desktop/llama-server-cuda/llama-server.exe` (mainline build, version 8757) with
`--model-draft` pointed at `models/atlas-gemma4-e4b-assistant/mtp-f16/atlas-gemma4-e4b-assistant-mtp-f16.gguf`
(the F16 sibling of the same assistant checkpoint this file's AGMR sections analyze), paired against
`models/gemma4-legal-iq4xs-direct.gguf` as the main/target model.

**The risk**: verified via direct `--help` inspection of both real llama-server.exe builds on this
machine (`Desktop/llama-server-cuda` mainline and `Desktop/llama-turboquant-gemma4`'s custom Gemma4
fork) that **neither advertises support for Gemma4's actual MTP-assistant architecture** — only
generic `--model-draft`/`-md` speculative decoding, which assumes two fully independent models each
running a complete forward pass. `AGMR-01`'s own checkpoint-inventory finding (this file, section
7) is that the real assistant checkpoint is **target-activation/KV-coupled**
(`pre_projection`/`post_projection` tensors, `num_kv_shared_layers=4` in its original un-surgered
form, expects to share the target model's hidden states/KV cache directly) — a different wiring
requirement than generic `--model-draft` provides. Running this script as currently configured may
load without error but produce architecturally-wrong behavior (garbage or degraded draft
acceptance), not a clean failure that would be obviously caught.

**Not verified in this pass** (flagging, not proving): whether this specific script has actually
been run yet, and if so what its real output looked like. This is a risk flag based on static
inspection of the script + binary capabilities, not a live-run failure observed directly.

**Recommendation for whoever owns this script**: before trusting any benchmark numbers from it,
verify the actual draft-acceptance behavior is sane (e.g. check `n_draft_accepted`/similar telemetry
in the server's own logs or `/props`, not just that the process starts and serves requests) — a
silently-degraded draft model can still produce a running server with plausible-looking latency
numbers that don't reflect real speculative-decoding gains. This section does not modify the script
or its running state.

**UPDATE (2026-09-06, same day, web-search-sourced) — the wrong mechanism entirely, not just an
unverified pairing.** Real upstream llama.cpp Gemma4-MTP support exists:
[PR #23398 "llama: add Gemma4 MTP" by am17an](https://github.com/ggml-org/llama.cpp/pull/23398)
(reports >2x speedup, 70-87% draft acceptance), tracked from
[discussion #22735](https://github.com/ggml-org/llama.cpp/discussions/22735). Two things the current
script gets structurally wrong per that PR's own design, not just an unproven architecture pairing:
1. **Wrong flag.** Real Gemma4-MTP uses `--spec-draft-n-max` (a Gemma4-MTP-specific flag), not the
   generic `--model-draft`/`-md` this script passes.
2. **Wrong artifact shape.** Per the PR's own usage model, Gemma4 GGUF conversions are meant to
   bundle the MTP draft data as an additional file *inside the same GGUF conversion package* — not
   a wholly separate, independently-converted assistant GGUF pointed at via `--model-draft`, which is
   what `models/atlas-gemma4-e4b-assistant/mtp-f16/atlas-gemma4-e4b-assistant-mtp-f16.gguf` is.

**Re-verified against both real local binaries, live, just now**: grepped `--help` output of both
`Desktop/llama-server-cuda/llama-server.exe` (mainline v8757) and `Desktop/llama-turboquant-gemma4`'s
fork for `spec-draft`, `mtp`, `nextn` — **zero matches in either binary**. Neither has the real
PR #23398 support merged. A separate fork surfaced by the same search,
[`AtomicBot-ai/atomic-llama-cpp-turboquant`](https://github.com/AtomicBot-ai/atomic-llama-cpp-turboquant)
("TurboQuant WHT-rotated KV cache + Gemma 4 MTP and Qwen 3.6 NextN speculative decoding"), explicitly
advertises this exact capability — **not confirmed whether it's the same fork as the one already on
this Desktop or a different/newer one**, and not yet built or tested here.

**Corrected bottom line**: this isn't "an unverified pairing that might not work" — it's very likely
the wrong CLI flag entirely, on a binary confirmed to lack the real feature, pointed at a GGUF shaped
for the wrong usage pattern. Fixing this needs either building/acquiring a binary with real
`--spec-draft-n-max` support (possibly the AtomicBot fork above, unverified) and following its actual
bundled-GGUF conversion approach — not adjusting flags on the current mainline binary.

**Real evidence found (2026-09-06): a genuinely MTP-capable binary WAS actually run on this
machine at some point, and it did not work cleanly.** `.tmp/atomicbot-e4b-mtp-8091.err.log` and
`.tmp/atomicbot-legal-mtp-8092.err.log` (log files only — no `atomicbot` source repo or binary found
under `.tmp/` or in the Desktop locations checked so far; the binary's exact current location is
NOT confirmed) contain real `[spec]`-module and per-slot `draft acceptance` telemetry that neither
of the two binaries checked above produces — meaning whatever ran here had real MTP/spec-draft
support, unlike `Desktop/llama-server-cuda` or `Desktop/llama-turboquant-gemma4`. The real log
output:
```
E llama_init_from_model: failed to initialize the context: Gemma4Assistant requires ctx_other to be set
W srv load_model: [spec] failed to measure draft model memory: failed to create llama_context from model
I slot print_timing: draft acceptance = 0.16667 (1 accepted / 6 generated)
```
So: a real attempt happened, hit a real initialization error (`ctx_other` not set — a Gemma4-
Assistant-specific context-wiring requirement neither generic binary understands either), and even
where it partially ran, draft acceptance was very poor (16.7%, 1/6) — consistent with a
degraded/broken setup, not working speculative decoding. **Not yet found**: which binary produced
this log, or whether it's the AtomicBot fork, a locally-built variant, or something else. This is a
real, concrete lead for whoever picks this up next — find the binary that produced these two log
files (check recent process history, `ps`/Task Manager artifacts, or search more of the Desktop/
other drives) before assuming a new fork needs to be built from scratch.

## 9. Browser ONNX and pgvector/Drizzle alignment (2026-09-07)

- [x] **ONNX-WEB-RUNTIME-ALIGNMENT-01** — The browser lane now declares and installs a direct,
      exact `onnxruntime-web@1.29.0` dependency. Before this correction, imports of the bare
      `onnxruntime-web` package resolved to the transitive `@xenova/transformers` 1.14.0 build,
      which has no `./webgpu` package export. `src/lib/ai/onnx/session.ts` now selects the
      official `onnxruntime-web/webgpu` entrypoint when WebGPU is requested and keeps the base
      entrypoint for WASM/CPU fallback. Focused browser consumers pass 10/10. This is
      dependency/selection proof only; it is not live browser GPU execution or AtlasGemmaRank
      quality proof.
- [ ] **ONNX-WEB-RUNTIME-ALIGNMENT-02** — Run a real browser session against a small checked-in
      ONNX fixture and record selected provider, finite output, model checksum, and WASM fallback.
      Do not claim WebGPU from `npm run dev:gpu`: that launcher starts the Vite/llama-server
      development stack and does not itself prove a browser WebGPU session. Do not admit the
      untrained AtlasGemmaRank export; `ONNX-EXPORT-01` remains blocked by multi-token parity and
      browser artifact size.
- [ ] **PGVECTOR-EXECUTOR-NAMING-01** — Keep PostgreSQL/Drizzle declarations limited to the
      canonical `semantic_768` vector and its explicitly qualified HNSW projection. Official
      pgvector terminology found here is HNSW, IVFFlat, and (where supported by the installed
      version) IVF/PQ-related options; no official pgvector `IVQT` operator/index was found.
      Treat `IVQT` as an unresolved label or typo until a concrete upstream implementation is
      identified. Do not add an index or migration for that name.
- [ ] **PGVECTOR-EXECUTOR-PARITY-02** — If ANN performance work is authorized, benchmark the
      existing filtered PostgreSQL cohort first, then compare HNSW/IVFFlat using the same
      revision-qualified candidate set and recall receipt. Drizzle remains schema/migration
      generation, not a second vector authority; use a custom migration and `migrate` for live
      changes. Qdrant/GPU indexes remain rebuildable projections and SearchRuntime remains the
      single fusion owner.

## AGMR donor B candidate recorded — NOT downloaded, NOT independently verified (2026-09-07)

A separate conversation reported a second potential AGMR donor checkpoint:
`google/gemma-4-E4B-it-qat-q4_0-unquantized-assistant`, 78M params claimed, 159,138,208-byte
safetensors claimed, sha256 `9d0e2053067590cae9a8f4fcc57eefbe20dff90599360458ebd451e5cb5c947d`
claimed. Checked before recording anything:

- **Donor A (`models/gemma4_assistant_huggingface_7_3_26/model.safetensors`) is untouched and its
  recorded checksum is confirmed live-accurate**: re-ran `sha256sum` on the actual file myself —
  `12875062fc25c51e8fa9b62abd2de7ad48b7d63f8559d5d604fbd5a3d6bcff16`, matching both
  `atlas-rank-manifest.json`'s `source.weightsChecksum` and
  `docs/reports/atlas-gemma-rank-checkpoint-inventory-v1.json`'s `files.weights.sha256` exactly.
  Confirmed genuinely different from the claimed donor B hash — not a silent-substitution risk as
  described, and nothing about donor A was modified in this pass.
- **Donor B has NOT actually been downloaded to this machine.** `.tmp/google-gemma4-e4b-assistant/`
  exists but contains only an empty `.cache/huggingface` directory — no `model.safetensors`, no
  `config.json`. This means the claimed byte size and SHA-256 for donor B are **unverified by
  this session** — recorded as reported, not independently confirmed against a local file.
- **One coincidence worth flagging, not necessarily a red flag**: donor B's claimed byte size
  (159,138,208) is identical to donor A's real, confirmed size. This is plausible and not
  necessarily suspicious — a QAT ("quantization-aware training") checkpoint released in
  "unquantized" form typically keeps the original tensor dtypes/shapes (weights are trained under
  simulated quantization but stored full-precision), which would produce identical file size with
  different weight values (hence a different hash) — exactly what's claimed. Still, this should
  be verified against the real downloaded file's tensor shapes/config before promoting donor B to
  anything beyond "candidate," per this repo's own evidence-integrity rules.
- **Do not overwrite donor A.** Per the reporting conversation's own instruction and this repo's
  archive-not-delete convention: if/when donor B is actually downloaded, it belongs at a distinct
  path (e.g. `models/gemma4_e4b_qat_assistant_<date>/`), with its own
  `atlas-gemma-rank-checkpoint-inventory-*-donor-b-v1.json` sibling report — never overwriting
  `models/gemma4_assistant_huggingface_7_3_26/` or its existing inventory/manifest files.

**Status: DONOR_B_CANDIDATE_UNVERIFIED_NOT_DOWNLOADED.** No file was created, moved, or modified
for donor B in this pass — recording the claim and the verification gap only.

## AGMR donor B — downloaded and independently checksum-verified (2026-09-07, same day follow-up)

Closed the verification gap above properly, in the right order: fetched the Hugging Face API's
own model listing (`?blobs=true`) for `google/gemma-4-E4B-it-qat-q4_0-unquantized-assistant`
**before** downloading anything, confirming the repo genuinely exists and its `model.safetensors`
LFS entry independently reports `size: 159138208` and `sha256:
9d0e2053067590cae9a8f4fcc57eefbe20dff90599360458ebd451e5cb5c947d` — matching the earlier claim
exactly, straight from HF's own metadata, not just re-stated. Only then downloaded all 6 files to
`models/gemma4-e4b-qat-assistant-2026-07-20/` and re-computed `sha256sum` locally: both
`model.safetensors` and `tokenizer.json` match their HF-reported LFS hashes exactly.

**Bonus finding**: `tokenizer.json`'s hash (`75a6583c1a418e2bbd79c60d95d28e0f5bf549ad3f2990b5bdb5238c6c2bf70c`)
is byte-identical to donor A's tokenizer (same value already recorded as `tokenizerChecksum` in
`atlas-rank-manifest.json`) — the two donors genuinely share one tokenizer/vocab, as expected for
a QAT fine-tune of the same base model, not two unrelated checkpoints coincidentally named alike.

**Architecture compatibility independently confirmed, not assumed**: manually parsed donor B's
safetensors binary header (no external dependency — the 8-byte length-prefixed JSON header format
is public) and compared all 50 tensor names/shapes/dtypes against donor A's existing inventory
(`atlas-gemma-rank-checkpoint-inventory-v1.json`) — **every one matches exactly** (same
`masked_embedding.centroids.weight [2048,256]`, same `pre_projection.weight [256,5120]`, same
4-layer BF16 shapes, etc.). `config.json` diffs to only two harmless fields (`eos_token_id` list,
`transformers_version` string). This means donor B is a genuine same-architecture QAT fine-tune,
not a structurally different or mismatched artifact wearing a similar name.

**Filed correctly, following the "do not overwrite A" instruction**:
- Directory: `models/gemma4-e4b-qat-assistant-2026-07-20/` — added to `models/.gitignore`
  (confirmed via `git status --short`: genuinely untracked/ignored) alongside donor A's existing
  ignore rule, **not merged into it**.
- Confirmed still `rg --no-ignore`-searchable inside the ignored directory, per this repo's
  established convention for these binary model directories.
- Registered in `models/model-manifest.json` (the tracked, rg-searchable discoverability index)
  as a new entry `gemma4-e4b-qat-assistant-donor-b`, `canonical: false`,
  `role: agmr-donor-candidate`, explicitly noting it is not loaded/forward-tested/promoted.
  Re-parsed the whole manifest as JSON afterward to confirm it's still well-formed.
- Full inventory: `docs/reports/atlas-gemma-rank-checkpoint-inventory-donor-b-v1.json`.

**Still not done, correctly**: loading donor B into the AGMR standalone-init pipeline, any forward
pass, and any parity/quality comparison against donor A. Do not promote donor B over donor A
without that evidence — this pass is acquisition + verification only.

## AGMR donor B — standalone-init export run successfully, zero code changes (2026-09-07, follow-up)

Closed the first item in the "still not done" list above. Found the real execution environment
first rather than guessing: neither the RAPIDS WSL2 env (`atlas-rapids-cu13`) nor any Windows
`.venv*` had `transformers`+`torch`+CUDA together; the actual AGMR environment is
`/home/james/.venvs/atlas-cutile-cu132/` (`torch 2.14.0+cu132`, `transformers 5.5.0`, CUDA
available, `Gemma4ForCausalLM` importable) — matches this file's own MICRO-05-CUDA section's
"PyTorch 2.14.0+cu132" reference exactly.

Ran the **existing, completely unmodified** `python/atlas_gemma_rank_standalone_init_export_v1.py`
(same script that produced donor A's artifact) with `--checkpoint-dir` pointed at donor B and
`--seed 17` (same seed as donor A, so the newly-initialized K/V-projection tensors are comparable
rather than confounded by a different random draw), output to a new sibling directory
`models/atlas-gemma-rank-v1-donor-b/standalone-init-bf16/` — donor A's own directory
(`models/atlas-gemma-rank-v1/standalone-init-bf16/`) was never touched.

**Result: clean, zero shape mismatches.** `tensorInventory.shapeMismatches: []`,
`exportedTensorCount: 60` / `inheritedTensorCount: 46` / `initializedStandaloneAttentionTensorCount:
12` — identical structure to donor A's own manifest. `derivedConfig` (`hiddenSize: 256`,
`numHiddenLayers: 4`, `numAttentionHeads: 4`, `numKeyValueHeads: 2`) also matches donor A exactly.
`source.weightsChecksum` in the new manifest correctly reads donor B's hash
(`9d0e2053...c947d`), confirming no accidental cross-wiring between the two donors.
`forwardExecuted: false`, `trainingPerformed: false`, `cudaAllocated: false`,
`canonicalAuthority: false` — correctly conservative, matching donor A's own status discipline,
not overclaiming readiness.

**Status now: `DONOR_B_STANDALONE_INIT_EXPORTED_ZERO_SHAPE_MISMATCHES`.** Still not done: any
forward pass, any AGMR-01-style CUDA probe, and any parity/quality comparison against donor A —
those remain separate, real, un-started gates. This step only proves donor B loads cleanly
through the identical untouched pipeline; it says nothing about rank-head quality or output
parity yet.

**Tensor-count correction (external review caught a real gap in my summary, not in the data)**:
"60 exported / 46 inherited / 12 initialized" only sums to 58 as stated. Checked the manifest
directly — the missing 2 are not unclassified: `tensorInventory.rankHeadTensorNames` already
names them explicitly (`atlas.rank_head.weight`, `atlas.rank_head.bias`), so 46 + 12 + 2 = 60.
This was an omission in my own summary, not a real gap in the underlying export — the manifest
already had the full accounting.

## AGMR-DONOR-B-FORWARD-01 — CUDA forward probe run, same category result as donor A (2026-09-07)

Reused the existing `python/atlas_gemma_rank_cuda_forward_probe_v1.py` completely unmodified
(same script that already produced donor A's forward-probe receipt) — this is the actual
derived `atlas_gemma_rank` architecture path (builds the standalone model in-process via
`build_model()`, not `AutoModelForCausalLM.from_pretrained()` on the raw assistant checkpoint —
correctly avoids the target-coupled MTP-assistant architecture, matching the caution raised
against using the stock HF assistant forward). One real invocation mistake caught and fixed
before the working run: `build_model()` reads `config.json` and expects the ORIGINAL raw
checkpoint's nested `text_config` shape — pointing it at the already-exported
`standalone-init-bf16` directory's flattened config fails closed with `TEXT_CONFIG_MISSING`.
Confirmed via `docs/reports/atlas-gemma-rank-cuda132-forward-smoke-v1.json` that donor A's own
proof was likewise run against its *original* checkpoint dir, not the standalone-init output —
same convention followed for donor B.

**Real result, same seed (17), same fixture (script's built-in 3-row input_ids), same CUDA
environment (`atlas-cutile-cu132`)**:

```
                    donor A                              donor B
status              CUDA_BF16_FORWARD_FINITE_ORDER_PROVEN_PARITY_OPEN  (same for both)
absoluteMaxDelta    0.3125                                0.40625
bf16UlpParity       false                                 false
```

Both land in the identical status category — CPU/GPU forward both finite, both exactly
repeatable on their own device, ranking order agrees between CPU and GPU — but neither reaches
tight BF16-ULP numerical parity (consistent with this repo's own prior finding elsewhere that
BF16/FP16 vs FP32 parity is not resolved generally). Donor B's CPU/GPU delta is somewhat larger
than donor A's (0.406 vs 0.3125) but the same order of magnitude and the same non-parity
classification — not a red flag on its own, just a data point. Receipt:
`docs/reports/atlas-gemma-rank-cuda-forward-donor-b-v1.json`.

**Not done in this pass**: environment-identity freezing inside the receipt itself, direct
donor-A-vs-donor-B output-value comparison, `AGMR-ORDERED-EMBED-01`, anything
training/quantization-related. `orderedEmbeddingAlignment` remains `BLOCKED` regardless of this
forward-pass success — a successful forward proves weights load and shapes/GQA geometry work,
not that token-row semantic alignment or ranking quality is correct.

## MATH-backend SDPA pinning added, real run — did NOT improve parity, honest finding (2026-09-07)

Added the suggested `--attention-backend {auto,math}` flag to
`atlas_gemma_rank_cuda_forward_probe_v1.py` as a small additive change (new optional parameter,
default `auto` preserves prior behavior exactly — regression-checked: re-ran donor A in `auto`
mode and got `absoluteMaxDelta: 0.3125`, byte-identical to the pre-existing recorded receipt).
`math` mode wraps the forward calls in `torch.nn.attention.sdpa_kernel(backends=[SDPBackend.MATH])`.

**Real result, both donors, seed 17, same fixture**:

```
                auto (existing)      math (new)
donor A         delta 0.3125         delta 0.625   rankingOrderAgreement: FALSE → BLOCKED_CUDA_BF16_FORWARD_PARITY
donor B         delta 0.40625        delta 1.0     PARITY_OPEN (still passes the gate)
```

**Honest finding, not spun either way**: pinning MATH did not act as a cleaner reproducibility
oracle here — it produced a *larger* CPU/GPU delta for both donors, and for donor A specifically
flipped which candidate ranks first between CPU and GPU (`rankingOrderAgreement: false`), tripping
the gate to `BLOCKED_CUDA_BF16_FORWARD_PARITY`. This is not evidence the MATH pinning is broken —
`cpuRepeatExact`/`gpuRepeatExact` are both still `true` under MATH (each device stays internally
deterministic across repeats; only cross-device agreement changed), and the rank head is still
Xavier-random/untrained on a 3-row fixture, so near-tied scores flipping order under different
numerics is expected noise from an untrained head, not a correctness defect in either the model or
the new flag. Receipts: `docs/reports/atlas-gemma-rank-cuda-forward-donor-{a,b}-math-v1.json`.
Conclusion: MATH-backend pinning as a reproducibility oracle needs a real trained rank head (or a
less noise-sensitive fixture) before it says anything meaningful — deferred, not abandoned.

## Duplication-prevention flag: HYPERGRAPH-CURRENT-ARITY-CENSUS-01 already exists (2026-09-07)

A separate conversation proposed building `HYPERGRAPH-CURRENT-ARITY-CENSUS-01` from scratch —
same schema name (`atlas.hypergraph-current-arity-census.v1`), same read-only mode, same arity/
revision/integrity fields, even the same exact SQL shape. **This already exists and was already
independently re-run and verified twice this session**: `scripts/atlas/audit-hypergraph-current-
arity-census-v1.mjs` / `docs/reports/atlas-hypergraph-current-arity-census-v1.json`. Read the
actual script: it's not just equivalent, it's a **superset** of what was proposed — it additionally
pre-checks `information_schema` for every required column before running any query
(`SCHEMA_INCOMPLETE` status if a required column is missing) and accepts
`ATLAS_EXPECTED_GRAPH_REVISION`/`ATLAS_EXPECTED_WORKSPACE_REVISION` env vars to actually resolve
`currentBindingProven` when supplied (currently `null`/`null`, hence still `false` — exactly the
"safe_next_command: supply current Graphify and workspace revisions, then rerun" step the proposal
itself asked for, already wired and ready). This is recorded here, not in
`parent-atlas-ontology-kernel` (where the original census finding lives), because it's the second
time in one session this exact gate was independently proposed without finding the existing
script — worth a durable pointer so a third proposal finds this note first.

## Donor B ordered-embedding alignment proof — same status as donor A (2026-09-07, follow-up)

Reused `python/atlas_gemma_rank_ordered_embedding_alignment_proof_v1.py` unmodified against
donor B's checkpoint. Result: `ORDERED_EMBEDDING_PERMUTATION_PROVEN_TARGET_ALIGNMENT_OPEN` —
identical status to donor A, same `embeddingShape [262144, 256]`, `permutationRoundTrip: true`,
`tokenOrderingIsPermutation: true`. Expected and consistent, not a new finding on its own: donor A
and B share one tokenizer (confirmed earlier via identical `tokenizer.json` checksum), so the same
local permutation-round-trip mechanics apply to both. `canonicalTargetAlignmentProven` remains
`false` for both — this gate was never about donor-specific data, it's blocked on a still-missing
canonical/official target embedding table to compare against, independent of which donor is used.
Receipt: `docs/reports/atlas-gemma-rank-ordered-embedding-alignment-proof-donor-b-v1.json`.

**Donor B AGMR status, complete picture as of this session's work**: downloaded → checksum-verified
against HF's own API → standalone-init exported (zero shape mismatches) → CUDA forward probe run
(same PARITY_OPEN category as donor A) → MATH-backend variant run (real, non-improving result,
honestly recorded) → ordered-embedding permutation proof run (same status as donor A). Not done:
any A-vs-B output comparison, canonical target-embedding alignment (blocked for both donors on the
same missing external reference), rank-head training, and promotion decision of any kind.

## Donor A vs donor B direct forward-output comparison (2026-09-07, follow-up)

Built from the two existing `auto`-mode forward-probe receipts already on disk (no rerun needed —
both used the identical fixture: same `input_ids`, same `seed=17`). Confirmed `inputIdsMatch: true`
and `outputShapeMatch: true` before comparing values, per the correct framing already established:
**equality is not the test here** — donor A and donor B are different pretrained weights feeding
an untrained/Xavier-random rank head, so different scores are expected, not a bug.

Real result: `cpuAbsMaxDelta: 18.0`, `gpuAbsMaxDelta: 18.2` (donor B's row-0 score is 25.875 vs
donor A's 7.875 for the identical input row — a large, real divergence). Ranking order differs
between the two donors on both CPU and GPU (`rankingOrderSameAcrossDonorsCpu: false`,
`rankingOrderSameAcrossDonorsGpu: false`). None of this is evaluated as pass/fail — per the
established framing, the only things that matter at this stage are: both executed, same tensor
geometry, both finite, same output schema, same deterministic repeatability (all confirmed) — this
is a data point for a future quality comparison, not a promotion signal. Receipt:
`docs/reports/atlas-gemma-rank-donor-ab-forward-comparison-v1.json`.

**No promotion decision made or implied.** Quality comparison (which donor produces a better
reranker) requires a trained rank head and a real evaluation fixture (e.g. the existing mxbai
teacher corpus), neither of which this comparison touches.

## AtlasGemma reranker boundary — compatibility route (2026-09-07)

Added a read-only OpenAI/llama-server-shaped compatibility route to
`python/atlas_gemma_rank_service.py`:

- `POST /v1/rerank` accepts `model`, `query`, `documents`, and optional `top_n`.
- The requested model must match `ATLAS_GEMMA_RANK_MODEL` (default
  `atlas-gemma-rank-v1`); mismatches fail closed.
- The service combines query/document text for the existing standalone forward path and
  applies sigmoid exactly once at the HTTP boundary.
- Results preserve document indices and return bounded `relevance_score` values.
- The response explicitly remains `rankHeadTrained: false`, `rankingQualityProven: false`,
  `canonicalAuthority: false`, and `writesPerformed: false`.

This wires the transport seam only. It does not replace the canonical mxbai CrossEncoder,
change SearchRuntime fusion ownership, train either donor, or imply live quality parity.
Python syntax validation passed; live service startup and quality evaluation remain open.
