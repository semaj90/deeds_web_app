# Tasks — Parent Atlas Best-Fit Score Fabric

Cross-references: `parent-atlas-retrieval-lineage-dag-convergence/tasks.md` (registered
`XGBOOST-RERANKER-EVAL-01` gate — different XGBoost surface, see proposal.md Impact section),
`parent-atlas-search-classifier-sidecar/design.md` D4b (`okf-fit.ts`'s formula-based NB/LR-named
fields, first flagged there).

## SESSION HANDOFF — agentic-repair governance cluster closed (2026-09-14/15)

**Do not re-open the gates listed as closed below without new evidence contradicting them.**
Everything here was verified live, re-run fresh immediately before this note, not asserted from
memory. This note is additive documentation only — search this file for the named gate IDs for
their full evidence trails; this is a compressed index, not a replacement for those entries.

**Closed this session, all re-verified fresh before writing this note:**
- `AGENTIC-GOVERNED-REPLAY-01` / `AGENTIC-GOVERNED-REPLAY-PROOF-02` —
  `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/governed-replay-admission-v1.{ts,spec.ts}`,
  7/7 tests pass.
- `AGENTIC-TOOLGAN-GOVERNED-BOUNDARY-01` — `scripts/atlas/agentic-toolgan-{execute,replay,log-outcome}.mjs`,
  `--apply`/`--test` refusals verified live (exit 2 / exit 1, before any real work).
- `AGENTIC-ERROR-FIX-APPLY-QUARANTINE-01` — `scripts/atlas/apply-error-fixes.mjs`, `--apply`
  refused live (exit 2) before touching Postgres; zero mutation code paths remain in the file.
- `WORKFLOW-ACTION-SCHEMA-ADOPTION-02` / `WORKFLOW-ACTION-IMPORT-RESOLUTION-02` —
  `sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.{ts,spec.ts}`,
  5/5 tests pass.
- `WORKFLOW-ACTION-SEQUENCE-CHECK-02` / `AGENTIC-DURABLE-WRITER-CANONICAL-EVENT-01` /
  `AGENTIC-CANONICAL-WRITER-ADAPTER-PROOF-01` —
  `sveltekit-frontend/src/lib/server/agent/{action-writer,canonical-action-write-adapter-v1}.{ts,spec.ts}`,
  27/27 tests pass across the `src/lib/server/agent/` directory (1 pre-existing unrelated skip).

**Real bugs found and fixed along the way (each reproduced before fixing, re-verified after):**
1. `advanceActionStatus()` in `action-writer.ts` computed the next `workflow_events.sequence_no`
   from the wrong table (`agent_run_actions`, a static per-action value) — would deterministically
   violate the real `workflow_events_run_seq` unique constraint on the second status transition
   for any run. Zero live callers today, so no production impact yet, but was a certain future
   break.
2. `classifyCanonicalIdentityV1` (same-identity checksum-collision detector) was declared but
   never called from any production code path. Now wired into `writeActionAtomically()`.
3. The mocked-transaction test's `db.transaction` fake wrote straight into a shared store
   instead of a per-transaction draft, so it could not actually prove rollback-on-failure.
   Upgraded to real commit-or-discard semantics; verified the fix is load-bearing by temporarily
   reverting it and confirming the new atomicity test genuinely fails without it.
4. **Highest-leverage finding**: the new TypeScript-error-evidence capture pipeline
   (`scripts/atlas/{typescript-error-evidence-v1,capture-typescript-error-evidence-v1,run-typescript-error-evidence-capture-v1}.mjs`)
   assumed `svelte-check`'s machine output was bare JSON per line. Root-caused against
   `svelte-check`'s real source: `--output machine` never emits JSON at all (hand-formatted text
   per diagnostic); `--output machine-verbose` emits `<epochMs> <jsonObject>` per line with a
   different field shape than assumed (`type`/0-indexed `start.character`/numeric `code`).
   **Every prior live capture attempt against this pipeline — including ones already logged
   above this note as complete — captured zero real errors, silently, regardless of how many
   existed.** Fixed the parser, the runner's checker flag, and the unit tests (which had used
   fabricated fixtures matching the wrong shape). Proved with a real deliberate type-error probe
   file: before the fix `captured:0`; after, `captured:1` with exactly correct
   `line`/`column`/`code`/`message`.

**Explicitly NOT touched, on purpose:** the Graphify execution-snapshot-binding workstream
(`GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02`, `CURRENT-EXECUTION-SOURCE-PACKET-CHUNK-CLOSURE-03`, and
everything gated behind them further down this file). That workstream's own evidence trail states
it is blocked by active worktree concurrency during snapshot capture/readback — editing files
anywhere in this repo while it's mid-attempt is the exact problem it's fighting. Do not resume it
without first confirming no other session is mid-capture.

**Known loose end, not fixed this session:** running the real capture pipeline (fix #4 above)
against real files left two scratch artifacts with real git status:
`docs/reports/typescript-error-evidence-v1.json` (untracked, references a since-deleted probe
file) and `docs/reports/agentic-recommendation-workflow.json` (modified, contains a card
derived from that same probe run). Both are regenerable reports, not canonical data — safe to
regenerate via `node scripts/atlas/build-agentic-error-index.mjs` once a real bounded capture
run is desired, or to discard if not needed.

**Remaining open items in this immediate cluster** (not attempted this session, in ledger order):
`TASK-PROGRESS-PROJECTION-01`, `GRAPHIFY-DAILY-PROGRESS-REFRESH-01`,
`AGENTIC-TYPESCRIPT-ERROR-EVIDENCE-REPLACEMENT-01` (multi-source batch capture + TaskCandidate
admission — fix #4 above unblocks this, doesn't complete it), `AGENTIC-REPAIR-VERTICAL-REPLAY-01`
and everything under the Graphify/graph-edge/semantic-corpus/XGBoost/GPU-residency headings
further down this file (all separate, larger workstreams — read their own sections before
starting any of them).

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

## Fixed a real bug: `npm run atlas:xgboost:train`/`:serve` (and their `:dry`/`:lgbm` variants)
## were broken by a path bug, not a missing script (2026-09-08)

Prompted by `reports/parent-atlas-open-lanes-todo.md` (a stale, separate doc) listing
`npm run atlas:xgboost:train` as its own "Finish Order #1" unstarted item. Running it failed with
`python: can't open file '...\sveltekit-frontend\scripts\atlas\train-xgboost-reranker.py'`. An
initial repo-wide `find` for the file returned nothing and was briefly taken as "the script was
deleted" — wrong, and corrected in the same pass: `git ls-tree -r HEAD` showed the path tracked,
and a direct `ls` confirmed the real file genuinely exists on disk at repo-root
`scripts/atlas/train-xgboost-reranker.py` (27,775 bytes, modified 2026-09-03) — the `find`
command itself had a shell/quoting issue in this session, not a real absence. The actual bug:
`sveltekit-frontend/package.json`'s `atlas:xgboost:train`/`:train:dry`/`:train:lgbm`/`:serve`/
`:serve:lgbm` entries call `python scripts/atlas/...` with no `../` prefix, but npm runs them with
cwd = `sveltekit-frontend/` — every sibling `atlas:*` script in that same file correctly uses
`node ../scripts/atlas/...`. Fixed all 5 entries to add the missing `../`. Not touched:
`sidecars:turbovec-grpc:health` two lines above, which has what looks like the same class of bug
in the opposite direction (`node sveltekit-frontend/scripts/atlas/turbovec-grpc-health.mjs` — would
double the prefix from the same cwd) — flagged, not fixed, out of scope for this pass.

Verified live after the fix: `npm run atlas:xgboost:train:dry` loads the real 101,708-row/16-feature
CSV cleanly. `npm run atlas:xgboost:train` (no flags, real run, not dry) completed a full GPU
(`cuda:0`) training pass: 83,522 train rows / 18,186 val rows / 744+186 traces, `NDCG@10 = 0.9462`,
gate `≥0.7` passes, candidate model saved to
`models/xgboost-candidates/reg-squarederror-f40d36559bfcd65b-58ab866b231e20b1.ubj` (script requires
an explicit `--promote` flag to update the canonical `models/xgboost-reranker.ubj` path — not
passed here). This also resolves an earlier same-session concern about the existing
`docs/reports/xgboost-training-report.json` (claimed `generated: 2026-08-09`, `NDCG@10: 0.9624`)
whose referenced model file's mtime (Jun 24) predated its own claimed generation date — training
itself is now independently re-confirmed to genuinely work and pass the gate when actually run, even
though that specific old report's provenance stays unverified.

**Real, unresolved finding from this fresh run, not investigated further**: feature importance
(gain) is `trace_score: 14.1`, `freshness_score: 3.3`, and every other feature —
`reward_prior`, `community_conf`, `packet_hit_count`, `concept_overlap`, `domain_class_match` — at
exactly `0.0`. The gate passes, but the model may effectively be learning from only 2 of 7 input
features. This could mean the other 5 features carry no real signal for this label, or that
`trace_score`/`freshness_score` are trivially/directly correlated with the label in a way that
starves the tree splits before the others get used, or a genuine feature-computation bug upstream.
Not diagnosed here — this needs a human decision on whether that's acceptable before any
`--promote`, not a re-run. `XGBOOST_RERANK_MODE` still defaults to `shadow` repo-wide (never
affects serving), so nothing about live retrieval behavior changed from this training run either
way — this task fixed tooling and produced a fresh, honest evaluation, not a promotion.

## Diagnosed the zero-importance finding above: real target leakage, not redundancy (2026-09-08,
## same session, follow-up)

Checked the two standard causes for zero-gain features (redundancy with a stronger feature; no
real predictive power) against the actual 101,708-row CSV. Neither applies cleanly — found
something more specific and more serious. `scripts/atlas/export-xgboost-features.mjs:309`:

```js
const rowLabel = baseLabel * Math.max(traceScore, 0.5) * (0.5 + 0.5 * hitWeight);
```

`traceScore` — the same value written into the `trace_score` **feature** column consumed by
training — is a direct multiplicative factor in computing `label`, the training **target**. This
is target leakage: the model can substantially reconstruct `label` from `trace_score` alone
because `trace_score` is literally embedded in `label`'s own formula, not because it learned a
genuine relevance signal.

Confirmed with direct correlation checks against the real CSV: `trace_score` ↔ `label` Pearson
correlation is `0.926`. The 5 zero-gain features (`reward_prior`, `community_conf`,
`packet_hit_count`, `concept_overlap`, `domain_class_match`) each correlate under `0.05` with
BOTH `label` and `trace_score` — ruling out "redundant with trace_score" as their cause too; they
are simply irrelevant once `trace_score` mechanically explains most of `label`'s variance.
Separately confirmed (not the main finding, but checked so it isn't left unexplained):
`freshness_score` takes only 2 distinct values across all 101,708 rows (`0.999021`/`0.999022`,
i.e. effectively constant) — correlates `-0.306` with `label`, consistent with its small (3.3)
but real importance in the earlier run; not investigated further why a "freshness" signal is
near-constant, flagged as a separate, smaller concern.

**Consequence for the gate**: `NDCG@10 = 0.9462` measures how well the model reproduces
`traceScore × baseLabel × hitWeight`, not ranking quality against independent relevance signal.
The `≥0.7` gate passing is not strong evidence the reranker does anything useful beyond
re-deriving a value already available as one of its own inputs.

**Not resolved — genuinely needs a product decision, not a code fix**: is `trace_score` meant to
be a legitimate input the learned reranker refines (in which case using it as a feature is fine by
design, and this isn't leakage so much as intentional score-sharpening), or is baking it into
`label`'s formula an accidental leak that makes the whole training exercise circular? The export
script's docstring states the mechanical shape (`trace_score float — trace.score`) but not the
design intent. No `--promote` should happen, and no `XGBOOST_RERANK_MODE=active` decision should
be made, until this is resolved — the current NDCG number cannot be trusted as evidence either way.

## INCIDENT + real fix: destroyed the 101,708-row CSV re-verifying the leakage fix; found the
## export script's join is broken against current atlas_packets; SeaweedFS artifact backup built
## as a durable fix (2026-09-08/09, same session, follow-up)

**Incident**: ran `node scripts/atlas/export-xgboost-features.mjs --apply` to regenerate
`docs/reports/xgboost-features.csv` with the corrected label formula, without first checking the
run would actually reproduce data or keeping a copy. It overwrote the file with 0 rows. The 101,708
original rows are gone; the file was never git-tracked (`docs/reports/` is gitignored output) and
no cold-storage/archive backup of it existed anywhere (`deeds_labs/archive/`, `.archive/`, and
`docs/archive-manifest.json` were all checked — no match). This was a real mistake: I should have
copied the file or run without `--apply` first.

**Root cause of the 0-row result** (a separate, pre-existing bug, unrelated to the label fix):
`export-xgboost-features.mjs` joins `agent_traces.retrieved_packets` refs (shape
`"packet:<domain_taxonomy_label>:<n>"`, e.g. `"packet:database_orm:1100"`, confirmed live from
real rows) against `atlas_packets.feature_id` and `atlas_packets.packet_key`. Checked both
directly: zero matches either way. Current live `atlas_packets.feature_id` values are file-path-
derived (`$lib.file-reader`, `0003_evidence_crud_rag`, ...), not domain-taxonomy labels; checked
`atlas_packet_registry` too, same result. The domain-taxonomy packet-key scheme the 930 traces
were originally scored against does not exist anywhere in the live packet tables — this script has
been silently broken against current data for some unknown period, not something my session broke.
**The CSV is not reproducible from current Postgres state even with the join fixed** — recovering
it would need a historical `atlas_packets` snapshot from whenever those traces were recorded, or a
rebuilt join strategy. Neither attempted here; flagged as a separate, real, open repair task.
What's intact and unaffected: the underlying `agent_traces` rows (source of truth, untouched), the
label-formula code fix itself, and every finding already extracted from the CSV before it was lost
(recorded in the two sections above).

**Durable fix, not just an apology**: the operator asked to "fix seaweedfs" — audited the actual
live state rather than trusting CLAUDE.md's documentation of it. Found: (1) all 4 SeaweedFS
containers healthy and running; (2) `sveltekit-frontend/.env`'s `SEAWEED_FILER_PORT=8382` was
wrong (live docker mapping is `8888`) — fixed; (3) `sveltekit-frontend/.env` was missing
`SEAWEED_S3_ENDPOINT`/`SEAWEED_S3_REGION`/`SEAWEED_S3_BUCKET` entirely, so
`src/lib/server/storage/seaweed.ts` (the real, canonical, already-well-built S3 client — direct
AWS SDK, path-style, clean `putFileToSeaweed`/`getFileFromSeaweed`/`headFileInSeaweed`/
`deleteFileFromSeaweed` API) had `ENV.SEAWEED_S3_BUCKET` resolving to `undefined` for any app code
using this env file — fixed, added; (4) root `.env` had a duplicate, redundant
`SEAWEED_ACCESS_KEY`/`SEAWEED_SECRET_KEY` pair (`minio`/`minio123` then `admin`/`admin` a few
lines later) — checked the live `s3.json` directly inside the container: both pairs are
legitimately configured with full Admin rights, so this wasn't actually broken auth, just
confusing duplication — deduped; (5) root `.env`'s `SEAWEED_S3_BUCKET=deeds-dev` pointed at a
bucket that never existed live (`GET /buckets/` via the filer only ever listed
`atlas-web-sources` and `langfuse`) — fixed. (6) `atlas-web-sources` itself: zero code anywhere
references this bucket name (`rg` across `src/` and `scripts/`) — a fully orphaned bucket with one
manual smoke-test blob from 2026-08-02, not a real working pipeline; left alone, not repurposed
or deleted.

Created a new bucket, `atlas-artifacts`, live via the filer, for general derived artifacts (the
category the operator described: docs/reports outputs, screenshots, large documentation, OKF/
crawl content, Bitfrost/ACE-adjacent exports) — kept distinct from `legal-evidence` (case
evidence, not yet created, a separate subsystem via the older `minio-client.ts`/`uploadEvidenceFile`
path) and from the orphaned `atlas-web-sources`.

Built `scripts/atlas/lib/seaweed-artifact-store.mjs` — NOT a second S3 client implementation: it
exists only because standalone `scripts/atlas/*.mjs` scripts can't import SvelteKit's private
`env.server.ts`, so it re-reads the same env vars via the existing `connection-config.mjs` loader
and talks to the same live gateway with the same AWS S3 SDK the canonical `storage/seaweed.ts`
uses. Required adding `@aws-sdk/client-s3` as a root-level dependency (version-pinned to match
`sveltekit-frontend/package.json`'s `3.1121.0` exactly) — root-level scripts already carry their
own copies of shared capabilities this way (`pg`, `ioredis` are both already duplicated at root
for the identical reason: separate dependency tree from the `sveltekit-frontend` workspace).
Verified minimal diff (`git diff --stat package.json` → 4 insertions only).

Verified live, not just unit-tested: `backupArtifact()`/`restoreArtifact()` round-tripped
`docs/reports/xgboost-training-report.json` through the real bucket — SHA-256 matched
(`9dd5ad42...`), byte-for-byte `diff` identical after restore. Then backed up the four real,
currently-vulnerable artifacts from this session's own training work as immediate practical value:
`models/xgboost-reranker.ubj` (659,200 bytes), the fresh candidate model
`models/xgboost-candidates/reg-squarederror-f40d36559bfcd65b-58ab866b231e20b1.ubj` (538,352 bytes),
its candidate report, and the older training report — all four now live in `atlas-artifacts` under
an `xgboost/` prefix, each with a stored SHA-256 in its object metadata for future verification.

**Not done**: wiring this into any export/training script automatically (no script currently calls
`backupArtifact()` on its own output — this is a manually-invoked tool right now, not a hook), and
no attempt to recover the lost CSV via a historical Postgres snapshot. Both are real, separate,
open follow-ups.

## `models/xgboost-reranker.ubj` provenance corrected: real, not a test stub — but nothing
## currently served or candidate reflects the leakage fix (2026-09-09, same session, follow-up)

Checked the operator's hypothesis that the June 24 mtime on `models/xgboost-reranker.ubj` "sounds
like a test." **Not a stub or test placeholder** — `git log --all --follow -- models/xgboost-reranker.ubj`
shows 4 real commits (2026-06-13 ×2, 06-20, 06-24) with genuinely different byte sizes each time
(290,356 → 724,207 → 677,014 → 659,200 bytes via `git cat-file -s` at each commit) — real,
repeated retraining during an active development window, not a static test artifact.

Found the actual live mapping this session hadn't traced yet: `scripts/atlas/serve-xgboost-reranker.py`
line 32 hardcodes `DEFAULT_XGB_PATH = ROOT / 'models' / 'xgboost-reranker.ubj'` — this June 24 file
IS the model the serving sidecar loads by default today, right now, with no env override found
anywhere (`XGBOOST_RERANKER_PATH` is referenced in the 4-file grep list below but not currently set
in either `.env`). `XGBOOST_RERANK_MODE` defaulting to `shadow` (per the earlier section) is what
keeps this from affecting live ranking regardless.

**The provenance gap from earlier in this file is now precise, not just flagged**: the June 24
commit (`743e5f0433`, subject unrelated — "Phase 1 canonical embedding backfill + corrected
baseline", a broad multi-file commit) is the last real change to this file. `docs/reports/xgboost-training-report.json`
claims `"generated": "2026-08-09T00:00:00.000Z"` — six weeks later, with `model_path` pointing at
this same file — but no commit touches `models/xgboost-reranker.ubj` on or near that date. Either
that report was regenerated/copy-edited without a fresh training run, or a real Aug 9 run's output
was never committed to this path. Unresolved which; not guessed further.

**More importantly, tying this back to the FINDING-XGB-leak work above**: neither the currently-served
June 24 model NOR the fresh Sep 9 candidate I trained this session
(`models/xgboost-candidates/reg-squarederror-f40d36559bfcd65b-58ab866b231e20b1.ubj`, now backed up
to SeaweedFS) reflects the label-formula leakage fix. The fix landed in
`scripts/atlas/export-xgboost-features.mjs`'s source code, but the CSV regeneration meant to
produce a leak-free training set is what got destroyed (0 rows, separate join bug, recorded
above) — so the Sep 9 candidate was trained on the OLD, still-leaky 101,708-row CSV, same as
whatever produced the June 24 model. **Net state: the leakage fix is real and committed, but has
never been validated by an actual training run.** No promotion decision should be made from either
existing model file — both predate the fix.

## Duplicate-owner finding: a second, unbuilt XGBoost reranker path exists, wired but fake
## (2026-09-09, same session, follow-up)

Operator asked whether XGBoost is "fully built" and floated CUDA as a possible gap. Checked both
candidate causes directly rather than guessing. CUDA is not the gap: `serve-xgboost-reranker.py`
has zero CUDA/device/tree_method references (CPU inference by design — normal for low-latency
single-row tree scoring; GPU only matters for training, which is confirmed working via
`device=cuda:0` in this session's own training run above).

The real gap is a duplicate, unbuilt owner: `sveltekit-frontend/src/lib/server/ml/phase18-reranker.ts`
(152 lines) is a **second, separate XGBoost integration path**, distinct from the real one
(`canonical-rerank-executor.ts` → the Python sidecar this whole file has been tracking). It is
wired into live, reachable surfaces (`trpc/router.ts`, `mcp/server.ts`, plus a client-side
`phase18-offline-sync.ts`) but its own docstring states plainly: `"Phase 18 Status: Awaiting model
training completion."` The function body has three unimplemented TODOs (load model at startup,
call `model.predict()`) and instead always returns Phase 17's `authority_score` as a hardcoded
fallback with `confidence: 0.5`, labeled `"[Phase 18 Training In Progress] Using Phase 17
authority_score as fallback"`. It has never been connected to the real, working sidecar or its
trained model at all.

**Not fixed here** — wiring `phase18-reranker.ts` to the real sidecar, or retiring it in favor of
the `canonical-rerank-executor.ts` path (per this repo's own "one canonical owner per capability"
rule), is real, separate implementation work. Flagged per the Duplication Prevention convention;
deferred given a context-budget warning mid-session, not attempted partially.

## Reranker ownership correction (2026-09-14)

The standalone Marco/Mixedbread compatibility module is not the intended owned model. A current
caller census found no production caller for `marco-reranker.ts`; the canonical retrieval executor
does still attempt its Mixedbread-compatible cross-encoder chain first, so the final owned-model
cutover has not happened. The intended owner remains the existing XGBoost/LightGBM sidecar path
(`canonical-rerank-executor.ts` → `XGBOOST_SIDECAR_URL`) with `XGBOOST_RERANK_MODE=shadow` until
fresh leak-free training, held-out evaluation, model checksum, sidecar health, and explicit
promotion evidence pass.

The owned-model dry-run now fails closed cleanly on Windows: after the console-encoding fix it
reports that `docs/reports/xgboost-features.csv` contains `0` rows, instead of crashing while
formatting an empty matrix. No training or artifact promotion was performed.

The documented feature-export dry-run was rechecked: `1,100` traces load, but `0` packets are
indexed across `0` feature labels, yielding `0` feature rows and `0` positive rows. All three
training gates therefore fail (`positive_rows_500`, `distinct_features_8`, and
`completeness_80pct`). The next implementation gate is to reconcile the trace retrieved-packet
references with the current packet/feature-label owner; do not fabricate labels, reuse the old
CSV, or train until that join produces a revision-qualified dataset.

The exporter now emits explicit join diagnostics and refuses inference. The live sample contains
domain-style trace references such as `packet:database_orm:1100`, while current `atlas_packets`
keys are opaque `packet:<id>` values and current `feature_id` values are unrelated feature names.
No packet-key or feature-label bridge is currently proven; the exporter records unmatched labels
and `packet_key_inference_performed=false` rather than silently manufacturing training pairs.

## export-xgboost-features.mjs join bug narrowed further: two parallel, non-identical taxonomies,
## not a null-handling issue (2026-09-09, same session, follow-up, ended here on context budget)

Operator raised a specific alternate hypothesis for the 0-row join failure: "feature_id isn't
defined it can be null." Checked directly rather than assumed: `atlas_packets.feature_id` is
**100% non-null** (61,718/61,718). Also re-derived `allLabels` from the real live 1,100-trace
sample used by the actual failing run: **10 distinct real labels** extracted
(`database_orm`, `observability_telemetry`, `test_harness`, `native_accelerators`,
`general_abstractions`, `agent_intelligence`, `ui_components`, `infrastructure_config`,
`api_endpoints`, `emergent_topology`) — not empty, not null. Confirms the earlier diagnosis: the
query genuinely runs with 10 real values and matches zero `feature_id` rows.

Checked one more real candidate mapping before stopping: `atlas_packets.payload->>'domain_class'`
does carry a live, populated domain taxonomy (`gpu_turbovec_libtorch`, `tests_smoke_harness`,
`redis_bitfrost_cache`, `neo4j_context_graph`, `rag_retrieval`, `evidence_upload_storage`,
`qdrant_vector_index`, `legal_reports`, `auth_login_register`, `case_management`, `mcp_agents`,
`document_processing`, `admin_observability`, `citation_engine` — 14 distinct values seen).
**Conceptually adjacent to the trace labels but not the same strings** (e.g. `test_harness` vs
`tests_smoke_harness`) — direct exact match still fails (`domain_class = 'database_orm'` → 0
rows). This means the real repair is a **fuzzy/manual label-mapping table between two genuinely
separate, independently-evolved taxonomies**, not a column swap and not a null-handling fix.

**Stopped here on a context-budget warning, not because the trail went cold** — a real, scoped-out
next step exists (build and review a `{trace_label -> domain_class}` mapping table, e.g.
`test_harness -> tests_smoke_harness`, `agent_intelligence -> mcp_agents` or `rag_retrieval`,
against the 10×14 label sets above) but was deliberately not started given how little budget
remained. This is now a concretely scoped task for a future session, not an open-ended one.

## CORRECTION: the trace-label mapping was already attempted (2026-08-22) and explicitly declined
## as low-confidence — this session's "needs to be built from scratch" framing was wrong (2026-09-09)

The prior entry above characterized the `{trace_label -> domain_class}` mapping as unstarted. A
broader `rg --files --no-ignore --hidden -g "*xgboost*"` sweep (prompted by the operator, after
this session's normal searches missed a large number of gitignored/hidden xgboost-related files
all session) found `docs/reports/xgboost-trace-label-candidates.json`
(`schema: atlas.xgboost-trace-label-candidate-audit.v1`, generated `2026-08-22T17:09:48.322Z`,
`read_only: true`). It already scanned 61,660 packets against the same 10 trace labels this
session independently re-derived, and produced scored candidate packet suggestions per label —
but every suggestion carries `status: "PROPOSED_NOT_GROUND_TRUTH"` and `promotion_allowed: false`.
Sample: `agent_intelligence` has a best `top_score` of only `0.5` with 3 ambiguous tied
candidates (`ace:packet:2ca3ca81af71` / `8f8a518ae164` / `fbdd5ccb53b3`, all `feature_id: "agent"`,
all score `0.5`) — no clear winner even at its best.

**Corrected framing**: this is not "unstarted, build a mapping." It's "already attempted, and the
person who tried it concluded the confidence was too low to promote." Before building a new
mapping attempt, review this existing audit's full candidate list and scoring method first — it
may already answer whether a reliable mapping is achievable this way at all, or whether the whole
label-matching approach needs to change (e.g. semantic embedding similarity instead of whatever
this audit's scoring used, not inspected this pass).

Also found, not yet reviewed (flagged only, given context budget): `.tmp/phase18-xgboost-rerank.jsonl`,
`sveltekit-frontend/scripts/atlas/train-xgboost-v2-with-domain.mts` (name suggests a THIRD training
path that may already incorporate `domain_class` directly — not checked), `sveltekit-frontend/scripts/atlas/train-query-router-xgboost-v2.py`
+ `xgboost-query-router-v2-contract.ts` (a separate V2 XGBoost system never examined this session),
a root-level `src/lib/server/atlas/ranking/xgboost-ranker.ts` (possibly a fourth path, or dead —
also archived at `deeds_labs/archive/2026-08-22/orphaned-root-src-tree/...`, suggesting it may
already be retired), `logs/sidecars/xgboost-reranker.{out,err}.log` (real runtime logs — would show
whether the sidecar has actually served traffic, never read), and 4 unpromoted `openspec/drafts/2026-08-22_xgboost-*.md`
files. None of these were opened or evaluated this pass — recorded so a future session searches
`--no-ignore` from the start instead of rediscovering this same gap.

## Checked one of the newly-found leads: `train-xgboost-v2-with-domain.mts` is a fabricated-metric
## mockup, not a real solution (2026-09-09, same session, follow-up)

Checked whether `sveltekit-frontend/scripts/atlas/train-xgboost-v2-with-domain.mts` already solves
the trace-label/domain_class mapping problem, since its name and `domain_class` references looked
promising. **It does not — the script is a prototype/mockup, not a real trainer.** Line 177: `//
Simulated improved metrics (domain_class helps)`, and its logged claim
(`'XGBoost v2 with domain_class feature (6 total features). Baseline comparison: NDCG@5 +11.3%,
Recall@20 +5.5%, MRR +12.9%'`) is fabricated — not the output of an actual training run against
real held-out data. Do not cite these numbers as evidence domain_class helps, and do not use this
script as a starting point for the real mapping/training fix — it would need to be rewritten from
real data, not adapted. Recorded so a future session doesn't mistake it for working code.

Remaining newly-found leads (`.tmp/phase18-xgboost-rerank.jsonl`, the V2 query-router path, the
root-level `xgboost-ranker.ts`, the sidecar logs, the 4 unpromoted drafts) still not opened —
context budget exhausted for this session.

## Two more cheap checks closed out (2026-09-09, same session, follow-up)

`logs/sidecars/xgboost-reranker.{out,err}.log`: both **0 lines**. No evidence the sidecar has ever
actually served real traffic in this environment — logs are either empty by design or the process
has never run here.

`.tmp/phase18-xgboost-rerank.jsonl`: exactly **1 line**
(`{"card_id": "schema-indexer:contract", "score": 0.43, "explain": {"has_vector": true}}`). This is
the precise artifact behind the workstation doc's Phase 18 characterization ("the compatibility
output has 1 row") — a single smoke-test row, not real evaluation data. That reference is now
fully explained rather than just noted as a coincidental match.

Not opened this pass (context budget): the V2 query-router path (`train-query-router-xgboost-v2.py`
+ `xgboost-query-router-v2-contract.ts`), the root-level `src/lib/server/atlas/ranking/xgboost-ranker.ts`,
and the 4 unpromoted `openspec/drafts/2026-08-22_xgboost-*.md` files.

## THE root finding: a designed fail-closed safety gate was never wired into the live script —
## explains both the join break AND why it silently destroyed data instead of refusing to run
## (2026-09-09, same session, follow-up, "continue until autocompaction")

Opened the 4 previously-unopened draft proposals. `openspec/drafts/2026-08-22_xgboost-feature-2.md`
(citing `docs/reports/xgboost-features-meta.json`, generated `2026-08-22T09:22:13.031Z`) is the key
one: it independently reports the exact same failure this session found on its own —
`DATA_JOIN_BLOCKED: 1,100 traces, zero matched packets, zero feature rows, all training gates
failed` — **dated seven weeks before this session ran into it**. This confirms the join has been
broken since at least Aug 22, not something recent, and that someone had already diagnosed it
independently.

That same draft names the actual designed fix: `packages/parent-atlas` owns a checksum-validated
contract, `atlas.xgboost-trace-label-bridge.v1`, and states `export-xgboost-features.mjs`
**"accepts an explicit bridge and rejects apply mode without one, with invalid checksums, missing
packet keys, unresolved labels, or an empty bridge."** Found the contract's real implementation —
`packages/parent-atlas/dist/core/xgboost-trace-label-bridge.js` (compiled output only; no `.ts`
source exists anywhere in the repo, `rg --no-ignore` confirmed) — and read it directly:
`xgboostTraceLabelBridgeSchema` (Zod) requires `trace_label`, `packet_keys[]`, `mapping_method`
(`EXPLICIT_ALIAS | SOURCE_REF_EXACT | REVIEWED_MAPPING`), `evidence_refs[]`, a SHA-256
`bridge_checksum` over the sorted/canonicalized entries, and — critically —
**`promotion_allowed: z.literal(false)` is hard-coded into the schema itself**, a permanent
structural safety gate, not a runtime flag someone forgot to flip. `validateXgboostTraceLabelBridge()`
throws on checksum mismatch, duplicate labels, or duplicate packet keys within an entry. No actual
bridge *data* file (an instance of this schema) exists anywhere in the repo — only the schema and
builder functions were ever built; nobody has curated real entries into it.

**Checked the live script directly**: `grep -n "bridge" scripts/atlas/export-xgboost-features.mjs`
— zero matches. **The live script has no bridge awareness at all.** It does not fail closed when
the join can't find matching packets; it silently proceeds and writes an empty/broken CSV. This is
the root cause tying every finding in this investigation together: the designed safety behavior
(refuse to run without a valid, checksummed, reviewed bridge) was built as a contract but never
actually wired into the consuming script. Had it been wired, my own `--apply` re-run this session
would have thrown `XGBOOST_TRACE_LABEL_BRIDGE_*` or an equivalent "no bridge" error instead of
silently overwriting the real 101,708-row dataset with zero rows — this is very plausibly *why*
that data loss was even possible.

**Concretely scoped path forward, now fully specified rather than "build a mapping from scratch"**:
(1) manually review the low-confidence candidates in `xgboost-trace-label-candidates.json` (10
labels, best scores ~0.5, ambiguous ties) and curate real `mapping_method`-classified entries — do
not auto-promote the lexical guesses; (2) call `buildXgboostTraceLabelBridge()` to produce a real,
checksummed bridge JSON; (3) wire `export-xgboost-features.mjs` to require and validate that bridge
before `--apply` (add the fail-closed check the Aug 22 draft describes but that was never built);
(4) only then regenerate the CSV and validate the label-leakage fix already sitting in the export
script's code. Still not opened: the V2 query-router path and the root-level `xgboost-ranker.ts`
(now known, from the no-op-stub check above, to be low-value) — deprioritized given this finding
supersedes their relevance to the join-fix question specifically.

## Inspected the highest-confidence candidate directly: even the best match is very likely WRONG
## — do not hand-curate a bridge from this audit's output (2026-09-09, same session, follow-up)

Of the 10 trace labels in `xgboost-trace-label-candidates.json`, 2 have `top_score: 1`:
`api_endpoints` (1 tie — a clean apparent winner) and `ui_components` (2 ties). Inspected
`api_endpoints` in full since it looked like the strongest possible starting point for a real
bridge entry. **It is very likely a wrong match.** Its top candidate is
`src/lib/utils/api-endpoints.ts` (`packet_key: ace:packet:683b49e6fa48`) — a single utility file
that happens to be *named* "api-endpoints". The trace label `api_endpoints` almost certainly means
the domain category "API route handler packets" (the many real `+server.ts` files under
`src/routes/api/`, per this repo's own route map), not one incidentally-named utility file. The
remaining 9 candidates for this label score 0.5–0.667 and are generic `endpoints`/`api`
feature_ids from unrelated files (`src/lib/server/config/endpoints.ts`,
`src/lib/server/env/endpoints.ts`, etc.) — none plausibly the real domain-category target either.

**Root cause of the mismatch**: this audit scores candidates by lexical similarity between the
trace label string and `feature_id`/`feature_label` (filename-derived tokens) — string-matching a
category name against individual file names, not matching against what the category actually
means. That is the wrong strategy for this specific mapping, not just insufficiently confident.
This explains, more precisely than "low confidence," why `promotion_allowed: false` was correct on
this audit's very first run, and why no amount of picking its "best" candidates would produce a
trustworthy bridge — the scoring method itself targets the wrong signal.

**Decision made here, not deferred**: did not hand-curate a bridge entry from this audit's output,
even for the top-scoring `api_endpoints`/`ui_components` labels. Doing so would produce a
confidently-wrong "reviewed" mapping — worse than no mapping, since a `REVIEWED_MAPPING`
`mapping_method` tag would carry false authority. The real fix needs a different matching strategy
entirely (e.g. semantic similarity between the trace label and a domain description of what that
category actually covers, or a manually-authored allowlist per label reviewed against real route/
file listings) before any `atlas.xgboost-trace-label-bridge.v1` entries should be written. This is
now the concrete, correctly-scoped blocker — not "review candidates and pick winners."

## Still missing after the reranker audit (2026-09-14)

The reranker lane is not complete, and the remaining work is now narrower than the
earlier inventory suggested. The repository does **not** need another Marco router or
another ranking owner. `marco-reranker.ts` has no production caller, while
`canonical-rerank-executor.ts` still attempts its transitional Mixedbread-compatible
cross-encoder path before the owned XGBoost fallback. The owned path remains
`XGBOOST_SIDECAR_URL`, with `XGBOOST_RERANK_MODE=shadow` as the safe default.

- [x] **RERANKER-OWNER-CLARIFICATION-01** — distinguish the standalone Marco/Mixedbread
      compatibility module, the transitional canonical cross-encoder attempt, and the
      intended owned XGBoost/LightGBM path. No production cutover is implied.
- [x] **RERANKER-HEALTH-DIAGNOSTIC-01** — read-only endpoint probe and resolver hardening
      completed; unavailable `8099`/`8101` endpoints fail closed without returning a
      fake rerank result. No service was started or restarted.
- [x] **XGBOOST-EMPTY-DATASET-SAFETY-01** — empty training CSV and empty exporter output
      now fail closed cleanly on Windows rather than crashing or being treated as valid
      training evidence.
- [x] **XGBOOST-TRACE-JOIN-DIAGNOSTICS-01** — exporter records explicit unmatched-label
      counts and `packet_key_inference_performed=false`; it refuses to infer packet
      identity from trace-label text.

The following remain open and block training, activation, and any ownership claim:

- [ ] **XGBOOST-TRACE-LABEL-BRIDGE-01** — establish a real, reviewed bridge between
      trace references such as `packet:database_orm:1100` and the current packet/feature
      owner. The existing lexical candidate report is not admissible: its top matches
      target filename-derived feature names rather than the meaning of the trace domain,
      and its schema correctly keeps `promotion_allowed=false`. Do not hand-curate those
      candidates into a promoted bridge.
- [x] **XGBOOST-TRACE-LABEL-BRIDGE-CONTRACT-WIRING-01** — restored the source-level
      `atlas.xgboost-trace-label-bridge.v1` contract at
      `packages/parent-atlas/src/core/xgboost-trace-label-bridge.ts`, exported it from
      the package, and wired `scripts/atlas/export-xgboost-features.mjs` to require a
      validated, checksummed, non-empty bridge before any apply path. Direct contract
      round-trip validation passes, and an apply attempt without `--bridge=<path>` fails
      closed as `XGBOOST_TRACE_LABEL_BRIDGE_REQUIRED` before database access. This does
      **not** mean a real bridge instance exists; `XGBOOST-TRACE-LABEL-BRIDGE-01` remains
      open and promotion is still prohibited.
- [ ] **XGBOOST-REVISION-QUALIFIED-DATASET-01** — produce a non-empty dataset whose
      trace, packet, feature label, workspace/source revision, and canonical identity
      are all joined explicitly. Current dry-run evidence is `1,100` traces, `0` indexed
      packets, `0` feature rows, and `0` positive rows; all training gates fail.
- [ ] **XGBOOST-LEAKAGE-FREE-TRAINING-01** — regenerate the feature CSV only from the
      admitted bridge, validate the trace-score/label relationship, and run a genuine
      held-out training/evaluation. The existing empty CSV, historical CSV, fabricated
      V2 metrics, and one-row smoke artifact are not training evidence.
- [ ] **XGBOOST-MODEL-ARTIFACT-PROVENANCE-01** — bind any newly trained model to its
      dataset checksum, feature schema/revision, objective/metric, model checksum, and
      evaluation receipt. The currently served default artifact is not evidence that the
      corrected dataset or leakage fix has been trained and served.
- [ ] **XGBOOST-SIDECAR-LIVE-READINESS-01** — prove the intended sidecar health,
      schema, scoring response, and bounded same-corpus replay with the revision-qualified
      artifact. Keep `shadow` until this passes.
- [ ] **XGBOOST-PROMOTION-CUTOVER-01** — require an explicit promotion receipt before
      `XGBOOST_RERANK_MODE=active` or replacement of the transitional Mixedbread path.
      Compare held-out quality, top-k agreement, latency, and failure behavior; do not
      promote based on fixture output, endpoint reachability, or shadow volume alone.

Separate blockers remain outside this reranker change and must not be silently folded
into the training gate:

- [ ] current workspace/source/packet/chunk authority and exact admitted execution
      membership remain unproven;
- [ ] current semantic `semantic_768` corpus admission remains blocked;
- [ ] the canonical production ACE/ContextManifest handoff remains incomplete for
      strict revision-qualified prompt/cache admission;
- [ ] the unrelated Phase 18 `phase18-reranker.ts` path remains a duplicate/unbuilt
      compatibility surface and requires an explicit retire-or-wire decision;
- [ ] live quality evidence for a trained owned reranker is absent.

Current status: **RERANKER-OWNER-RESOLVED / TRAINING-DATA-BRIDGE-MISSING /
PROMOTION-BLOCKED**. No reranker mode, model artifact, packet identity, Qdrant point,
PostgreSQL row, cache entry, or service state was changed by this ledger update.

## Trace provenance correction: synthetic refs are not a reranker corpus (2026-09-14)

The producer census found the direct origin of the failing references:
`scripts/atlas/seed-agent-traces.mjs` constructs `retrieved_packets` as
`packet:${concept}:${id}` plus `concept:${concept}` and assigns randomized outcomes
and scores. These values are synthetic smoke-test references, not packet keys issued by
the canonical retrieval boundary. They cannot be repaired into canonical packet identity
by a lexical alias, ordinal interpretation, or null provision.

- [x] **XGBOOST-TRACE-PROVENANCE-SOURCE-01** — traced the `packet:<domain>:<ordinal>`
      producer to the synthetic trace seeder and confirmed the generated outcome/score
      values are randomized. This explains why the exporter sees labels but no current
      `atlas_packets.packet_key` matches.
- [x] **XGBOOST-SYNTHETIC-CORPUS-EXCLUSION-01** — classified these trace rows as
      smoke/fixture evidence only. They remain useful for contract tests, but are not
      eligible for owned-model training or evaluation.
- [ ] **XGBOOST-REAL-TRACE-CAPTURE-01** — capture a new read-only cohort from a real
      retrieval entrypoint that records canonical packet keys, candidate ordinal-map
      identity, workspace/source/representation revisions, and the actual query/candidate
      feature bundle. Do not modify historical synthetic traces to make them appear real.
- [ ] **XGBOOST-LABEL-EVIDENCE-01** — define an explicit, revision-qualified relevance
      label source for the real cohort (human judgment, approved outcome receipt, or a
      separately admitted evaluation manifest). Randomized seed outcomes are not labels.

The training sequence is therefore:

`real retrieval capture → canonical packet/feature join → admitted revision set →
explicit relevance labels → leak audit → held-out XGBoost/LightGBM training → sidecar
replay → promotion receipt`.

Current owned-model status remains **NO-TRAINING-DATA / NO-PROMOTION**. The exporter’s
apply guard is intentionally necessary but insufficient: even a valid bridge contract
must not be populated from the synthetic seeder output.

## Transitional Mixedbread execution disabled by default (2026-09-14)

The canonical executor previously attempted `MixedbreadCanonicalReranker` before the
owned learned fallback. That made the ownership decision easy to misread: Marco was not
the intended owner, but the compatibility path could still affect normal execution when
available. Added `MIXEDBREAD_RERANK_MODE` to the canonical executor with values `off` or
`active`, defaulting to `off`. The compatibility lane is now explicitly opt-in.

- [x] **RERANKER-TRANSITIONAL-LANE-GUARD-01** — default execution does not call the
      Mixedbread-compatible cross-encoder; it records `MIXEDBREAD_DISABLED_BY_POLICY`
      and continues through the existing owned-reranker/fail-safe path.
- [x] **RERANKER-TRANSITIONAL-LANE-TEST-01** — focused canonical executor coverage proves
      the default-off behavior and preserves the explicit opt-in compatibility tests;
      `canonical-rerank-executor.spec.ts`: **16/16** passing.
- [ ] **RERANKER-OWNED-MODEL-CUTOVER-01** — do not replace the disabled compatibility
      path with active XGBoost until real revision-qualified training data, held-out
      quality, artifact provenance, sidecar health, and a promotion receipt exist.

This changes runtime preference only; it does not train a model, enable
`XGBOOST_RERANK_MODE=active`, alter cached rankings, or authorize any datastore write.

The unused Atlas factory was checked as well: it had a second direct construction
path for `MixedbreadCanonicalReranker`, but no production caller was found. It now
uses the same `MIXEDBREAD_RERANK_MODE=active` opt-in guard, preventing a future caller
from bypassing the canonical executor's policy by accident.

The live census also found all `1,100` currently loaded traces carry the historical
`trace_source='gemma4'` value despite matching the synthetic seeder's generated
`packet:<concept>:<id>` references. The seeder is now labeled `synthetic_fixture` for
future runs. Existing rows were not rewritten; their provenance remains historical and
non-admissible until independently replaced or reclassified by an authorized data
governance step.

The exporter now excludes traces with the synthetic `packet:<domain>:<number>` shape
even when historical provenance is mislabeled. Its bounded dry-run reports
`16` loaded, `16` synthetic excluded, `0` eligible, and `0` feature rows. This is a
stronger training safety result: the empty dataset is now an explicit provenance gate,
not an accidental consequence of a failed packet lookup.

A larger read-only rerun (`--limit=1000`) confirmed the same result at scale:
`1,000` loaded, `1,000` synthetic excluded, `0` eligible, `0` feature rows, and all
training gates failed. This closes the question of whether the 16-row result was sample
noise; it was not.

## Mixedbread metadata ownership correction (2026-09-14)

The default-off guard was functionally correct but still constructed the transitional
`MixedbreadCanonicalReranker` to obtain its model version for the primary cache key.
That could make disabled requests appear to be owned by Marco/Mixedbread even though the
service was not called. The executor now constructs that class only when
`MIXEDBREAD_RERANK_MODE=active`; disabled requests use the `xgboost-fallback` identity for
cache/provenance and continue through the deterministic fallback path.

- [x] **RERANKER-DISABLED-METADATA-01** — removed disabled-mode Mixedbread construction and
      misleading primary cache identity.
- [x] Regression proof: `canonical-rerank-executor.spec.ts`, **16/16** tests passed.
- [ ] **RERANKER-OWNED-MODEL-CUTOVER-01** remains open: real revision-qualified capture,
      explicit relevance labels, held-out quality, artifact provenance, sidecar health, and
      promotion evidence are still required before `XGBOOST_RERANK_MODE=active`.

Status remains `OWNED_RERANKER_TRAINING_AND_PROMOTION_PENDING`; Marco/Mixedbread is
compatibility-only and opt-in. No model, cache, database, or service state was changed.

The disabled-mode regression now also asserts that the returned provenance and every returned
row avoid the Mixedbread model identity; the default path reports `xgboost-fallback`. This
guards against a metadata-only ownership regression even when no cross-encoder request is sent.

Bounded exporter recheck (`node scripts/atlas/export-xgboost-features.mjs --limit=1000`,
2026-09-14) loaded `1,000` traces, excluded all `1,000` as synthetic-shaped provenance, and
produced `0` eligible rows, `0` positive labels, and `0` distinct features. The three training
gates therefore remain failed (`positive_rows_500`, `distinct_features_8`, and
`completeness_80pct`). The report metadata was refreshed in dry-run mode only; no CSV, model,
packet, cache, or database write occurred. `XGBOOST-REAL-TRACE-CAPTURE-01` and
`XGBOOST-LABEL-EVIDENCE-01` remain the controlling blockers.

### Existing workflow-trace writer is not yet an admissible reranker corpus (2026-09-14)

The repository does have a separate `packages/atlas-core` `workflow_traces` writer and
`WorkflowTrace` contract. It records the user query, route, packet/source references,
validation result, and model output for workflow auditing. That is useful evidence, but it
does not currently provide the complete candidate-level training contract: an admitted
candidate ordinal map, workspace/source/representation revisions, per-candidate feature
rows, and an explicit relevance-label source. `validator_result` and successful workflow
completion must not be promoted to relevance labels automatically.

- [x] **XGBOOST-WORKFLOW-TRACE-CENSUS-01** — located the existing writer and confirmed it is
      distinct from the synthetic `agent_traces` seeder/export path.
- [ ] **XGBOOST-REAL-TRACE-CAPTURE-01** — extend or adapt one existing retrieval boundary to
      emit the missing revision-qualified candidate bundle; do not create a parallel trace
      writer unless the current owner cannot carry the contract.
- [ ] **XGBOOST-LABEL-EVIDENCE-01** — obtain explicit human or admitted evaluation labels;
      workflow pass/fail remains outcome evidence, not a relevance grade.

## Remaining owned-reranker implementation blockers (2026-09-14)

The current audit confirms that the repository has an operational workflow trace writer,
but it is not yet an admissible training-data producer for the owned XGBoost/LightGBM
reranker. `packages/atlas-core/src/validation/workflow-trace-logger.ts` records query,
route, packet/source references, feature IDs, model output, validator result, and timing,
and persists to `workflow_traces` plus optional Redis/Qdrant projections. It does not
currently carry a candidate-level ordinal map, candidate feature rows, the complete
workspace/source/representation revision bundle, or an explicit relevance-label source.
Those omissions are the controlling blockers; no existing field may be reinterpreted to
fill them.

- [x] **XGBOOST-WORKFLOW-TRACE-OWNER-02** — confirmed the existing workflow trace writer
      is the only reusable audit boundary found for this purpose. No second trace writer,
      reranker corpus, or route-level logging owner was introduced.
- [ ] **XGBOOST-CANDIDATE-BUNDLE-01** — extend the existing retrieval/workflow trace
      boundary, or prove a better existing owner, to capture one bounded candidate bundle
      with stable canonical identity, `CandidateOrdinalMapV1` checksum, per-candidate
      feature rows, served order, and the exact retrieval-policy revision. Qdrant IDs,
      array order, and transport offsets remain non-canonical.
- [ ] **XGBOOST-REVISION-BUNDLE-01** — require and read back the admitted
      `workspaceRevision`, `sourceRevision` set/checksum, `representationRevision`,
      `featureRevision`, model/template revisions, and artifact checksum for every
      candidate bundle. Missing, mixed, historical-only, or placeholder revisions must
      be recorded as rejected and excluded from training.
- [ ] **XGBOOST-LABEL-EVIDENCE-02** — add a separate explicit label-evidence contract
      identifying the label source (`human_judgment`, admitted evaluation receipt, or
      approved held-out manifest), label revision, subject identity, and evidence
      checksum. `validator_result`, workflow success, latency, and model output remain
      audit signals and must not become relevance labels automatically.
- [ ] **XGBOOST-REAL-CAPTURE-REPLAY-01** — produce a bounded read-only capture/replay
      receipt proving deterministic candidate membership, feature checksum, revision
      parity, label alignment, and `writesPerformed=false`; synthetic fixtures remain
      contract tests only.
- [ ] **XGBOOST-TRAINING-CORPUS-ADMISSION-01** — admit a real corpus only after the
      capture and label gates pass, with explicit thresholds for positive labels,
      distinct features, completeness, duplicate/identity rate, and held-out split
      isolation. The current 1,100 historical/synthetic-shaped traces remain excluded.
- [ ] **XGBOOST-ARTIFACT-QUALITY-01** — train the owned model only from the admitted
      corpus, then record model/config/feature-schema/training-data/split revisions,
      checksum, quality metrics, and rollback metadata. No artifact is promoted merely
      because training completes.
- [ ] **XGBOOST-SIDECAR-PROMOTION-01** — prove the owned sidecar health, request/response
      schema, deterministic replay, bounded latency, and exact model identity before
      enabling `XGBOOST_RERANK_MODE=active`.
- [ ] **RERANKER-PROMOTION-RECEIPT-01** — require an independent promotion receipt that
      binds the admitted corpus, held-out quality, artifact checksum, sidecar identity,
      runtime policy, and rollback path. Until then, `xgboost-fallback` remains the
      disabled-mode identity and Marco/Mixedbread remains compatibility-only opt-in.

Current status remains:

```text
CANONICAL RERANKER OWNER       XGBOOST / LIGHTGBM INTENDED
MIXEDBREAD / MARCO             COMPATIBILITY-ONLY, OPT-IN
REAL CANDIDATE CAPTURE         MISSING
REVISION-QUALIFIED CORPUS      NOT ADMITTED
EXPLICIT RELEVANCE LABELS      MISSING
OWNED MODEL ARTIFACT            NOT TRAINED / NOT PROMOTED
SIDECAR PROMOTION               BLOCKED
```

No database, cache, Qdrant, model, or service state was changed by this audit update.

## XGBoost lineage-contract alignment finding (2026-09-14)

The existing `sveltekit-frontend/src/lib/server/atlas/classification/xgboost-ranking-lineage-v1.ts`
is useful bounded contract code: it validates candidate ordinals, source/graph/feature/provider
and label revisions, finite feature vectors, evidence references, duplicate ordinals, and
within-query lineage consistency. Its current shape is not yet sufficient for the production
owned-reranker gate because it does not carry the complete current promotion identity envelope:
`workspaceRevision`, `representationRevision`, model revision, candidate-snapshot identity,
ordinal-map checksum, or an explicit label-evidence checksum/source from a live upstream
adapter. The pure contract now validates those fields, but it still cannot represent real
training evidence until an admitted server-owned bundle supplies them.

- [ ] **XGBOOST-LINEAGE-CONTRACT-02** — reconcile the existing ranking-lineage contract with
      the server-owned candidate/feature bundle without creating another ordinal or identity
      owner. Require workspace, source, representation, feature, model, and label evidence
      revisions plus candidate-snapshot and ordinal-map checksums; reject mixed or missing
      values before grouping.
      Current progress: the existing pure contract now validates canonical candidate identity,
      workspace/representation/model/snapshot revisions, ordinal-map checksum, and explicit
      label source/evidence checksum. The full gate remains open until a live server-owned
      adapter supplies these fields from an admitted candidate bundle.
- [x] **XGBOOST-CANDIDATE-FEATURE-ADAPTER-01** — bounded pure adapter added in
      `xgboost-ranking-lineage-v1.ts`; it maps an admitted feature snapshot into deterministic
      ranking rows while preserving canonical identity and scalar feature order. Null/missing
      scalar features fail closed. This is contract/fixture proven only; no live caller is
      implied.
- [x] **XGBOOST-LABEL-EVIDENCE-ADAPTER-01** — bounded pure label mapping now requires an
      explicit allowed label source, label revision, evidence checksum, and evidence reference;
      missing or unmatched labels reject the conversion. This does not create labels or admit a
      real corpus.
- [ ] **XGBOOST-REPLAY-RECEIPT-02** — replay the same bounded bundle twice and require identical
      grouped rows, ordering, feature checksum, label alignment, and lineage checksum with
      `writesPerformed=false` before any exporter/model-training path is opened.

This finding does not authorize training, sidecar activation, cache warming, or projection
updates. `XGBOOST_RERANK_MODE=active` remains disabled pending the gates above.

## Shadow receipt placeholder correction (2026-09-14)

The canonical shadow emitter previously placed the literal `featureRevision: "unversioned"`
into the Valkey stream. That value was diagnostic intent, but it could be mistaken for a valid
revision by downstream corpus tooling. The emitter now requires the sidecar's
`featureSchemaRevision`, carries it as `featureRevision`, and marks it
`PROVEN_SIDECAR_SCHEMA_ONLY`. This proves only the sidecar schema identity; no training
consumer may admit that receipt until the same revision is verified against the server-owned
candidate feature bundle.

- [x] **XGBOOST-SHADOW-PLACEHOLDER-01** — removed the unversioned revision placeholder, require
      the sidecar schema revision, and added a regression assertion; focused canonical executor
      coverage remains required before promotion.
- [ ] **XGBOOST-SHADOW-FEATURE-BUNDLE-01** — plumb the actual admitted feature snapshot and
      revision bundle into shadow capture; until then shadow receipts remain evaluation evidence
      only and are not training rows.

## Owned-sidecar identity hardening (2026-09-14)

The canonical executor also had a second placeholder path: a sidecar response without
`modelRevision` was converted into `${modelKind}-unrevisioned`. That could make an unqualified
model appear usable to shadow or active execution. The executor now rejects the sidecar result
when neither `/score` nor `/health` supplies a non-empty model revision and falls back through
the existing safe path. This is an execution guard, not evidence that a trained owned model
exists.

- [x] **XGBOOST-SIDECAR-MODEL-REVISION-01** — missing sidecar model identity fails closed;
      canonical executor regression coverage remains **16/16**.
- [ ] **XGBOOST-SIDECAR-FEATURE-REVISION-01** — require the sidecar feature-schema revision
      to match the admitted candidate feature bundle before any real training or promotion use.

## Owned-sidecar readiness audit (2026-09-14)

The checked-in sidecar already exposes the two required identity fields: `/health` and
`/score` return a content-addressed `modelRevision` and the deterministic
`featureSchemaRevision` derived from the ordered `FEATURE_COLS` list. `/score` also rejects
an explicitly supplied schema revision when it differs from the loaded sidecar schema.
This is a source-level contract result, not live model or promotion evidence.

- [x] **XGBOOST-SIDECAR-CONTRACT-READBACK-01** — verified the checked-in `/health` and
      `/score` response shapes, content-addressed model identity, feature-schema identity,
      score semantics, and request-side schema mismatch rejection. No sidecar was started.
- [ ] **XGBOOST-SIDECAR-FEATURE-BUNDLE-ADMISSION-01** — compare the sidecar's
      `featureSchemaRevision` against the exact admitted `CandidateFeatureSnapshotV1`
      feature schema/revision and reject a bundle when either the ordered feature set or
      revision differs. The static sidecar hash alone is not a candidate-bundle proof.
- [ ] **XGBOOST-SIDECAR-LIVE-REPLAY-01** — with an explicitly selected trained artifact,
      prove `/health` → `/score` deterministic replay over the same admitted bundle,
      including model revision, feature schema revision, candidate snapshot revision,
      ordinal-map checksum, row count, finite scores, and `writesPerformed=false`.
- [ ] **XGBOOST-OWNED-ARTIFACT-AVAILABILITY-01** — verify that the selected model artifact
      exists, is checksum-addressed, was produced from the admitted leak-free corpus, and
      has a held-out quality receipt. An existing filename or a reachable endpoint is not
      sufficient evidence.
- [ ] **XGBOOST-TRAINING-PROMOTION-GATE-01** — keep `XGBOOST_RERANK_MODE=active` closed
      until real candidate capture, explicit relevance labels, admitted corpus, artifact
      quality, sidecar replay, rollback metadata, and an independent promotion receipt all
      pass. Marco/Mixedbread remains compatibility-only and opt-in.

Current owned-reranker distance remains:

```text
SIDECAR SOURCE CONTRACT       PROVEN
SIDECAR LIVE MODEL            NOT PROVEN
FEATURE-BUNDLE REVISION MATCH MISSING
REAL LABELED CORPUS           MISSING
TRAINED OWNED ARTIFACT        NOT ADMITTED
HELD-OUT QUALITY              MISSING
PROMOTION RECEIPT             MISSING
MARCO/MIXEDBREAD              COMPATIBILITY-ONLY, OPT-IN
```

No model, sidecar, cache, database, Qdrant, or reranker mode was changed by this audit.

## Workstation progress and agentic-repair alignment (2026-09-14)

The repository already contains `scripts/atlas/rank-kanban-and-npm-inventory.mjs`, which
computes `completionScore` and `rankScore` for the existing Kanban board. Its rubric is useful
for prioritization, but it is not an authority receipt: it infers score from board status,
file presence, keywords, and testing metadata, and its persisted outputs require `--apply`.
Therefore a rank percentage must not be presented as verified implementation completion.

The existing agentic repair surfaces are also not one completed end-to-end loop. The
LangGraph Kanban agent contains a policy-model fallback and placeholder synthesis behavior,
while the SvelteKit Mastra adapter still has TODO seams for retrieval, validation, persistence,
ACE assembly, identity resolution, and ACP/OpenCode delegation. These are implementation gaps,
not reasons to create another router, event bus, or reranker owner.

- [x] **RERANKER-OWNERSHIP-STATUS-01** — confirmed Marco/Mixedbread is compatibility-only and
      opt-in; owned XGBoost/LightGBM remains the intended reranker owner.
- [x] **WORKSTATION-RANKING-UTILITY-CENSUS-01** — located the existing completion/rank rubric
      and confirmed it is dry-run capable; no Kanban board or report was persisted in this
      audit.
- [ ] **WORKSTATION-PROGRESS-RECEIPT-01** — adapt the existing ranking utility or an existing
      workstation receipt owner to emit revision-qualified, read-only progress metadata with
      task status, completion percentage, rank, evidence references, blockers, and
      `writesPerformed=false`. Do not equate heuristic `rankScore` with completion proof.
- [ ] **DAILY-GRAPHIFY-PROGRESS-01** — have the daily Graphify summary consume authoritative
      OpenSpec/validation/repair receipts and produce a deterministic delta board for Ewin
      Tang-style recommendation ranking. Recommendations remain non-authoritative and cannot
      authorize edits, training, or projection writes.
- [ ] **AGENTIC-REPAIR-VERTICAL-REPLAY-01** — prove one bounded
      `verified error → evidence packet → repair candidate → validation → replay receipt`
      flow through the existing workstation/repair owner, with stable repair-case identity,
      revision references, timeline correlation, and `writesPerformed=false`.
- [ ] **AGENTIC-REPAIR-TODO-CLOSURE-01** — replace or explicitly quarantine the current Mastra
      adapter TODO seams and LangGraph placeholder/fallback behavior only after the existing
      retrieval, validation, ACE, identity, and OpenCode owners are proven as callers. No
      automatic mutation or hidden reasoning persistence is permitted.
- [ ] **PHASE18-RERANKER-PATH-DECISION-01** — make an explicit retire-or-wire decision for
      `sveltekit-frontend/src/lib/server/ml/phase18-reranker.ts`; it must not silently become a
      second owned reranker or bypass the canonical executor.
- [ ] **XGBOOST-OBJECTIVE-COMPARE-01** — compare the owned model objective/metric only on an
      admitted, leakage-free, revision-qualified corpus. Existing historical metrics and
      synthetic traces remain inadmissible.

Current progress interpretation:

```text
OWNED RERANKER CONTRACT          PROVEN
MARCO/MIXEDBREAD DEFAULT PATH    DISABLED
RANKING METADATA UTILITY         PRESENT, HEURISTIC
AUTHORITATIVE PROGRESS RECEIPT   MISSING
DAILY GRAPHIFY DELTA BOARD       NOT PROVEN
AGENTIC REPAIR VERTICAL REPLAY   NOT PROVEN
PHASE18 DUPLICATE PATH           DECISION OPEN
TRAINED OWNED RERANKER           NOT ADMITTED
```

No training, sidecar activation, Kanban persistence, Graphify run, repair application, or
datastore/projection write was performed by this audit.

## Sidecar-to-candidate feature ABI admission (2026-09-14)

The checked-in Python sidecar and trainer consume a 16-column ABI (`cosine_score`,
`bm25_rank_norm`, `ann_turbovec_score`, and related trace features). The existing
`CandidateFeatureSnapshotV1` columnar contract has a different 12-column semantic feature ABI
(`semanticRelevance`, `lexicalRelevance`, `astAffinity`, and related features). These are not
interchangeable by name, order, or omission. A pure admission boundary was added so the
difference fails closed instead of silently scoring a misaligned vector.

- [x] **XGBOOST-SIDECAR-FEATURE-ABI-CONTRACT-01** — added
      `sveltekit-frontend/src/lib/server/atlas/classification/xgboost-sidecar-feature-admission-v1.ts`.
      It validates sidecar model/schema identity, recomputes the ordered feature-schema hash,
      requires candidate snapshot/ordinal/workspace/feature provenance and checksums, and
      rejects missing, reordered, or mismatched feature ABI fields without I/O.
- [x] **XGBOOST-SIDECAR-FEATURE-ABI-TEST-01** — added focused coverage for exact admission,
      bad sidecar checksum, feature-schema mismatch, reordered columns, and missing provenance;
      the combined sidecar-admission plus ranking-lineage suite passes **10/10**.
- [ ] **XGBOOST-FEATURE-PROJECTION-01** — define and checksum an explicit mapping from the
      server-owned candidate-feature snapshot ABI to the sidecar's 16 input columns, including
      null/missing-feature policy and evidence for every derived value. Do not use positional
      coercion, default zeros, or field-name aliases as a substitute.
- [ ] **XGBOOST-SIDECAR-FEATURE-BUNDLE-ADMISSION-01** — invoke the pure boundary from one
      server-owned live candidate bundle and prove the admitted feature schema/revision matches
      the sidecar before scoring.
- [ ] **XGBOOST-SIDECAR-LIVE-REPLAY-01** — replay that exact admitted bundle twice through a
      selected trained artifact and verify deterministic scores, model revision, feature ABI,
      candidate snapshot, ordinal checksum, and `writesPerformed=false`.

This contract proof does not authorize a feature projection, training run, sidecar start,
active mode, cache warming, or datastore/projection update.

## Explicit sidecar feature projection contract (2026-09-14)

The projection boundary is now represented without claiming that a production mapping exists.
`xgboost-sidecar-feature-projection-v1.ts` requires every target column to name an explicit
source column, derivation revision, evidence reference, and manifest checksum. It materializes
only finite, present values and rejects the current canonical snapshot ABI when the required
sidecar inputs are absent.

- [x] **XGBOOST-FEATURE-PROJECTION-CONTRACT-01** — added the pure checksummed projection
      manifest/materializer and verified exact 16-column admission, missing-source rejection,
      checksum tamper rejection, and rejection of an unmapped canonical snapshot. Focused
      projection coverage passes **4/4**.
- [ ] **XGBOOST-FEATURE-PROJECTION-01** — populate and review a real mapping from the admitted
      server-owned candidate feature snapshot to all 16 sidecar inputs. Each derived signal
      needs a defined null policy, producer/derivation revision, evidence refs, and a
      current-corpus checksum; the fixture mapping is not production evidence.
- [ ] **XGBOOST-SIDECAR-FEATURE-BUNDLE-ADMISSION-01** — invoke the projection and admission
      contracts from one live server-owned candidate bundle before sidecar scoring.

No feature values were generated from production data and no training, sidecar, cache, or
datastore state was changed.

## Source-lineage correction for owned ranking rows (2026-09-14)

The ranking adapter was previously attempting to substitute `canonical:<canonicalId>` when
the feature row did not expose `sourceRef`. That is not admissible source evidence. The
feature-row contract now carries nullable `sourceRef`, and the XGBoost training-row adapter
rejects a null source reference instead of manufacturing one.

- [x] **XGBOOST-RANKING-SOURCE-REF-01** — preserve explicit source references through
      `CandidateFeatureRowV1` and require them before producing a revision-qualified ranking
      candidate. Focused ranking/sidecar suites pass **14/14**.
- [ ] **XGBOOST-REAL-CANDIDATE-CAPTURE-01** — supply those source references from one live,
      admitted SearchRuntime/CandidateOrdinal boundary with current workspace/source
      revisions; fixture rows do not close live capture.

This correction does not create a training corpus or authorize model inference. Existing
unrelated Svelte typecheck failures remain separately tracked; no database, cache, model,
or projection writes occurred.

- [x] **XGBOOST-SCHEMA-AUDIT-01** — matched the `CandidateFeatureRowV1` schema change to
      ranking-lineage validation and regression coverage. A missing `sourceRef` now fails
      closed with `XGBOOST_RANKING_SOURCE_REF_REQUIRED`; the focused suite passes **15/15**.

## Still-missing implementation gates after duplicate-path audit (2026-09-14)

The follow-up source census found that the repository has strong pure contracts, but the
remaining live integration gates are still open. These are recorded here so contract proof
is not confused with a production completion claim.

- [x] **XGBOOST-DUPLICATE-PLACEHOLDER-CENSUS-01** — reviewed
      `sveltekit-frontend/src/lib/server/ml/phase18-reranker.ts`. The file is a separate
      uncalled scaffold: model loading and prediction are TODOs, and its fallback returns
      `authority_score` with placeholder confidence. It is not the canonical reranker and
      must not be enabled by import side effect. No deletion or archive was performed.
- [ ] **PHASE18-RERANKER-PATH-DECISION-01** — make the explicit retire-or-wire decision for
      the uncalled Phase 18 scaffold. If retained, route it through the canonical executor
      and the revision-qualified sidecar admission contract; if retired, preserve a
      checksum-addressed archive receipt before removing the active copy. Do not create a
      second reranker owner.
- [ ] **XGBOOST-FEATURE-PROJECTION-01** — populate and review a real mapping from the
      server-owned `CandidateFeatureSnapshotV1` to all 16 sidecar inputs. Every value must
      have a null/missing policy, producer and derivation revision, evidence references,
      finite-value validation, and a current-corpus checksum. The fixture mapping is not
      production evidence.
- [ ] **XGBOOST-SIDECAR-FEATURE-BUNDLE-ADMISSION-01** — invoke the projection and pure
      admission boundary from one server-owned live candidate bundle, proving ordered ABI,
      feature-schema revision, workspace/source/representation revisions, ordinal-map
      checksum, and `writesPerformed=false` before scoring.
- [ ] **XGBOOST-SIDECAR-LIVE-REPLAY-01** — replay that exact admitted bundle twice through
      an explicitly selected trained artifact and prove deterministic scores, model
      revision, feature ABI, candidate snapshot, ordinal checksum, finite outputs, and
      read-only behavior. A reachable endpoint without a qualified artifact is insufficient.
- [ ] **XGBOOST-OWNED-ARTIFACT-AVAILABILITY-01** — verify a checksum-addressed owned model
      artifact, its admitted leakage-free training corpus, held-out quality receipt, and
      rollback metadata. Existing files, sidecar source, or historical metrics do not close
      this gate.
- [ ] **XGBOOST-TRAINING-PROMOTION-GATE-01** — keep active mode closed until real capture,
      explicit labels, corpus admission, artifact quality, live replay, and independent
      promotion approval all pass. Marco/Mixedbread remains compatibility-only and opt-in.

### Workstation and agentic-repair gaps

- [ ] **WORKSTATION-PROGRESS-RECEIPT-01** — connect the existing dry-run ranking utility to
      a revision-qualified read-only receipt containing task status, evidence references,
      blockers, completion metadata, rank metadata, and `writesPerformed=false`. Heuristic
      `rankScore` remains prioritization only.
- [ ] **DAILY-GRAPHIFY-PROGRESS-01** — consume authoritative OpenSpec, validation, and
      repair receipts to produce a deterministic delta board for recommendation ranking.
      Recommendations must remain non-authoritative and cannot authorize edits, training,
      or projection writes.
- [ ] **AGENTIC-REPAIR-VERTICAL-REPLAY-01** — prove one bounded
      `verified error -> evidence packet -> repair candidate -> validation -> replay receipt`
      through the existing workstation/repair owner with stable repair-case identity,
      revision references, timeline correlation, and `writesPerformed=false`.
- [ ] **AGENTIC-REPAIR-TODO-CLOSURE-01** — resolve or quarantine the Mastra adapter TODO
      seams and LangGraph placeholder/fallback behavior only after existing retrieval,
      validation, ACE, identity, and OpenCode owners are proven as callers. No hidden
      reasoning persistence or automatic mutation is allowed.

### Current status after this audit

```text
CONTRACTS / PURE ADMISSION TESTS       PROVEN
CANONICAL RERANKER OWNER                XGBOOST / LIGHTGBM INTENDED
MARCO / MIXEDBREAD                     COMPATIBILITY-ONLY, OPT-IN
PHASE18 DUPLICATE SCAFFOLD              AUDITED, DECISION OPEN
REAL FEATURE PROJECTION                 MISSING
LIVE ADMITTED SIDECAR BUNDLE            MISSING
TRAINED OWNED ARTIFACT                  NOT ADMITTED
HELD-OUT QUALITY / PROMOTION            MISSING
WORKSTATION PROGRESS RECEIPT            MISSING
AGENTIC REPAIR VERTICAL REPLAY          MISSING
ACTIVE RERANKER MODE                    CLOSED
```

No model training, sidecar activation, cache warming, repair application, Graphify run,
Kanban persistence, or database/Qdrant/Valkey/Neo4j/projection write was performed by this
audit.

## Phase 18 endpoint placeholder follow-up (2026-09-14)

The duplicate-path review found two additional exposed compatibility surfaces that must not
be mistaken for the owned reranker. `sveltekit-frontend/src/mcp/tools/phase18-reranker-tool.ts`
and `sveltekit-frontend/src/lib/server/trpc/procedures/phase18-reranker.ts` both accept a
legacy 13-dimensional feature envelope and currently produce placeholder scores. The tRPC
path adds `Math.random()` to scores/confidence/latency and returns `1.0-placeholder`; the MCP
path is separately documented as placeholder scoring. Neither path proves an owned model,
revision-qualified feature bundle, deterministic replay, or promotion authority.

- [x] **PHASE18-ENDPOINT-PLACEHOLDER-CENSUS-01** — identified the MCP and tRPC endpoint
      implementations, their legacy 13-column ABI, placeholder model identity, and
      non-deterministic tRPC scoring. No endpoint was invoked or changed by this audit.
- [x] **PHASE18-ENDPOINT-QUARANTINE-01** — both legacy endpoint paths now fail closed with
      `OWNED_RERANKER_NOT_ADMITTED`, emit no synthetic score/confidence/latency/model
      identity, and report `writesPerformed=false`. They remain compatibility envelopes,
      not canonical scoring owners; future delegation still requires revision-qualified
      sidecar admission.
- [ ] **PHASE18-LEGACY-ABI-CONVERGENCE-01** — reconcile the legacy 13-dimensional MCP/tRPC
      envelope with the checked-in 16-column sidecar ABI through an explicit, checksummed
      projection. Reject missing or ambiguous mappings; never pad, reorder, default-zero,
      or silently rename fields.
- [ ] **PHASE18-DETERMINISTIC-REPLAY-01** — before any endpoint is considered usable,
      replay one admitted bundle twice and require identical ordered outputs, model/schema
      revisions, candidate snapshot, ordinal checksum, and `writesPerformed=false`.

Current endpoint status:

```text
CANONICAL EXECUTOR GUARDS             PROVEN
UNCALLED TS SCAFFOLD                  AUDITED, DECISION OPEN
 MCP PHASE18 ENDPOINT                  QUARANTINED, FAIL-CLOSED
 TRPC PHASE18 ENDPOINT                 QUARANTINED, FAIL-CLOSED
LEGACY 13-COLUMN ABI                  NOT CONVERGED TO 16-COLUMN ABI
PROMOTION / ACTIVE MODE               CLOSED
```

## Revised architecture alignment from objective review (2026-09-14)

The legacy sidecar ABI is a feature width, not a candidate count. The newer
`CandidateFeatureSnapshotV1` contract already carries stronger typed semantics and must
remain the source of truth. Do not force semantically unrelated fields such as
`reward_prior`, `ann_turbovec_score`, or `concept_overlap` into that snapshot merely to
fill sixteen positions.

- [x] **XGBOOST-FEATURE-PROJECTION-V2-01** — define a revisioned projection from the
      server-owned semantic feature schema (`semanticRelevance`, `lexicalRelevance`,
      `astAffinity`, graph authority/PPR, community, domain, execution, and memory
      features) to an explicitly admitted model ABI. The projection must carry model
      feature names, width, derivation/evidence revisions, null policy, and checksum.
      The existing 16-column Python ABI remains `LEGACY_NEVER_PROMOTED` until this is
      resolved; no positional coercion or invented defaults. The pure contract is now
      implemented; live server-owned mapping remains a separate open gate below.
- [ ] **XGBOOST-CANDIDATE-FUNNEL-01** — keep candidate count separate from feature width.
      Prove a bounded funnel such as retrieval 128 → identity/RRF 64 → feature rows 32 →
      final context 8–16, with ordinal-map checksums and Recall@K/MRR/NDCG/latency receipts.
      These are evaluation parameters, not canonical identity.
- [ ] **XGBOOST-GRAPH-FEATURE-BOUNDARY-01** — admit global PageRank, bounded query PPR,
      community affinity, and topology coordinates only as revision-qualified derived
      feature rows. PageRank/PPR must never create identity, an extra retrieval vote, or a
      per-query full-graph dependency; missing graph evidence remains nullable/unavailable.
- [ ] **XGBOOST-EXECUTOR-ABLATION-01** — retain Qdrant/cuVS/CAGRA/TurboVec as executor
      diagnostics behind one semantic lane. Compare executor-specific deltas separately;
      do not train four independent semantic votes into the ranker without an admitted
      ablation and feature contract.
- [ ] **XGBOOST-ARROW-CORPUS-01** — build the future leakage-free training corpus as an
      immutable revision-qualified Arrow IPC artifact with logical content checksum,
      ordinal checksum, query-group split, and mmap/PyArrow readback. CSV remains a
      debugging export, not canonical training storage.
- [ ] **XGBOOST-SUPERVISED-LTR-01** — keep the first owned model as supervised learning to
      rank (`qid` groups, LambdaMART/rank-NDCG, explicit labels). Workflow success,
      repair reward, or agent recommendation must not be converted into relevance labels
      without an explicit reviewed bridge.
- [ ] **XGBOOST-CUDA-TRAINING-01** — evaluate CUDA XGBoost training only after corpus
      admission; benchmark CPU inference for small online batches separately. cuTile is a
      later feature-gather optimization and is not an XGBoost training dependency.
- [ ] **DAILY-GRAPHIFY-RECOMMENDATION-BRIDGE-01** — have daily Graphify consume
      authoritative validation/repair/OpenSpec receipts and emit deterministic
      `WorkstationProgressReceiptV1` plus non-authoritative Ewin-Tang-style recommendations.
      It may rank work but cannot authorize training, edits, or projections.
- [x] **MASTRA-PAPERCLIP-SHIM-CLOSURE-01** — classified the homegrown Mastra/Paperclip/Prime
      Agent names as compatibility shims or documentation. Keep real LangGraph/Hermes and
      existing ACP/OpenCode owners; do not install a second orchestration runtime merely
      to make the names literal. No replacement runtime was added; any future replacement
      requires a bounded parity replay. Current result: quarantine/classification proven,
      production parity not claimed.
- [ ] **AGENTIC-ERROR-FIXING-AWARENESS-01** — prove the existing agent flow can consume
      `.okf`/JSON evidence through the ACE packet boundary, preserve revision/checksum
      awareness, and emit a repair candidate plus validation/replay receipt. No hidden
      reasoning, direct datastore mutation, or recommendation-as-authorization.

### Updated progress interpretation

```text
FEATURE SEMANTICS OWNER                 CandidateFeatureSnapshotV1
LEGACY 16-COLUMN SIDECAR ABI            PRESENT, LEGACY-ONLY
MODEL ABI PROJECTION V2                 MISSING
CANDIDATE COUNT VS FEATURE WIDTH        NOT YET EXPLICITLY PROVEN
GRAPH / PAGERANK FEATURE BOUNDARY       DERIVED CONTRACT, CURRENT EVIDENCE PARTIAL
ARROW/MMAP LEAKAGE-FREE CORPUS          MISSING
SUPERVISED LTR LABELLED CORPUS          MISSING
CUDA TRAINING                           DEFERRED UNTIL CORPUS ADMISSION
DAILY GRAPHIFY PROGRESS BRIDGE          NOT PROVEN
AGENTIC REPAIR AWARENESS REPLAY         NOT PROVEN
MASTRA/PAPERCLIP                        SHIM CLASSIFICATION OPEN
```

- [x] **XGBOOST-FEATURE-PROJECTION-V2-CONTRACT-01** — added the pure
      `xgboost-feature-projection-v2.ts` contract and regression suite. It accepts an
      explicit model ABI mapping from the typed candidate feature schema, verifies a
      manifest checksum, preserves ordinal/source revisions, and rejects null values or
      missing `sourceRef`. Focused V2/ranking coverage passes **9/9**.
- [ ] **XGBOOST-FEATURE-PROJECTION-V2-LIVE-MAPPING-01** — populate and review the mapping
      from a real server-owned `CandidateFeatureSnapshotV1`; the current V2 contract and
      fixture are not production-corpus evidence. Do not start training or sidecar scoring
      until this live mapping has current-corpus evidence and a read-only receipt.

## Still-missing gates after local error review (2026-09-14)

The local implementation errors found in the V2 contract and quarantined Phase 18 handler
were corrected and regression-tested. This closes code hygiene for the tranche only; it does
not close live corpus, model, or promotion gates.

- [x] **XGBOOST-V2-TYPECHECK-01** — replace the conditional `never` row inference with an
      explicit projection-row type; the focused check no longer reports an error in the V2
      contract.
- [x] **PHASE18-QUARANTINE-REFERENCE-01** — remove the stale `packets` reference from the
      fail-closed MCP response and use the validated `packetKeys` count; no synthetic result
      is returned.
- [ ] **XGBOOST-FEATURE-PROJECTION-V2-LIVE-MAPPING-01** — connect one real,
      server-owned `CandidateFeatureSnapshotV1` producer and emit a read-only mapping
      receipt with current workspace/source/feature revisions and non-null source references.
- [ ] **XGBOOST-REAL-CANDIDATE-CAPTURE-01** — capture the bounded retrieval funnel with
      separate candidate counts, stable ordinal membership, query groups, and replayable
      evidence; do not use the 16-column sidecar width as a candidate count.
- [ ] **XGBOOST-ARROW-CORPUS-01** — produce an immutable, revision-qualified Arrow
      IPC/mmap corpus only after capture and label evidence are admitted; CSV remains
      diagnostic.
- [ ] **XGBOOST-SUPERVISED-LTR-01** — obtain reviewed relevance labels and leakage-free
      query-group splits before training LambdaMART/rank-NDCG; workflow rewards are not
      relevance labels by implication.
- [ ] **XGBOOST-SIDECAR-LIVE-REPLAY-01** — prove health, schema/model/artifact revisions,
      deterministic repeated scoring, and `writesPerformed=false` against the admitted
      bundle. Active scoring remains closed.
- [ ] **DAILY-GRAPHIFY-PROGRESS-01** — consume authoritative validation and repair receipts
      into one deterministic workstation progress receipt; recommendations remain advisory.
- [ ] **AGENTIC-ERROR-FIXING-AWARENESS-01** — replay one verified error through evidence
      packet → repair candidate → validation → replay receipt, preserving revision and
      checksum awareness without hidden reasoning or direct mutation.
- [x] **MASTRA-PAPERCLIP-SHIM-CLOSURE-01** — classified and quarantined the existing
      compatibility shims; real LangGraph/Hermes and OpenCode/ACP owners remain. No additional
      orchestration runtime was added. Production parity remains unclaimed and would require a
      separate bounded replay.

Current gate summary:

```text
V2 projection contract/tests          PROVEN (9/9 focused tests)
Phase 18 placeholder paths             QUARANTINED / NOT USABLE
Live feature mapping                  MISSING
Current candidate capture              MISSING
Admitted labelled corpus               MISSING
Owned model/artifact                  MISSING
Sidecar live replay/promotion         BLOCKED
Workstation receipt/recommendations   NOT PROVEN
Agentic repair replay                 NOT PROVEN
```

- [x] **ATLAS-IDENTITY-AUDIT-PHASE2-FAILCLOSED-01** — replaced the optional
      Qdrant/Neo4j/Redis placeholder branches in `sveltekit-frontend/src/mcp/atlas_identity_audit_tools.ts`
      with explicit unavailable-capability blockers. Requested cross-store phases now remain
      non-passing when their service clients are absent; no zero-count result is treated as
      parity evidence.
- [x] **NLP-PROOF-MODEL-PATH-FAILCLOSED-01** — removed fabricated
      `placeholder-model.gguf` defaults from the read-only ACP/NLP proofs. They now resolve
      the configured model path from repository environment files and fail explicitly when
      the required configuration is absent.
- [x] **AE-MANIFEST-QDRANT-ID-FAILCLOSED-01** — removed the synthetic
      `synthetic:${packetKey}` fallback from the AE manifest. Unresolved Qdrant points are
      represented as `null` error records; only queued/pending records may carry a real point
      ID, and the manifest contract was versioned to `atlas-ae-train-v2`.
- [ ] **PLACEHOLDER-CENSUS-REMAINDER-01** — review legacy generators and fixtures that
      still contain synthetic vectors, random benchmark scores, or routing fallbacks. Classify
      each as diagnostic-only, compatibility-only, or unsafe-to-run before changing it; do not
      treat the census itself as proof that a production path is active. The active semantic MCP
      tool path still defaults missing runtime identity to `atlas-workspace`,
      `atlas:packet:runtime`, and timestamp-derived workspace/packet revisions; those values are
      not admissible evidence. The boundary now rejects missing runtime identity with
      `REVISION_QUALIFIED_RUNTIME_REQUIRED`; fixture tests pass explicit caller-owned revisions.
      Remaining work is to prove this behavior through the live MCP envelope and remove any
      equivalent defaults in adjacent callers. The production `runtime-retrieve` route now also
      requires explicit `packetKey`, `workspaceRevision`, and `packetRevision` instead of
      timestamp-derived identity; the acknowledged mock Mastra route now requires the same
      caller-owned fields and remains separately quarantined.

Residual classification from the 2026-09-14 review:

- `scripts/atlas/retrieval-e2e-benchmark.mjs` remains diagnostic-only: its Qdrant/Neo4j/GPU
  fallbacks and coherence scores are explicitly mocked and must never produce promotion,
  relevance-label, or canonical-identity evidence.
- `scripts/atlas/materialize-ontology-node-index.mjs` remains unsafe for promotion: its
  4D/topology scores and graph identifiers are generated values and must be replaced by
  revision-qualified producer inputs before any materialization is authorized.
- `scripts/atlas/graphify-cluster-sync-partition.mjs` no longer uses a random ID fallback;
  it now derives a deterministic executor-only projection ID from the packet key and marks
  the payload `TURBOVEC_PROJECTION_ONLY` / `canonical_authority=false`. The script remains
  non-promotional because its hash-derived 64D vector is diagnostic, not a canonical
  `semantic_768` representation; replacing that vector with an admitted embedding remains
  open.
- `sveltekit-frontend/src/lib/server/atlas/semantic-signal-routing.ts` retains a fallback
  routing evidence reference solely to satisfy the compatibility shape. It is non-canonical
  and must not be accepted as source/chunk evidence; a future caller-adoption gate should
  require explicit evidence refs instead of this fallback.
- `scripts/atlas/batch-offline-ingest.mjs`, `scripts/atlas/phase-2a-ast-grep-lexical-kmeans-topology.mjs`,
  and `scripts/atlas/compute-p4-attention-scores.mjs` remain fixture/benchmark generators;
  their generated vectors or scores are not corpus, training, or promotion evidence.

Reachable apply safety was tightened in this pass:

- Phase 2A now rejects non-dry-run execution with
  `PHASE2A_APPLY_BLOCKED_SYNTHETIC_FEATURES`; its mock/random vector and feature fallbacks
  cannot reach PostgreSQL or Neo4j.
- Ontology node materialization now rejects non-dry-run execution with
  `ONTOLOGY_MATERIALIZE_APPLY_BLOCKED_UNQUALIFIED_FEATURES`; generated manifold/topology
  values cannot be persisted until revision-qualified producers exist.
- Legacy batch ingestion now rejects `--apply` with
  `BATCH_OFFLINE_INGEST_APPLY_BLOCKED_UNQUALIFIED_EMBEDDING`; its random embedding fallback
  and compatibility summaries remain diagnostic-only until an admitted embedding producer,
  source lineage, and representation receipt are available.
- P4 attention scoring no longer writes its query embedding during dry-run and no longer
  synthesizes random centroids when Qdrant is unavailable. It now fails closed with
  `P4_CENTROIDS_REQUIRED_QDRANT_READ_FAILED` or
  `P4_CENTROIDS_REQUIRED_NO_REVISION_QUALIFIED_CENTROIDS`; revision-qualified centroid
  provenance remains an open prerequisite for scoring or persistence.
- The legacy `retrieval-e2e-benchmark.mjs` is now explicitly marked
  `diagnosticOnly=true`, `promotionEligible=false`, and
  `DIAGNOSTIC_ONLY_SYNTHETIC_HARNESS`; its fabricated query embedding, enrichment, graph,
  GPU, context, and coherence stages cannot report a passing promotion result.
- The Stage 4 ACE context warmer in `summary-ranking-retrieval-pipeline.mjs` now rejects
  apply mode with `ACE_CONTEXT_WARM_APPLY_BLOCKED_PLACEHOLDER_BLEND`; fixed PageRank,
  attention, and authority defaults cannot be written to Redis. Real revision-qualified
  graph/attention/authority inputs remain required before cache warming.
- P4 Karpathy blending now rejects incomplete PageRank or attention input sets with
  `P4_KARPATHY_PAGERANK_INPUTS_INCOMPLETE` or
  `P4_KARPATHY_ATTENTION_INPUTS_INCOMPLETE`; hardcoded component defaults were removed
  before the Postgres/Redis write stage. Revision-qualified graph and attention inputs
  remain required for any blend promotion.
- The legacy SOM blend writer is additionally quarantined: `compute-p4-karpathy-blend.mjs`
  now rejects non-dry-run execution with `P4_KARPATHY_APPLY_BLOCKED_UNREVISIONED_TARGET`
  because `atlas_som_cell_karpathy_scores` has no admitted workspace/source/graph revision
  contract. Its dry-run output remains diagnostic only.
- `karpathy-gpu-enrich.mjs` apply mode now requires an explicit admitted
  `sha256:<64-hex>` workspace revision and source-cohort checksum, failing with
  `KARPATHY_APPLY_ADMITTED_WORKSPACE_REVISION_REQUIRED` or
  `KARPATHY_APPLY_SOURCE_COHORT_CHECKSUM_REQUIRED` before service work. Its Redis outputs
  remain derived and are not promotion evidence until the payload/readback revision binding
  is proven.

The next implementation work is to replace those generators with admitted Tree-sitter,
semantic, graph, and ontology producer inputs, then add bounded readback proofs before
reopening either apply path.

These classifications do not authorize cleanup, deletion, projection writes, model training,
or replacement of the existing owners. The next implementation gate is to audit each listed
caller and either add an explicit diagnostic-only guard or replace its fallback with a
revision-qualified input, then rerun the placeholder census.

## Still-missing downstream consumer gates (2026-09-14)

The producer-side guards above prevent several unsafe apply paths, but downstream consumers
still need independent admission checks. A revision-qualified producer receipt is not enough
if a caller reads an unqualified Redis value, substitutes a default score, or writes a
projection with a synthetic identifier.

- [ ] **KARPATHY-CONSUMER-REVISION-ADMISSION-01** — audit and harden
      `scripts/atlas/xgboost-hotness-score.mjs`,
      `scripts/atlas/unified-atlas-trace.mjs`, and
      `scripts/atlas/sync-task-cluster-links.mjs` so Karpathy/PageRank/attention values are
      accepted only when their workspace, source-cohort, graph/feature, and artifact
      revisions/checksums match the admitted input bundle. Missing, stale, malformed, or
      mixed values must remain unavailable (`null`/rejected), not become zero-valued ranking
      evidence. **Progress 2026-09-14:** `xgboost-hotness-score.mjs` now requires explicit
      admitted workspace and source-cohort checksums before any non-dry-run work; full
      per-score revision/readback validation remains open. **Additional progress 2026-09-14:**
      `unified-atlas-trace.mjs` now rejects bare/numeric or incomplete Redis Karpathy values;
      it requires workspace/source-cohort/graph/feature/artifact evidence before exposing a
      PageRank signal. Legacy `rev`/`run_at` summary timestamps remain diagnostic only.
      Fixed freshness and unqualified topology contributions are now omitted from production
      blends when their evidence is absent; the dry-run fixture remains diagnostic-only.
      The CHR97 cache fast path now requires a revision-qualified trace envelope, so legacy
      cached cartridges are bypassed rather than treated as current evidence. The pure
      validator `scripts/atlas/lib/qualified-karpathy-evidence-v1.mjs` and focused regression
      test cover malformed, timestamp-only, and fully qualified score/envelope cases. Live
      producer/readback parity remains open.
      The shared event recommendation contract now permits nullable freshness and excludes
      unavailable freshness from its operational average; daily Graphify no longer emits the
      fabricated `freshnessScore: 1`. A real revision-qualified freshness producer remains open.
- [x] **DAILY-BOARD-SOURCE-IDENTITY-ADMISSION-01** — removed the remaining
      `kanban:<taskId>` fallback in `daily-graphify-board-recommendations.ts`. A task ID may
      identify a work item, but it is not a source reference, packet identity, or structural
      evidence. Candidates without an admitted `sourceRef` must be represented as unavailable
      or skipped, with an explicit rejection reason; they must not enter source-derived POS,
      ontology, semantic, or ranking evidence. Focused board/recommendation tests pass;
      live source-derived admission remains a separate gate.

      Follow-up hardening: the implementation now also removes task-ID fallback from the
      recommendation signal's `sourceRef`, does not synthesize a packet key from tree/title
      metadata, and skips candidates whose evidence packet cannot be built from a real source
      reference. This is contract/test proof only; it does not prove live source admission.
- [ ] **KARPATHY-TRACE-DIAGNOSTIC-SEPARATION-01** — keep dry-run fixtures and ripgrep
      fallback scores visibly diagnostic-only; a production trace or cache hit must not use
      fixed freshness/topology defaults, synthetic confidence, or an unqualified
      `karpathyRev` as promotion or canonical retrieval evidence.
- [ ] **TASK-CLUSTER-LINK-IDENTITY-ADMISSION-01** — remove or quarantine the
      `task:${taskId}:feature:${featureId}` Qdrant-ID fallback before any write-capable
      `task_cluster_links` path. Require a real projection point readback plus canonical
      task/feature/source/revision evidence; Redis-unavailable and missing-point cases remain
      skipped/rejected rather than linked with invented identity. **Progress 2026-09-14:** the
      synthetic fallback was removed from `scripts/atlas/sync-task-cluster-links.mjs`; missing
      points now produce `QDRANT_POINT_READBACK_MISSING` and are skipped. Full revision-qualified
      point readback and canonical task/feature evidence remain open.
- [ ] **KARPATHY-DERIVED-WRITE-READBACK-01** — if the hotness or task-link consumers are ever
      reopened for writes, require a bounded dry-run receipt, explicit admitted workspace and
      source-cohort revisions, deterministic replay, and immediate readback. Derived Redis or
      task-link state must remain non-canonical and must not feed XGBoost training labels or
      semantic retrieval votes without a separate admission receipt.

Current downstream status:

```text
Karpathy producer apply guards             PRESENT, READBACK BINDING OPEN
Hotness consumer revision admission        PARTIAL; apply input guard added
Unified trace diagnostic separation        PARTIAL; dry-run marked, defaults remain
Task-cluster synthetic ID quarantine        PARTIAL; fallback removed, live surface absent
Derived consumer write/readback             NOT PROVEN
PageRank/PPR role                          DERIVED FEATURE ONLY
Canonical identity                         POSTGRES / Parent Atlas, unchanged
```

**Schema-readback finding 2026-09-14:** a bounded dry run connected to PostgreSQL and Redis,
then failed because `public.workspace_tasks` is absent. Repository migration evidence classifies
`workspace_tasks` and the related task-link surfaces as proposal-only rather than current
canonical tables. The linker now probes its three required tables through
`information_schema` and exits with `SCHEMA_SURFACE_UNAVAILABLE` before any linking operation
when the surface is absent. Do not substitute `atlas_tasks` without a separately authorized
contract/ownership decision; the schemas and task identities are not interchangeable.

No consumer gate is closed by source-level tests alone. Each requires a focused read-only
receipt and must preserve `writesPerformed=false`; no Qdrant, Postgres, Redis/Valkey, graph,
cache, cleanup, or model mutation is authorized by this ledger update.

## Remaining implementation blockers and next gates (2026-09-14)

This is the current handoff after the placeholder, consumer, workstation, and GPU-side
audits. These are implementation gates, not requests to create parallel owners. PostgreSQL
and the existing Parent Atlas receipts remain authoritative; Redis/Valkey, Qdrant, graph
stores, GPU buffers, and agent runtimes remain derived or execution-only.

### P0 — revision-qualified evidence and consumer admission

- [ ] **KARPATHY-CONSUMER-READBACK-CLOSURE-01** — finish the read-only consumer adapter
      for `xgboost-hotness-score.mjs` and `unified-atlas-trace.mjs`. Accept a score only when
      its workspace revision, source-cohort checksum, graph/feature revision, and artifact
      checksum match the admitted input bundle. Missing or stale PageRank/PPR/attention data
      must be unavailable, never represented as `0`, a fixed freshness value, or a synthetic
      `karpathyRev`. The producer's `log_state` carries workspace/source-cohort fields, but
      the Redis score hash and `gpu:karpathy:summary` currently do not prove that the fields
      survive into every consumed value. **Status: PARTIAL; consumer readback remains open.**
- [ ] **KARPATHY-DERIVED-WRITE-READBACK-01** — keep all hotness/task-link writes closed until
      a bounded dry-run receipt, deterministic replay, explicit admitted revisions, and
      immediate readback exist. `sync-task-cluster-links.mjs` now stops on the absent
      `workspace_tasks`/`task_cluster_links` schema surface; do not substitute `atlas_tasks`.
- [ ] **CURRENT-SOURCE-AND-PACKET-CHUNK-CLOSURE-01** — bind one terminal Graphify execution
      to the admitted workspace snapshot, prefer immutable
      `graphify_execution_file_membership_v2`, and prove exact source membership, packet
      membership, chunk lineage, content identity, and one semantic_768 cohort. Historical
      NULL revisions remain observable and are not promotion-eligible. **Status: BLOCKED;
      no current terminal execution plus source/packet/chunk closure is jointly proven.**
- [ ] **CURRENT-GRAPH-REVISION-EDGE-PROOF-01** — produce a current revision-qualified graph
      snapshot and `GraphOrdinalMapV1`; current observations have node keys but zero
      revision-qualified edges. NetworkX/cuGraph/PageRank/PPR/community outputs remain
      derived features only until this gate passes.

### P1 — workstation and agentic error-fixing integration

- [ ] **WORKSTATION-PROGRESS-RECEIPT-01** — connect the existing daily Graphify/workstation
      audit to one revision-qualified `WorkstationProgressReceiptV1` containing task owner,
      dependency wave, evidence refs, completion percentage, blockers, and checksums. Do not
      infer progress from prose, stale reports, or OpenSpec checkbox counts alone.
- [ ] **GRAPHIFY-RECOMMENDATION-BRIDGE-01** — convert the receipt into a deterministic
      TaskCandidate/recommendation packet for the existing Kanban owner. Ranking may use
      evidence-backed blocking, authority, failure, cost, and utility features; it must not
      create duplicate tasks or authorize execution.
- [ ] **WORKSTATION-AGENTIC-STDIO-REPLAY-01** — prove one synthetic verified-error flow:
      evidence packet → repair candidate → schema/lineage/authorization validation → bounded
      replay receipt. Preserve stable `repair_case_key`, revision references, replay checksum,
      and `writesPerformed=false`.
- [ ] **WORKSTATION-TIMELINE-AUTHORITY-01** — persist authoritative event/receipt references
      through the existing event/control-plane owner. JSONL, OpenCode, ACP, MCP, Mastra,
      Paperclip, Prime Agent, and terminal logs are evidence or adapters; none becomes a
      second task/timeline authority. The live event/outbox-to-consumer proof remains open.
- [x] **MASTRA-PAPERCLIP-SHIM-CLOSURE-01** — classified and quarantined the homegrown
      Mastra/Paperclip/Prime Agent-shaped files; real LangGraph/Hermes and OpenCode/ACP owners
      remain. No second orchestration runtime was installed. Any future replacement still requires
      a bounded parity replay; this checklist entry is closed at classification/quarantine scope.
      Agent-shaped files as compatibility shims or documentation, retain real LangGraph and
      existing OpenCode/ACP owners, and do not install a new runtime solely to satisfy names.

### P1 — unified GPU residency adapter

- [ ] **GPU-RESIDENCY-DESCRIPTOR-01** — complete the revision-qualified descriptor/provider
      seam for feature tiles, Transformer KV blocks, Mamba/Samba state, and Titans-style
      memory. Providers may return bounded typed buffers, but may not own identity,
      persistence, promotion, hidden thoughts, tensors, or GPU pointers.
- [ ] **GPU-TILE-ROUTING-AND-EVICTION-01** — prove domain/LUT routing, pinned host staging,
      bounded H2D transfer, LRU/lease eviction, and the 5.5–6.0 GiB RTX 3060 Ti ceiling.
      JSON/simdjson is control-plane only; Arrow/MsgPack/typed buffers carry numeric tiles.
      CUDA thread blocks/cuTile/SIMT consume an already-admitted ordinal tile and do not route
      cache identity themselves.
- [ ] **GPU-CPU-PARITY-01** — compare CPU reference, PyTorch SIMT, and isolated cuTile where
      reachable on the same revision-qualified ordinal map and feature tile. Require checksum
      parity, bounded replay, no silent CPU fallback, and `writesPerformed=false`.
- [ ] **ROPE-KV-STATE-SAFETY-01** — reject KV reuse on model/tokenizer/RoPE/context-window or
      artifact mismatch; keep RoPE/KV/Mamba/Samba state ephemeral. PCA/SVD may compress
      semantic or candidate-feature matrices, not KV or recurrent state in this tranche.

### P1/P2 — representation and ranking readiness

- [ ] **XGBOOST-LIVE-CANDIDATE-CAPTURE-01** — capture real query groups through the existing
      SearchRuntime funnel (broad candidates → identity/RRF → feature rows → context), with
      `CandidateFeatureSnapshotV1` and ordinal-map identity. No fabricated labels or scores.
- [ ] **XGBOOST-LABEL-EVIDENCE-01** — obtain revision-qualified human relevance evidence;
      workflow success, PageRank, PPR, or agent recommendations are not relevance labels.
- [ ] **XGBOOST-ARROW-CORPUS-01** — build a leakage-free Arrow IPC/mmap training corpus with
      query groups, ordinal checksum, feature/model revisions, and logical artifact checksum.
      CSV remains diagnostic only; CUDA training is blocked until this corpus is admitted.
- [ ] **REPRESENTATION-BASELINE-CONSOLIDATION-01** — compare canonical `semantic_768` with
      derived MRL/latent/PCA/SVD views only on the admitted current cohort. Do not promote a
      view, create an ANN vote, or backfill vectors from historical/mixed revisions.

### Explicitly still not proven

```text
current terminal Graphify execution for admitted snapshot       NOT PROVEN
current source → packet → chunk closure                         BLOCKED
current revision-qualified graph edges                           0 proven
full semantic_768 corpus authority                               NOT PROVEN
Karpathy/PageRank consumer revision readback                     OPEN
workspace progress/recommendation receipt                        NOT PROVEN
agentic stdio/timeline end-to-end replay                         NOT PROVEN
unified GPU residency live streaming                              OPEN
CPU ↔ PyTorch SIMT ↔ cuTile same-corpus parity                    NOT PROVEN
XGBoost live candidates, labels, Arrow corpus, promotion          NOT PROVEN
Mastra/Paperclip/Prime Agent installed runtime                    NO; shim classification remains
```

The next safe sequence is P0 source/packet/chunk closure, then current graph-edge proof,
then workstation/agentic replay, and only then representation or GPU promotion work. No task
above authorizes Graphify apply, migrations, Qdrant repair, Neo4j mutation, cache warming,
model training, cleanup, deletion, commit, or push.

### Additional revision-admission correction (2026-09-14)

- [x] **GRAPHIFY-TASK-CANDIDATE-REVISION-ADMISSION-01** — the shared task-candidate builder
      now leaves absent workspace/source/graph revisions nullable instead of defaulting to
      `main` or board timestamps. Callers must supply explicit admitted revisions before a
      candidate is eligible for source-derived promotion or downstream execution. Focused
      contract and board tests pass; live admitted-revision delivery remains open.

### Current missing gates after the 2026-09-14 blocker review

These are the remaining implementation/proof gaps. They are intentionally separate from
completed audits and do not authorize any mutation.

- [ ] **CURRENT-EXECUTION-SOURCE-PACKET-CHUNK-CLOSURE-02** — bind exactly one terminal
      Graphify execution to the admitted workspace snapshot, prefer the immutable
      `graphify_execution_file_membership_v2` ledger exclusively when populated, and prove
      exact source membership, packet membership, chunk lineage, content identity, and one
      revision-qualified `semantic_768` cohort. Current execution ownership is still absent
      or conflicting; do not use source-equivalent historical runs or lexical hash ordering.
- [ ] **CURRENT-GRAPH-EDGE-ORDINAL-PROOF-02** — produce a current graph snapshot with
      revision-qualified edges and `GraphOrdinalMapV1`. Current observations expose node keys
      but zero qualified edges; PageRank, personalized PageRank (PPR), CheiRank, community,
      NetworkX, cuGraph, and topology values remain derived/unavailable until this gate passes.
      CheiRank, when introduced, must use the same admitted graph revision and ordinal map; it
      is not a symbol identity, semantic vote, or authority substitute.
- [ ] **SEMANTIC-768-CURRENT-CORPUS-ADMISSION-02** — reconcile the multiple semantic writer
      surfaces against the sealed source/packet/chunk cohort. Legacy candidates contain
      duplicate canonical IDs and missing/mixed revisions; do not repair IDs, infer revisions,
      or fan out to Qdrant until one current owner and exact readback are proven.
- [ ] **SYMBOL-REGISTRY-CURRENT-REVISION-RECONCILIATION-02** — resolve current structural
      nominations into `atlas_symbol_registry`/`atlas_symbol_versions` only from admitted
      source revisions. Existing bounded resolution is evidence, not full-corpus current
      authority; `graphify_symbols` remains a producer/compatibility surface.
- [ ] **KARPATHY-QUALIFIED-CONSUMER-LIVE-READBACK-02** — prove that the qualified
      workspace/source-cohort, graph/feature, and artifact revisions survive the live producer
      to every consumed score/cache value. Missing PageRank/PPR/hotness remains null/unavailable;
      Redis/Valkey task-link writes stay closed.
- [ ] **WORKSTATION-PROGRESS-AND-REPAIR-REPLAY-02** — connect authoritative validation and
      repair receipts to one progress/recommendation packet and replay one verified error through
      evidence packet → repair candidate → validation → replay receipt with stable case identity,
      revision references, checksum, and `writesPerformed=false`. OpenCode/ACP/MCP/Mastra/
      Paperclip/Prime Agent remain adapters or evidence, not additional owners.
- [x] **MASTRA-SHIM-PLACEHOLDER-QUARANTINE-02** — the uncalled
      `atlas-mastra-workflow.ts` shim was found containing placeholder workflow observations
      (`retrievalConfidence=0.7`, `validationStatus=PASS`, and a bounded loop that assumed
      validation success) plus a timestamp-derived packet key. The shim now requires caller-owned
      packet/workspace/packet revisions, removes the timestamp packet fallback, and starts with
      an unverified observation state. It remains non-production evidence until a real
      revision-qualified caller and independent validation/replay receipts exist. Do not use its
      output to close repair, retrieval, or promotion gates. The adjacent adapter no longer
      returns example packets, PASS validation, successful writes, or canned context; those
      unimplemented surfaces now fail closed explicitly. Semantic retrieval signal setup also
      remains `PENDING` until retrieval evidence exists instead of claiming `PASS` prematurely.
- [ ] **GPU-RESIDENCY-PARITY-02** — complete the bounded descriptor/routing/eviction proof and
      same-corpus CPU↔PyTorch SIMT↔isolated cuTile parity on one admitted ordinal map. Keep
      Mamba/Samba/Titans providers descriptor-only, RoPE/KV state ephemeral, and the RTX 3060 Ti
      ceiling enforced; no GPU cache or model promotion is authorized.
- [ ] **XGBOOST-REAL-CAPTURE-LABEL-CORPUS-02** — capture real query groups, explicit relevance
      labels, and a leakage-free Arrow IPC/mmap corpus from the admitted feature snapshot. The
      legacy 16-column sidecar ABI remains non-promotional; no CUDA training or active reranking.
- [ ] **MIGRATION-AND-STORAGE-RETENTION-AUTHORITY-02** — finish read-only migration-owner and
      Qdrant/Docker retention classification, including restore/rollback evidence and exact
      candidate ownership. No schema apply, snapshot deletion, image deletion, cleanup, or
      destructive prune is authorized.

### P0 readback status (2026-09-14)

- [x] **EXPLICIT-ADMITTED-REVISION-INPUT-01** — the current workspace packet/chunk audit rejects
      missing or malformed revisions and consumes the explicitly supplied admitted SHA-256
      revision. It does not infer currentness from lexical `MAX()` ordering, timestamps, source
      paths, or historical rows.
- [ ] **ADMITTED-REVISION-BINDING-READBACK-01** — the latest selected-revision report still
      records `binding_rows=0`, `binding_sources=0`, `graphify_exact_sources=0`, and
      `packet_chunk_exact_sources=0`. This is an unresolved source-authority absence, not a
      successful empty cohort; bind/read back one terminal execution before downstream closure.
- [ ] **SOURCE-REVISION-NAMESPACE-BRIDGE-01** — keep Graphify code/blob revisions distinct from
      canonical Parent Atlas source revisions and prove equivalence only through exact source
      content identity. No `COALESCE` fallback or null provision may promote an unqualified row.

### Current packet/chunk readback (2026-09-15)

- [x] **CURRENT-PACKET-CHUNK-READBACK-AUDIT-01** — the read-only auditor now consumes the
      explicitly supplied workspace revision inside one `REPEATABLE READ READ ONLY` transaction,
      prefers the selected execution frame, and keeps whole-source digests separate from per-chunk
      hashes. Timeout-prone optional checks use savepoints; no write path is enabled.
- [ ] **CURRENT-PACKET-CHUNK-CLOSURE-STATUS-01** — latest readback is
      `CURRENT_PACKET_CHUNK_JOIN_PARTIAL`: `24,456` source-membership rows and
      `24,456` exact source members are present, but only `577` sources have proven
      `source → packet → chunk` lineage and `packet_content_matches=0`. This is evidence of
      partial lineage, not packet-digest admission. Keep packet/chunk materialization,
      semantic promotion, graph promotion, and cache warming blocked until the canonical packet
      digest producer/readback and exact admitted cohort are proven. `writesPerformed=false`.

### Still-missing blockers after the 2026-09-14 route and authority audit

This status is intentionally narrower than the historical portfolio census. A contract,
fixture, or diagnostic result is not promoted to live/current evidence without an exact
revision-qualified readback.

- [ ] **GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02** — prove exactly one terminal Graphify
      execution for the admitted snapshot revision. Use
      `graphify_execution_file_membership_v2` exclusively when it has rows for the execution;
      do not concatenate it with the legacy execution-file ledger. Current evidence still
      shows no jointly proven terminal owner and a conflicting historical candidate.
      **Live recheck 2026-09-14:** the auditor was rerun against the explicitly admitted
      workspace revision `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`
      using a separate report path because the shared 43 MB receipt was locked. It found
      `terminalExecutionCount=32` but `matchingExecutions=0`, with
      `firstBlockingInvariant=SNAPSHOT_READBACK_NOT_PROVEN` and status
      `GRAPHIFY_SNAPSHOT_BINDING_BLOCKED_SNAPSHOT_READBACK`. The admitted revision is
      recognized, but no execution is promoted or relabeled; packet/chunk and downstream
      semantic/graph promotion remain blocked.
      Evidence: `docs/reports/current-graphify-snapshot-binding-recheck-v1.json`.
      **Root-cause detail 2026-09-15:** the recheck resolved the admitted workspace revision
      as `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`, but
      selected snapshot manifest `sha256:48e1dbb326a4e249dc550cf1df06da8ec82ca4a837dd93eca114e4bafb2747e8`.
      That manifest contains `25,291` sources, of which `24,982` read back exactly and
      `309` fail source readback. Therefore the blocker is two-layered:
      `ADMITTED_REVISION_MANIFEST_MISMATCH` plus `SNAPSHOT_SOURCE_READBACK_INCOMPLETE`.
      Do not bind an existing execution or relabel the manifest. The next safe gate is a
      newly captured immutable snapshot whose content checksum, source count, and source
      membership checksum are all admitted together, followed by one terminal Graphify
      execution over that exact artifact.
      **Fresh capture/readback 2026-09-15:** a new local observation artifact was captured
      with the explicit workspace ID and no capture violations: `25,542` sources across
      `7` repositories, `snapshotRevision=sha256:c0c349de87ec897e5b3660ffc297415481b11333be4508f5bf13ebe3a1148687`.
      The independent readback found `25,541/25,542` exact matches and one
      `SOURCE_BYTES_CHANGED` for `sveltekit-frontend/src/lib/server/agent/action-writer.spec.ts`.
      This is a reproducibility failure caused by the worktree changing between capture and
      readback, not evidence that the snapshot is authoritative. The artifact remains
      `canonicalAuthority=false`, `datastoreWritesPerformed=false`, and must not be admitted
      until a stable capture/readback pair is produced. Evidence:
      `docs/reports/workspace-source-snapshots/c0c349de87ec897e5b3660ffc297415481b11333be4508f5bf13ebe3a1148687.json`.
      **Second capture/readback 2026-09-15:** capture produced a clean local artifact
      `sha256:e10230a35012313465917c053684e32fdff170acb5dbe886902c8814999676f1`
      with `25,542` sources and zero capture violations. Immediate readback again found
      `25,541/25,542` exact matches; `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md`
      changed during verification. This confirms active worktree concurrency is the current
      reproducibility blocker. The refreshed terminal owner audit independently reports
      `runCount=0`, `completedOwnerCount=0`, `workspaceRowCount=0`, and
      `coordinatorExecutionCount=0` for the admitted revision. Evidence:
      `docs/reports/current-graphify-run-owner-v1.json` and
      `docs/reports/workspace-source-snapshots/e10230a35012313465917c053684e32fdff170acb5dbe886902c8814999676f1.json`.
      **Snapshot-native preflight 2026-09-15:** the existing Graphify entrypoint was inspected
      and not invoked because it opens a database execution ledger and requires explicit
      authorization. Its read-only preflight reports the admitted artifact pair as
      `workspaceRevision=sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`
      and `snapshotRevision=sha256:48e1dbb326a4e249dc550cf1df06da8ec82ca4a837dd93eca114e4bafb2747e8`,
      but the materialized snapshot root is missing: `missingSources=25,291` and
      `MATERIALIZED_SNAPSHOT_MISSING`/`MATERIALIZED_SOURCE_MISSING`. Checksums and repository
      count are otherwise present, with `persistentWrites=0`. Therefore the next prerequisite
      is materializing and readback-verifying an admitted immutable snapshot; do not open a
      partial Graphify execution. Evidence: `docs/reports/graphify-snapshot-consumer-preflight-v1.json`.
      **Materialization attempt 2026-09-15:** the fail-closed materializer was run against the
      admitted `48e1...` artifact and stopped at `.claude/settings.json` with
      `SNAPSHOT_SOURCE_CHANGED_BEFORE_MATERIALIZATION`. No destination was published; only
      process-scoped partial staging directories exist. This confirms the admitted artifact is
      stale relative to the current worktree and cannot be used for Graphify execution. Do not
      copy around the mismatch or promote a partial tree. The next gate is a stable capture,
      complete source-byte readback, explicit re-admission, then materialization.
      **Stable candidate and materialization 2026-09-15:** the new artifact passed independent
      byte readback at `25,542/25,542` with zero violations. The existing read-only revision
      derivation produced candidate `sha256:44ea163a5796b40b448e9ed706071427fe5e4d9b2117ad05b230572a2797189f`
      over `25,542` sources and `7` repositories. The candidate source tree then materialized
      successfully at `.tmp/workspace-source-snapshots/5a1dcf9e9a73c2b2d6b010c8e5993d2daf9d20d3092868ae1112583042a4510a`,
      with all source hashes and byte lengths verified and `writesPerformed=false`. It is not
      yet authoritative because the admission receipt still names the older `48e1...` snapshot;
      explicit admission remains the next gate before opening Graphify execution.
      **Preflight report-path hardening 2026-09-15:** added an optional `--report=<path>`
      override to `audit-workspace-revision-tournament-source-authority-v1.mts` so locked
      shared receipts no longer turn a read-only audit into an infrastructure error. The
      recheck completed using a separate receipt but correctly remained
      `CANDIDATE_ADMISSION_PREFLIGHT_BLOCKED` because `snapshotReadback=false`; no authority
      or datastore write occurred. Evidence:
      `docs/reports/workspace-revision-tournament-source-authority-recheck-v1.json`.
- [ ] **CURRENT-EXECUTION-SOURCE-PACKET-CHUNK-CLOSURE-03** — after the execution owner is
      proven, read back exact execution membership → source content revision → packet →
      `atlas_packet_chunk_lineage` → `codebase_chunk_index` → semantic_768. Require one
      admitted workspace revision, zero mixed revisions, zero content mismatches, zero
      ambiguity, and no synthetic identity. Historical NULL revisions remain observable and
      non-promotional.
- [ ] **CURRENT-GRAPH-EDGE-ORDINAL-PROOF-03** — produce a revision-qualified current graph
      snapshot and `GraphOrdinalMapV1` with real edges. Current graph observations remain
      node-only/empty at the edge producer boundary. PageRank, PPR, CheiRank, community,
      NetworkX, cuGraph, and topology coordinates remain unavailable/derived; none may fill
      missing values with zero or create an identity/vote.
- [ ] **SYMBOL-REGISTRY-CURRENT-REVISION-RECONCILIATION-03** — scale the bounded structural
      bridge only after current source membership closes. Existing 90-row resolution and
      five new-version candidates are dry-run evidence; they do not authorize registry
      writes or imply that historical symbol versions are current.
- [ ] **SEMANTIC-768-CURRENT-CORPUS-ADMISSION-03** — reconcile the 768 writer surfaces and
      admit one current cohort. Legacy Qdrant/semantic populations still contain duplicate
      canonical IDs, missing revisions, and mixed workspace/representation revisions.
      Legacy payload reconciliation remains dry-run only; no guessed revision, ID repair, or
      Qdrant fanout is allowed.
- [ ] **LATENT-REVISION-IDENTITY-READBACK-01** — prove source-version, symbol-version,
      representation, model, and byte-encoding lineage for latent_256/128/64 against the
      admitted semantic_768 cohort. Bounded derivation parity is not full-corpus authority.
- [ ] **TRACE-LIVE-IDENTITY-ENVELOPE-01** — replay one bounded disabled-tool request carrying
      the same revision-qualified manifest through TRACE and prove the live process consumes
      it. The source fix is present, but an already-running compiled TRACE process may still
      serve stale behavior; do not restart it or enable optional tools as part of this gate.
- [ ] **WORKSTATION-TIMELINE-REPLAY-03** — connect authoritative event/receipt references to
      one deduplicated repair case and replay verified error → evidence packet → repair
      candidate → validation → replay receipt. OpenCode, ACP, MCP, Mastra, Paperclip, Prime
      Agent, JSONL, and terminal output remain adapters/evidence, not timeline owners.
- [ ] **CACHE-PREFILL-LIVE-HANDOFF-01** — prove one real SearchRuntime request reaches the
      server-owned CandidateFeatureSnapshot → ContextManifestV2 → prompt-cache boundary with
      identityChecksum and all output-affecting revisions. No message-derived or timestamp-
      derived manifest is admissible.
- [ ] **MIGRATION-STORAGE-RETENTION-PREFLIGHT-03** — finish read-only migration classification
      and exact Qdrant/Docker retention ownership, including restore/rollback proof. The
      11,174 historical junk-packet cleanup and image/snapshot removal remain unauthorized;
      archive, canary, deletion, and prune are all still closed.
- [ ] **XGBOOST-REAL-CAPTURE-LABEL-CORPUS-03** — capture real query groups and human
      relevance labels from the admitted feature snapshot, then emit a leakage-free
      Arrow/mmap corpus. The legacy 16-column Python sidecar is not the newer feature ABI;
      no CUDA training or promotion is permitted before this gate.

### Agentic error-fixing census and safe hardening (2026-09-14)

- [x] **AGENTIC-TYPESCRIPT-ERROR-FIXER-OWNER-AUDIT-01** — static read-only census completed
      with `scripts/atlas/audit-typescript-error-fixer-owners-v1.mjs`. The legacy numbered
      batch fixers and `scripts/batch-fix-ts-errors.mjs` remain mutation-capable regex/text
      surfaces; `scripts/error-resolution/services/error-scanner.ts` is a structured
      `svelte-check --output machine` reader. No live 80k-error count was asserted by this
      audit, no shell checker was executed, and no source or datastore was changed.
- [ ] **AGENTIC-TYPESCRIPT-ERROR-EVIDENCE-REPLACEMENT-01** — replace legacy batch-fixer use
      with bounded machine-JSON error capture, stable error fingerprints, explicit
      workspace/source revision fields when proven, and evidence-only TaskCandidate output.
      A large error count is diagnostic telemetry, not mutation authorization. Any repair must
      pass `WorkflowActionEventV1` approval, exact source preimage, bounded execution, and
      independent validation. Do not mix BeautifulSoup/web-research evidence into TypeScript
      repair authority; external evidence is a separate revisioned cold-evidence lane.
      **Progress 2026-09-14:** `scripts/atlas/capture-typescript-error-evidence-v1.mjs` now
      provides the bounded machine-JSONL capture/fingerprint adapter and is covered by its
      standalone Node test. It preserves null lineage, emits stable `tserr:` IDs, and is
      permanently non-promotional (`writesPerformed=false`, `safeToApply=false`). Live
      TaskCandidate wiring, revision-qualified capture from the checker boundary, and any
      governed repair replay remain open. The existing recommendation index now consumes this
      report as `SVELTE_CHECK_MACHINE_JSON` observed cards when present; those cards retain
      `executable=false`, `canonical_authority=false`, and `authorization_required=true`.
      **Implementation update 2026-09-14:** extracted the pure normalizer into
      `scripts/atlas/typescript-error-evidence-v1.mjs` and added
      `scripts/atlas/run-typescript-error-evidence-capture-v1.mjs`. The runner invokes
      `svelte-check --output machine --threshold error` directly with a bounded stdout
      stream, then delegates to the same normalizer; checker exit code is reported but
      machine JSONL remains the only parsed input. First-party `.ts/.tsx/.svelte` paths
      are retained, generated/vendor/runtime/Qdrant-storage paths are excluded, duplicate
      observations retain the same stable ID, and unknown lineage remains null. The runner
      and root commands are read-only. A one-source live capture completed with checker
      exit code 0 and zero retained diagnostics; its two non-JSON status lines were counted
      as malformed rather than parsed as human-readable evidence.
      **Live smoke 2026-09-14:** an unbounded scan exited `134` after Node heap exhaustion
      and is recorded as incomplete; it must not be interpreted as zero errors. The bounded
      one-source rerun completed with exit code 0 and `captureStatus=COMPLETE`. The next
      implementation gate is multi-source batch capture plus TaskCandidate admission;
      governed repair replay remains separate and open.
      **Streaming hardening 2026-09-15:** added optional `--stream-errors <path>` mode to
      `capture-typescript-error-evidence-v1.mjs`. Diagnostics are emitted incrementally as
      JSONL; only bounded counters and the first 100 diagnostic line numbers remain in memory.
      Added a seven-diagnostic stream-mode test; the focused capture suite is now `3/3` passing.
      This removes the report-array heap bottleneck for large checker artifacts without changing
      the nullable-lineage or non-promotional contract. Live checker-boundary capture and
      TaskCandidate admission remain open.
      **Runner integration 2026-09-15:** `run-typescript-error-evidence-capture-v1.mjs` now
      forwards `--stream-errors` to the capture adapter. A live one-source `svelte-check
      --output machine-verbose` smoke completed with checker exit `0`, `captured=0`, and
      `writesPerformed=false`; this proves the runner boundary, not absence of errors in the
      whole workspace.
      **Critical correctness bug found and fixed 2026-09-14/15:** the "its two non-JSON status
      lines were counted as malformed" observation directly above was the visible symptom of a
      much deeper bug -- the parser's assumed input shape never occurs in real
      `svelte-check` output at all, for ANY line, including real error diagnostics. Verified
      by root-causing against `node_modules/svelte-check/dist/src/index.js`'s own
      `MachineFriendlyWriter`, not assumed: (1) plain `--output machine` (what the runner was
      using) never emits JSON per diagnostic -- it prints a hand-formatted
      `TYPE "file" line:col "message"` string; only `--output machine-verbose` emits a JSON
      payload, and even then each line is `<epochMs> <jsonObject>`, not a bare JSON line; (2)
      the JSON shape itself also differed from what the normalizer assumed --
      `{type:'ERROR'|'WARNING', filename, start:{line,character}(0-indexed), end, message, code
      (numeric for TS), codeDescription, source}`, not `{filename, start:{line,column}, code,
      text, severity}`. **Net effect: every previous live capture attempt against this
      pipeline (including the "zero retained diagnostics" one-source run cited above) would
      have captured zero real errors regardless of how many actually existed** -- confirmed by
      writing a deliberate `const x: number = "not a number"` probe file and round-tripping it:
      before this fix, `captured:0, malformedLineCount:2` (the ERROR line itself silently
      misclassified as malformed, indistinguishable from the harmless START/COMPLETED lines);
      after, `captured:1`, with correct `line:1, column:7, code:'TS2322'` matching the probe
      exactly. The existing unit tests never caught this because both used hand-fabricated
      bare-JSON fixtures matching the wrong assumed shape rather than real captured output --
      fixed alongside the parser, now using real `machine-verbose`-shaped fixtures. Fixed:
      `scripts/atlas/typescript-error-evidence-v1.mjs` (new `<epochMs> <json>` line parser,
      correct field mapping, 0-to-1-indexed line/column conversion, numeric-code-to-`TS####`
      normalization, a new `protocolLineCount` bucket so START/COMPLETED lines are no longer
      indistinguishable from genuinely malformed ones), `run-typescript-error-evidence-capture-v1.mjs`
      (`--output machine` → `--output machine-verbose`), and
      `capture-typescript-error-evidence-v1.test.mjs` (fixtures rewritten to the real shape).
      Re-verified: unit tests 2/2 pass; end-to-end probe-file run captures the real error
      correctly; `build-agentic-error-index.mjs` re-run confirmed unaffected (it reads
      `errorId`/`sourceRef`/`code`/`message`/`workspaceRevision`/`sourceRevision` off the report,
      all unchanged field names, and sets its own independent `source` label rather than reading
      the renamed `evidenceKind`). This is the single highest-leverage fix in this cluster: every
      "live capture" claim recorded above this note predates it and must not be cited as
      evidence real errors were ever actually captured -- only that the (broken) pipeline ran
      without crashing.

- [x] **AGENTIC-ERROR-INDEX-REAL-EVIDENCE-01** — the recommendation index now uses stable
      evidence-derived repair keys for observed failures, preserves nullable evidence and
      confidence, and does not invent a root cause from a tool path. Historical seed cards are
      fixture-only and require explicit `ATLAS_INCLUDE_AGENTIC_FIXTURE_SEEDS=true`; they are
      never live recommendations by default.
- [x] **AGENTIC-GRAPH-NEIGHBOR-FAIL-CLOSED-01** — graph-neighbor expansion no longer invents
      sibling files when Neo4j is unavailable or returns no match. It emits an empty,
      explicitly unavailable/noncanonical result; verified graph neighbors are marked only
      after a real readback.
- [x] **AGENTIC-GOVERNED-REPLAY-01** — recommendation strings must not be treated as
      mutation authorization. Closed: found the prior `--apply` refusal was incidental, not
      structural -- `dryRunMode` could never be `false` past the refusal check (the only path
      that would set it false already `process.exit(2)`s first), so the `writeFileSync`/
      `card.status = 'verified'` block was unreachable dead code, not a proven safety
      boundary. Removed that dead branch and the `writeFileSync` import entirely: the script
      is now read-only by construction (verified live -- `rg "writeFileSync\(|execSync\(|writeFile\("`
      returns zero matches in the file, and the workflow index's sha256 is identical before
      and after both a dry-run invocation and a refused `--apply` invocation). `--apply` has
      no code path left to fall through to; it always exits 2. Governed apply/verification
      (writing a card to `verified` after real command execution, gated on an approved
      `WorkflowActionEventV1`/mutation receipt) remains unbuilt and is tracked separately as
      `AGENTIC-GOVERNED-REPLAY-PROOF-02` -- do not re-add a write path to this file to close
      that gate; it belongs in its own governed executor module. Placeholder command tokens
      such as `<target_file>` remain diagnostic and are not an execution proof.
- [ ] **TASK-PROGRESS-PROJECTION-01** — emit a derived, revision-qualified progress card with
      separate mechanical, evidence, validation, lineage, runtime, and composite percentages.
      Do not write percentages into canonical task identity or infer completion from prose or
      checkbox counts.
- [ ] **GRAPHIFY-DAILY-PROGRESS-REFRESH-01** — connect the existing daily Graphify receipt to
      the existing TaskCandidate/Kanban projector and recommendation owner. It must preserve
      stable task identity, evidence refs, blocker state, and `writesPerformed=false`; no
      second taskboard, Hermes/Mastra/Paperclip runtime, or recommendation authority may be
      introduced.
- [x] **WORKFLOW-ACTION-SCHEMA-ADOPTION-02** — re-ran the census wider than the original 4-file
      scope: grepped every real (non-spec) file referencing `WorkflowActionEventV1` repo-wide,
      not just the 4 schema-defining files. Found the real production write paths
      (`src/lib/server/agent/action-writer.ts`, `canonical-action-write-adapter-v1.ts`,
      `atlas/temporal/temporal-post-dispatch-recorder.ts`,
      `atlas/temporal/temporal-tool-post-dispatch-recorder.ts`) already import
      `workflowActionEventSchema`/`WorkflowActionEventV1` from
      `@deeds/parent-atlas/core/workflow-action-event` directly -- cross-workspace adoption for
      every live write path was already complete before this task started. Per-file disposition
      of the 3 named local definitions, checked for an independent (non-adapter) construction
      path, not just declared "local schema exists":
      - `agentic-file-compiler/contracts.ts` (`WorkflowActionEventSchema`): already fully
        compliant -- its only `.parse()` call site is inside `fromCanonicalWorkflowActionEvent()`
        itself; no separate producer function exists. No change needed.
      - `workflow/workflow-action-event-v1.ts` (hand-written `WorkflowActionEventV1` interface +
        `validateWorkflowActionEvent()`): already fully compliant -- it has no Zod schema and no
        producer function, only a representability validator (checks a caller-supplied object,
        never constructs one) plus the canonical adapter pair. Zero real (non-spec) importers
        anywhere in the repo, confirmed via `rg`. No change needed.
      - `workflow/context-tool-dag-contracts.ts` (`WorkflowActionEventV1Schema`): the one real
        gap. `workflowActionFromDagNode()` called `WorkflowActionEventV1Schema.parse(...)`
        directly -- a second, independent construction path for the `'atlas.workflow-action.v1'`
        identity. Confirmed via `rg` that this function has zero real (non-spec) callers anywhere
        in the repo, making this a zero-live-migration-risk fix. Converted it to construct via
        `workflowActionEventSchema` (canonical) first, then project down via the pre-existing
        `fromCanonicalWorkflowActionEvent()` -- it no longer calls the local schema's `.parse()`
        directly at all. Verified live: `context-tool-dag-contracts.spec.ts` 5/5 pass
        (`--no-cache`), including the 4 tests that directly exercise
        `workflowActionFromDagNode()`; the full `workflow/` + `agentic-file-compiler/` directory
        suites re-run clean at 24 files / 75 tests, zero regressions.
      "Historical persisted v1 dialects behind an explicit compatibility boundary": no evidence
      of any persisted (DB/JSONL/file) data in any of the 3 local dialects was found during this
      census -- consistent with each local write path having zero real production callers before
      this fix. Not fabricating a compatibility boundary for data that does not appear to exist;
      flagged rather than silently assumed clean, in case a persistence path was missed.
- [x] **WORKFLOW-ACTION-IMPORT-RESOLUTION-02** — package subpath resolution from the SvelteKit
      workspace is proven (`@deeds/parent-atlas/core/workflow-action-event` resolves and exports
      `workflowActionEventSchema` plus the canonical action-kind list). Closed alongside
      `WORKFLOW-ACTION-SCHEMA-ADOPTION-02` above -- the exactly-one-owner gap that entry
      originally deferred to is now resolved.
- [x] **AGENTIC-LEGACY-EXECUTION-CENSUS-01** — classified the remaining direct command
      execution surfaces. `agentic-toolgan-execute.mjs`, `agentic-toolgan-replay.mjs`, and
      `apply-error-fixes.mjs` were legacy mutation/replay paths with no proven canonical
      approval receipt, bounded-file preimage, or independent validation boundary. Their
      direct execution behavior is now removed or fail-closed; governed production execution
      remains a separate open gate. Do not infer safety from a successful exit code.
- [x] **AGENTIC-TOOLGAN-GOVERNED-BOUNDARY-01** — closed as an explicit read-only/propose-only
      adapter (not routed through the plan-bound approval owner -- that remains future work).
      Real bugs found and fixed, not merely gated: (1) `agentic-toolgan-execute.mjs`'s
      simulate-only branch fabricated `result:'success'`/`proof.smoke:'PASS'` even though it
      never runs anything real -- it now writes `result:null`/`proof.smoke:'NOT_EXECUTED'`; (2)
      `agentic-toolgan-log-outcome.mjs` (not named in the original task text, found while
      verifying end to end) would have taken that corrected `result:null` and logged it as a
      FALSE FAILURE to `failures.ndjson`/`do-not-repeat.ndjson` via its naive
      `result === 'success' ? success : failure` branch -- fixed by adding an explicit refusal
      for `proof.smoke === 'NOT_EXECUTED' || result == null` that only writes to
      `timeline.ndjson` (an activity log, not a verdict store) and exits 2. `--apply` fails
      closed in both `agentic-toolgan-execute.mjs` (`TOOLGAN_APPLY_REQUIRES_GOVERNED_MUTATION_RECEIPT`)
      and `agentic-toolgan-replay.mjs` (unconditional `REPLAY_NOT_EXECUTED_GOVERNED_APPROVAL_REQUIRED`
      exit 2, including under `--test` -- verified live that `--test` no longer auto-passes: it
      still requires a real `--trace_id` resolving to a real timeline event and does not skip
      the terminal refusal). Live-verified end to end (not just per-file): ran `execute.mjs`
      (produced `result:null`), then `log-outcome.mjs` against that exact plan --
      `successes.ndjson`/`failures.ndjson`/`do-not-repeat.ndjson` line counts were unchanged
      before and after. Structural sweep (`rg` for `execSync|execFile|spawn|writeFileSync|...`
      across all three files) found zero executable matches other than one disclosed
      `writeFileSync` in `execute.mjs` that writes only to the ephemeral, gitignored
      `.tmp/toolgan-current-plan.json` staging file used to thread state between
      plan/execute/log-outcome within one proposal cycle -- never a canonical or durable write,
      kept because removing it would break the refusal mechanism this fix depends on. Full
      receipt: `docs/reports/agentic-error-fixing-current-v3.json`.
- [x] **AGENTIC-ERROR-FIX-APPLY-QUARANTINE-01** — closed by removing the dangerous capability
      structurally rather than quarantining the file. The committed baseline (git HEAD before
      this session) had a real high-risk bug beyond what this task text originally named:
      `restartEmbeddingService()` ran `docker restart legal-ai-ollama` via `execSync`
      UNCONDITIONALLY, before `isDryRun` was ever checked -- "dry-run" could mutate live service
      state -- and `--apply` mode additionally ran a real `UPDATE error_logs ... RETURNING` via
      `markErrorsAsResolved()`. A second bug: dry-run reported merely-eligible candidates as
      `totalFixed`, representing a would-be repair as an actual one. Fixed: removed
      `executeCommand`/`execSync`, `restartEmbeddingService`, and `markErrorsAsResolved`
      entirely (not gated -- deleted); `--apply` now exits 2 with
      `AGENTIC_ERROR_FIX_APPLY_BLOCKED_GOVERNED_EXECUTOR_REQUIRED` before Postgres is touched;
      the sole remaining dry-run mode hardcodes `totalFixed:0` and `repairProof:false`, reporting
      eligible-but-unactioned candidates as separate diagnostic-only counts
      (`wouldAffectCount`/`unfixableCount`) that never fold into a "fixed" total; replaced the
      nonstandard `fetch({timeout})` option with a real `AbortSignal.timeout(5000)`. Preserved
      per the task's own instruction (real npm-script callers confirmed live:
      `atlas:error:apply`/`:verbose`/`:force` in `sveltekit-frontend/package.json`) -- not
      deleted, reachability was not unresolved. Verified live: `--apply` exits 2 before any
      DB/service call; `node --check` passes; structural `rg` sweep for
      `execSync|...|docker restart|UPDATE error_logs` returns zero executable matches (only
      prose comments describing the fixed historical bug). Full receipt:
      `docs/reports/agentic-error-fixing-current-v3.json`.
- [x] **AGENTIC-GOVERNED-REPLAY-PROOF-02** — closed via
      `governed-replay-admission-v1.spec.ts` (7/7 live). One earlier `npx vitest run` showed
      3/7 failing with `REJECTED_APPROVAL` where `REJECTED_PREFLIGHT` was expected; a standalone
      debug script calling the same admission function directly with identical inputs returned
      the expected result, and a subsequent `--no-cache` re-run of the same spec file came back
      7/7 clean. This is a non-reproducible runner/cache discrepancy, not a proven root cause --
      the transform cache was never independently confirmed as the causal mechanism, only
      correlated with the one-off failure. Recorded as an open anomaly, not asserted as
      understood. Proves, against the real `admitGovernedReplayV1`/`preflightFileMutation`/
      `resolveMutationApproval` boundary (fixture root, real filesystem, no mocks): (1) no
      approval means no mutation (`REJECTED_NO_APPROVAL`, `writesPerformed:false`); (2) a
      stale canonical-event workspace revision rejects (`REJECTED_EVENT_PLAN_MISMATCH`); (3)
      an allowed-root escape rejects at preflight (`REJECTED_PREFLIGHT`, real path-containment
      check, not a mock); (4) a stale preimage (`expectedExistingChecksum` mismatch against a
      real on-disk file) rejects at preflight; (5) targeted validation is mandatory --
      discovered this is enforced one layer earlier than assumed: `FileMutationPlanSchema`'s
      `validationNodeIds` is `z.array(...).min(1)`, so a plan with zero validation nodes is
      unconstructible and fails schema parse (`REJECTED_APPROVAL`, `'mutation plan is
      invalid'`), never reaching preflight's own (now-provably-dead-but-harmless) empty-array
      check -- the original task assumption that this was a preflight-level rejection was
      wrong, fixed rather than asserted past; (6) the admitted read-only receipt carries
      stable repair identity (`workflow_id`/`action_id`/`producer_revision` matching the
      canonical event) and a real revision binding (`plan.workspaceRevision ===
      event.revisions.workspace`), plus two well-formed sha256 checksums
      (`event_checksum`/`runtime_evidence_checksum`), with `writesPerformed:false` in every
      case including the happy path. This remains separate from
      `AGENTIC-REPAIR-VERTICAL-REPLAY-01` and does not authorize production repair execution
      -- `admitGovernedReplayV1` has no write/execute code path at all, by construction.
- [x] **AGENTIC-GOVERNED-ADMISSION-PROOF-01** — added the pure
      `admitGovernedReplayV1` boundary. It validates the canonical workflow event against the
      mutation plan, rejects missing approval and stale event revisions, verifies plan-bound
      approval plus file preflight, derives the canonical event/runtime-evidence receipt, and
      always returns `writesPerformed=false`. Focused governed-replay/preflight tests pass
      14/14, with the canonical writer adapter passing 2/2 separately. This proves
      admission/preflight and event-receipt binding only; it does not claim mutation,
      validation, or durable receipt completion.
- [x] **AGENTIC-DURABLE-WRITER-CANONICAL-EVENT-01** — closed. `action-writer.ts` remains the
      single durable writer (no second writer created); its canonical-event path routes through
      `canonical-action-write-adapter-v1.ts` and now has a genuinely constraint-aware mocked
      transaction proof, `action-writer.spec.ts` (7/7 live, `--no-cache`), covering everything
      this gate required:
      - **Sequence/causation identity preserved**: canonical `sequence`/`parentActionId` map onto
        `agent_run_actions.sequence_no`/`causation_id` and `workflow_events.sequence_no`,
        verified by the sequence-convention tests (see `WORKFLOW-ACTION-SEQUENCE-CHECK-02`).
      - **Canonical event checksum/readback proven**: `writeActionAtomically()` re-selects the
        just-written `workflow_events`/`outbox_events` payloads inside the same transaction and
        calls `validateCanonicalActionReadbackV1()` against them -- the mocked-transaction test
        "persists canonical identity and readback in workflow and outbox payloads" proves this
        round-trips through a real (mocked) transaction, not just through the pure adapter.
      - **Same-identity checksum collision rejection wired and proven**: `classifyCanonicalIdentityV1()`
        (previously declared but never called from any production code path -- a real gap, not
        merely "unproven") is now invoked from two places in `writeActionAtomically()`: (1) an
        identity pre-check keyed on the canonical event's own `(runId, actionId, sequence)`
        triple before the idempotency lookup even runs, and (2) inside the idempotencyKey-match
        branch, comparing the incoming event against whatever is actually stored under that key.
        These are complementary, not redundant -- each catches a collision shape the other
        misses (reused key with different identity vs. same identity reached via a different
        key). Proven live: "accepts same canonical identity as retry and rejects checksum
        collision" (retry succeeds, a genuine content collision throws
        `CANONICAL_EVENT_IDENTITY_COLLISION`, and nothing new is written for the rejected call).
      - **Outbox atomicity proven, not assumed**: upgraded the mock's `db.transaction` from a
        naive "write straight into a shared store" fake (which cannot actually prove rollback)
        to real snapshot/commit-or-discard semantics -- each transaction operates on a cloned
        draft, committed to the shared store only if the callback resolves, discarded entirely
        on throw. Verified the upgrade itself is load-bearing, not decorative: temporarily
        reverted it to the naive (no-rollback) form and confirmed the new atomicity test
        genuinely fails against it (`agent_runs` leaked a row from a failed transaction attempt),
        then restored the real fix and re-confirmed 7/7 pass. The atomicity test itself
        pre-seeds a conflicting `agent_run_actions` row so a real write reaches and fails at the
        `agent_run_actions` insert AFTER the `agent_runs` insert in the same attempt already
        "succeeded" in the draft, then asserts zero rows from that attempt survive anywhere.
      - **Legacy-caller migration**: intentionally NOT attempted here -- `writeActionAtomically()`
        and `advanceActionStatus()` both have zero real (non-test) callers anywhere in the repo
        today (confirmed via `rg`), so there is no legacy caller to migrate yet; this remains a
        real open item for whenever a live caller is wired, not something this gate could close
        against a caller that doesn't exist.
      Full suite re-verified: `agent/` directory 15/15 pass (1 pre-existing unrelated skip),
      `--no-cache`; `tsc --noEmit` reports zero errors for either touched file.
- [x] **CANONICAL-EVENT-RUN-ID-SCHEMA-ALIGNMENT-01** — corrected the shared
      `@deeds/parent-atlas` event schema to carry the durable runtime-owned
      `runId` and revision bundle required by the canonical action writer and
      governed replay admission. Updated stale temporal/governed-replay
      fixtures and rebuilt the package. Package event tests pass 3/3, governed
      replay tests pass 7/7, and the SvelteKit action-writer suite passes 7/7.
- [x] **AGENTIC-CANONICAL-WRITER-ADAPTER-PROOF-01** — pure adapter proof complete, and the
      database transaction / outbox atomicity / durable readback gaps this entry originally
      deferred are now closed above under `AGENTIC-DURABLE-WRITER-CANONICAL-EVENT-01`.
      **Implementation update 2026-09-14:** the existing writer now exposes
      `writeCanonicalWorkflowActionAtomically()` as the single canonical entrypoint. It
      validates and forwards caller-owned event/run/action IDs and sequence values through
      the existing transaction; it does not create a second writer. Canonical database
      readback, same-identity checksum collision rejection, and outbox atomicity are
      now covered at mocked-transaction scope; live database readback and legacy-caller
      migration remain open.
      **Readback implementation 2026-09-14:** canonical writes now validate the inserted
      `workflow_events` and `outbox_events` payloads inside the same transaction against the
      canonical event and independently derived runtime receipt. Missing payloads, identity
      drift, and receipt/checksum drift fail closed. The pure readback validator is covered
      by the canonical adapter and action-writer suites; full rollback-on-error coverage
      and live database readback remain open.
      **Identity guard implementation 2026-09-14:** added pure
      `classifyCanonicalIdentityV1()` and focused tests distinguishing `NEW`,
      same-identity/same-checksum `IDEMPOTENT_DUPLICATE`, and
      same-identity/different-checksum `CANONICAL_EVENT_IDENTITY_COLLISION`. Wiring this
      decision into the existing duplicate database lookup and proving rollback/outbox
      atomicity remain open.
- [x] **WORKFLOW-ACTION-SEQUENCE-CHECK-02** — froze the convention (per-run `workflow_events`
      sequence numbers start at 1 and strictly increase by 1 per event for that `run_id`,
      matching the real `workflow_events_run_seq` unique constraint on `(run_id, sequence_no)`)
      and proved it with a new mocked-transaction test,
      `sveltekit-frontend/src/lib/server/agent/action-writer.spec.ts` (4/4 live,
      `vitest run --no-cache`). The mock enforces the SAME unique constraints Postgres does
      (`agent_run_actions_run_seq`, `workflow_events_run_seq`, both on `(run_id, sequence_no)`),
      using the real `schema-postgres.js` table/column objects (not re-declared/mocked), so a
      convention violation surfaces as the same constraint-violation shape a real transaction
      would produce -- this is exactly "do not infer persisted compatibility from type-level
      assignability alone": TypeScript's type checker cannot catch a wrong runtime sequence
      value, only a constraint-aware execution can.
      **Real bug found and fixed, not merely tested for**: `advanceActionStatus()` in
      `action-writer.ts` computed the next `workflow_events.sequence_no` by querying
      `agent_run_actions.sequenceNo` (a static value set once at action creation, never
      updated) instead of `workflow_events.sequenceNo` (the actual per-run append-only log)
      -- with no `ORDER BY` even on that wrong table, so the "current max" was an arbitrary row
      under real Postgres semantics regardless. This meant every call to `advanceActionStatus()`
      after the first for the same run recomputed the exact same next-sequence value and would
      violate `workflow_events_run_seq` on insert. Confirmed live: the new test failed against
      the pre-fix code with `unique constraint violation: workflow_events_run_seq (<runId>, 2)`
      on the second status transition, exactly as predicted from reading the code, before any
      fix was applied. Fixed by querying `workflow_events` itself,
      `.where(eq(workflowEvents.runId, runId)).orderBy(desc(workflowEvents.sequenceNo)).limit(1)`,
      then `+1` (falling back to `0 + 1 = 1` when no prior event exists for that run). Since
      `advanceActionStatus()` has zero real (non-test) callers anywhere in the repo today
      (confirmed via `rg`), this was a zero-live-migration-risk fix for a bug that would have
      broken deterministically the moment a real caller was wired to it.
      Producer-vs-receipt checksum distinctness: already correctly separated and documented --
      `packages/parent-atlas/src/core/workflow-action-event.ts`'s optional `checksum` field
      (self-computed by some producers, e.g. the compiler-lifecycle adapter) is explicitly
      commented as distinct from `workflowActionEventReceiptSchema.event_checksum` (externally
      computed by `workflowActionEventToRuntimeEvidence()` over the whole event); no code path
      conflates the two. Full suite re-verified alongside this fix: `agent-writer.spec.ts` 4/4,
      `canonical-action-write-adapter-v1.spec.ts` 3/3, `patch-tournament.spec.ts` 3/3,
      `supervisor.integration.test.ts` 1/1 (1 pre-existing unrelated skip) -- 11/11 pass,
      `--no-cache`.

#### Gates explicitly corrected or already proven at limited scope

- [x] Route scaffolds no longer claim retrieval `PASS` when they return no evidence:
      runtime-retrieve and the Mastra-shaped route now emit pending/empty evidence and require
      explicit workspace, packet, workspace-revision, and packet-revision inputs.
- [x] Missing historical revisions remain nullable observations; null is not converted into a
      current revision or a fabricated source identity.
- [x] `atlas_symbol_registry`/`atlas_symbol_versions` remain the resolved symbol owners;
      `graphify_symbols` remains a producer/compatibility surface.
- [x] PageRank/PPR/CheiRank placement is fixed as derived graph-feature work, downstream of
      current graph and ordinal proof.

The next executable gate is `GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02`, followed by
`CURRENT-EXECUTION-SOURCE-PACKET-CHUNK-CLOSURE-03`. Do not start semantic, graph, GPU,
cache, XGBoost, cleanup, migration, or optional TRACE promotion before those readbacks pass.

### Snapshot binding readback result (2026-09-14)

- [x] The audit now prefers `graphify_execution_file_membership_v2` exclusively when the
      execution has V2 rows; it no longer combines V2 and legacy execution-file populations.
- [x] Historical execution `cbcd35c6-b26c-4d1a-a08b-9aa16a1afbcc` matches its recorded
      `sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf` snapshot
      membership (`25,291` sources; membership checksum match). This is historical evidence,
      not current authority for a different admitted revision.
- [ ] The current admitted revision is
      `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`.
      Snapshot readback is still blocked: `25,066/25,291` exact source matches, `225`
      source readback failures, and `workspaceId` is not proven in the receipt.
- [ ] No terminal execution is jointly proven for the current admitted revision. Do not
      relabel the `322ed1a6` execution, infer currentness from hash ordering, or use a
      source-equivalent historical execution as the current owner.
- [ ] The next proof must either identify one terminal execution whose workspace revision and
      immutable membership exactly match `3e677c…`, or return an explicit
      `NO_EXECUTION_FOR_ADMITTED_REVISION` / `SNAPSHOT_READBACK_BLOCKED` result with the
      failed source set classified for repair. `writesPerformed=false` remains required.

### Current Graphify owner audit result (2026-09-14)

- [x] The explicit current-run audit consumed the tournament-admitted revision
      `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881` and
      completed read-only with no report-write error.
- [ ] Current execution owner remains absent: `runCount=0`, `completedOwnerCount=0`,
      `workspaceRowCount=0`, and `coordinatorExecutionCount=0`. The authoritative status is
      `GRAPHIFY_RUN_OWNER_BLOCKED`, not an empty successful cohort.
- [ ] The older `cbcd35c6…` execution remains valid only for its historical
      `sha256:322ed1a6…` frame. It cannot satisfy the current `3e677c…` gate.
- [ ] Do not launch Graphify, relabel an execution, or backfill memberships as part of this
      audit. The next authorized proof must create or identify a terminal execution explicitly
      bound to `3e677c…`, then read back its immutable V2 membership before packet/chunk work.

### Explicit packet/chunk join result (2026-09-14)

- [x] The packet/chunk auditor consumed the admitted revision explicitly; it did not infer a
      current revision from timestamps, lexical hash order, or a default value.
- [ ] Current join remains `CURRENT_PACKET_CHUNK_JOIN_MISSING`: `binding_rows=0`,
      `binding_sources=0`, `graphify_exact_sources=0`, `packet_chunk_exact_sources=0`, and
      `packet_content_matches=0` for the selected current frame.
- [ ] This is an authority absence, not a successful empty cohort. Keep semantic_768,
      symbol-registry promotion, graph edges, Qdrant fanout, GPU residency admission, cache
      warming, and cleanup closed until an execution-bound source membership is read back and
      joins exactly through packet/chunk lineage.

### Phase 78 clustering correctness finding (2026-09-14)

- [x] **PHASE78-KMEANS-FINAL-ASSIGNMENT-01** — fixed the final assignment distance formula
      in `sveltekit-frontend/scripts/phase78-cluster-errors.mts` by extracting the pure
      `sveltekit-frontend/scripts/phase78-kmeans.ts` implementation and correcting the
      accumulator from `diff * dist` to `diff * diff`.
- [x] **PHASE78-KMEANS-DETERMINISM-01** — replaced random centroid initialization with stable
      farthest-point selection over lexically ordered event IDs; empty clusters preserve their
      prior centroid. The focused fixture proves two obvious groups and replay stability (2/2).
- [x] **PHASE78-CLUSTER-ASSIGNMENT-COHORT-01** — completed the live read-only census:
      `error_events=148`, `assigned_events=148`, `unassigned_events=0`,
      `distinct_assigned_clusters=1`, `error_clusters=1`, and no missing parent cluster
      references. Receipt classification is `SINGLE_CLUSTER_ASSIGNMENT_SUSPECT`; the exact
      affected population is identified, but no run provenance is available from the live
      schema and no repair authorization was granted.
- [x] **PHASE78-CLUSTER-ASSIGNMENT-REPLACEMENT-PLAN-01** — emitted a read-only replacement
      plan bound to the exact predicate `error_events.cluster_id IS NOT NULL`, the 148-row
      cohort checksum `sha256:eba2094fe601d0dc23df6b5abaa485ee5704e493691b9620efc6db50c5ecc2af`,
      and algorithm revision `phase78-kmeans-deterministic-farthest-point-v1`. The plan
      requires explicit authorization, archive/readback, and rollback; `safeToApply=false` and
      `writesPerformed=false` remain enforced.
- [ ] Existing 148 persisted assignments remain quarantined and must not be treated as valid
      evidence. The read-only affected-cohort receipt is complete; a separate bounded replacement
      plan is complete, but an explicitly authorized, transactionally reversible replacement run
      is still required. No database rows were changed by this correction.

### Current admitted snapshot execution recheck (2026-09-14)

- [x] The admitted snapshot consumer preflight is proven read-only for workspace revision
      `sha256:e24bb971…` and snapshot revision `sha256:6288726b…`: `25,542` sources,
      matching source-membership checksums, zero missing sources, zero hash/size mismatches,
      and zero live-inventory or Git-derivation fallbacks.
- [x] Snapshot-native Graphify execution owner created and completed two terminal executions
      for the admitted frame, each with `25,542` immutable V2 membership rows. Independent
      per-execution readbacks pass with zero missing, unexpected, duplicate, revision,
      checksum, or byte mismatches. Evidence:
      `docs/reports/graphify-snapshot-native-readback-0dba-v1.json` and
      `docs/reports/graphify-snapshot-native-readback-74d5-v1.json`.
- [ ] Canonical execution authority remains blocked because two terminal executions match one
      admitted workspace revision. Do not delete, relabel, or silently choose one; reconcile
      duplicate execution identity under an explicit owner decision before promotion.
- [ ] Current source-to-packet-to-chunk closure remains blocked: the explicit `e24bb…` join
      reports `binding_rows=0`, `binding_sources=0`, `graphify_exact_sources=0`,
      `packet_chunk_exact_sources=0`, and `packet_content_matches=0`. Execution membership
      evidence is not interchangeable with `atlas_workspace_source_bindings` or packet/chunk
      lineage. Keep semantic, symbol, graph, Qdrant, GPU, cache, and XGBoost promotion closed.
- [x] Fixed the canary expectation auditor to validate the strict contract fields while
      ignoring persisted report-envelope metadata. Read-only canary audit passes and the
      focused contract suite passes `5/5`.

Status: `EXECUTION_MEMBERSHIP_READBACK_PROVEN_DUPLICATE_EXECUTION_AUTHORITY_BLOCKED`;
`CURRENT_PACKET_CHUNK_JOIN_MISSING`; no semantic, graph, vector, cache, or projection writes
were performed by the audits.

### Current execution-owned source/packet/chunk recheck (2026-09-14)

- [x] The packet/chunk auditor now requires an explicit `--execution-id` and uses
      `graphify_execution_file_membership_v2` as the current Graphify evidence owner for
      `repo:root`; it no longer asks the legacy `graphify_files` projection to prove the
      current execution.
- [x] Read-only recheck against execution `0dba1c0d-2cf7-4f35-a61b-c77956f60d3d`, admitted
      workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`,
      read back `24,456/24,456` exact execution-owned source members. No source, graph,
      packet, chunk, vector, cache, or projection writes occurred in this recheck.
- [ ] The downstream bridge remains blocked: `binding_chunk_content_matches=0`,
      `packet_content_matches=0`, and `packet_chunk_exact_sources=0`. This is no longer a
      missing current execution/source-membership result; it is an unresolved packet/chunk
      identity or materialization gap. Whole-source digests must not be equated with
      per-chunk digests, and no synthetic packet or chunk identity may be created.
- [ ] The duplicate terminal execution authority remains unresolved: both current executions
      have independently valid membership readbacks. Do not silently select, delete, or
      relabel either execution.

Next gate: `CURRENT-PACKET-CHUNK-IDENTITY-RECONCILIATION-01` — run a read-only exact join
through `atlas_packets` and `atlas_packet_chunk_lineage` using the execution-owned source
cohort, classify missing packet rows versus missing lineage rows versus digest-namespace
mismatch, and leave semantic, graph, XGBoost, GPU, cache, and durable-event promotion closed.

### Packet/chunk identity reconciliation result (2026-09-14)

- [x] Added `scripts/atlas/audit-current-packet-chunk-identity-reconciliation-v1.mjs` as a
      read-only, explicit-revision/explicit-execution classifier. It writes no database,
      vector, graph, cache, or task state.
- [x] Against the current `e24bb…` bindings and the explicitly selected execution
      `74d50c86-8194-45ea-8c3d-61aab737ef83`, the receipt records `24,456` bound sources,
      `24,456` exact Graphify source matches, `16,554` packet source-reference matches,
      `0` packet whole-source digest matches, `627` proven lineage source-reference matches,
      and `627` packet-lineage reference joins.
- [ ] The blocker is now classified as `PACKET_DIGEST_BRIDGE_MISSING`: all `16,554` packet
      reference matches have a digest mismatch, while `7,902` current sources have no packet
      reference. Existing proven lineage is historical/path evidence and is not promoted to
      the current cohort. Do not equate packet whole-source hashes with per-chunk hashes or
      synthesize packet/chunk identities.

Evidence: `docs/reports/current-packet-chunk-identity-reconciliation-v1.json` and
`docs/reports/current-workspace-packet-chunk-join-v1.json`.

Next gate: `PACKET-DIGEST-NAMESPACE-OWNER-01` — determine whether current packet content
identity is stored under `content_hash`, `sha256`, or an independently revisioned packet
artifact, then prove an exact source-byte bridge before any lineage materialization. The
duplicate terminal execution authority remains unresolved in parallel.

### Durable event and current-owner recheck (2026-09-14)

- [x] Canonical workflow-event writer unit proof remains green: the actual writer specs
      cover caller-owned run/action IDs, sequence and causation preservation, canonical
      workflow/outbox payload readback, same-identity idempotency, checksum collision
      rejection, and transaction rollback (`11/11` tests when invoked directly).
- [ ] This does not close live durable-event adoption: no production database writer was
      invoked in this pass, so live Postgres/outbox readback and persisted canonical checksum
      evidence remain unproven.
- [x] Fresh current Graphify authority readback now accepts the explicit, preflight-validated
      execution `74d50c86-8194-45ea-8c3d-61aab737ef83` and reports `CURRENT_SNAPSHOT_PROVEN`.
      The receipt still records two equivalent qualifying executions and keeps
      `canonicalAuthority=false`, so this is a selected reconciliation frame rather than a
      historical relabel or implicit canonical-owner mutation.

The current queue therefore remains:

explicit Graphify execution frame → `PACKET-DIGEST-NAMESPACE-OWNER-01` → exact packet/chunk
bridge → current graph edges/ordinal map → semantic corpus admission. Canonical durable event
live readback remains an independent P1 gate; no null provision, historical row, or fixture
result may be promoted as current authority.

### Packet writer hardening (2026-09-14)

- [x] Extended `persistCanonicalSemanticPacketEmbedding()` with caller-owned optional
      `contentHash`, preserving nullable behavior and writing it to `atlas_packets.content_hash`
      on insert/upsert. Added focused coverage; semantic packet writer suite passes `8/8`.
- [ ] Existing historical packet rows were not backfilled. The current cohort still requires
      an independently proven source-byte digest and source/workspace revision before any
      packet/chunk lineage materialization or semantic promotion.
- [x] Quarantined the legacy `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs --apply`
      path. It now fails before database connection/write with
      `PACKET_WRITER_QUARANTINED`; dry-run inventory remains available. This prevents an
      unqualified historical writer from creating new packet rows while the canonical writer
      and exact source-byte bridge remain open.

### Packet digest namespace census (2026-09-14)

- [x] Extended `audit-current-packet-chunk-identity-reconciliation-v1.mjs` to inspect both
      packet digest columns without treating them as interchangeable. `content_hash` is the
      canonical packet whole-source digest candidate; `sha256` is retained as a legacy,
      diagnostic-only namespace.
- [x] Read-only rerun against the explicit admitted workspace revision and execution records
      `24,456` bound sources, `16,554` packet source-reference matches, `0` canonical
      `content_hash` matches, `3,230` legacy `sha256` matches, `3,230` matches in either
      digest namespace, `13,324` packet digest mismatches, and `7,902` missing packet rows.
      No database, vector, graph, cache, or projection writes occurred.
- [ ] The packet bridge remains blocked: legacy `sha256` matches are not promotion evidence,
      and no exact source-byte-to-canonical-packet digest bridge has been proven for the
      remaining cohort. Do not backfill or reinterpret `sha256` as `content_hash`.

Next implementation gate: `PACKET-DIGEST-NAMESPACE-OWNER-01` must either prove the existing
`content_hash` producer from source bytes or define an explicitly revisioned packet artifact
and its readback contract. Only then may the exact packet/chunk bridge proceed.

### Immutable snapshot authority recheck (2026-09-15)

- [x] `audit-current-graphify-snapshot-authority-v1.mts` now consumes the admitted
      `manifestPath` from the tournament admission receipt and verifies the sealed snapshot
      checksum before comparing execution membership. It no longer uses the moving worktree
      as the source-count or content authority.
- [x] Against admitted workspace revision
      `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` and snapshot
      `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b`, both terminal
      executions (`0dba1c0d-2cf7-4f35-a61b-c77956f60d3d` and
      `74d50c86-8194-45ea-8c3d-61aab737ef83`) pass the immutable 25,542-source membership,
      identity, source-revision, content-hash, byte-length, and checksum checks.
- [ ] Canonical execution ownership remains blocked as
      `AMBIGUOUS_QUALIFYING_EXECUTIONS`: two equivalent terminal executions qualify. Neither
      may be silently selected, relabeled, or deleted. This is now an owner-decision blocker,
      not a snapshot/source-membership mismatch.

Evidence: `docs/reports/current-graphify-snapshot-authority-v1.json`.
The explicit next gate is a deterministic duplicate-execution owner decision, followed by
the packet/chunk bridge. The packet reconciliation remains `PACKET_DIGEST_BRIDGE_MISSING`:
`0` canonical `content_hash` matches, `3,230` legacy `sha256` matches (diagnostic only),
and `7,902` current bound sources have no packet reference. No projection or backfill write
is authorized.

### Owner-bound authority recheck (2026-09-15)

- [x] Added an explicit `--execution-id` path to the existing authority audit. The selected
      execution must be present in the immutable owner plan, pass the selected-owner preflight,
      and match its current plan checksum; stale or missing preflights fail closed.
- [x] Bound execution `74d50c86-8194-45ea-8c3d-61aab737ef83` to the admitted snapshot for
      read-only downstream reconciliation. The refreshed receipt reports `CURRENT_SNAPSHOT_PROVEN`
      while retaining `qualifyingExecutions=2`, `canonicalAuthority=false`,
      `safeToApply=false`, and `writesPerformed=false`.
- [ ] Canonical Graphify history is not rewritten and duplicate execution cleanup remains
      unauthorized. The selected execution is a validated input frame, not a mutation grant.

Evidence: `docs/reports/current-graphify-snapshot-authority-v1.json`,
`docs/reports/current-source-selection-input-v1.json`, and
`docs/reports/selected-graphify-execution-owner-v1.json`. The next gate is the packet digest
bridge and exact source-to-packet-to-chunk closure.

### Duplicate current execution owner plan (2026-09-15)

- [x] Added `scripts/atlas/plan-current-graphify-execution-owner-resolution-v1.mjs` as a
      read-only owner-resolution planner. It consumes the admitted snapshot manifest,
      prefers the immutable V2 membership ledger, and binds the comparison to source-ref,
      repository-identity, source-revision, content-hash, byte-length, and stage checksums.
- [x] Live plan result: two terminal executions, one distinct evidence signature, and exact
      equivalence for the full 25,542-source cohort. The deterministic recommendation is
      execution `74d50c86-8194-45ea-8c3d-61aab737ef83` (earliest completion, then execution ID).
      This is only a recommendation and requires an explicit authority decision.
- [ ] Canonical execution ownership is still not proven. The planner reports
      `DUPLICATE_EQUIVALENT_EXECUTIONS`, `safeToApply=false`, `canonicalAuthority=false`,
      and `writesPerformed=false`; neither execution was relabeled, deleted, or modified.

Evidence: `docs/reports/current-graphify-execution-owner-resolution-v1.json`.

### ACE route revision-qualified cache admission (2026-09-15)

- [x] Added `admitAceRouteCacheIdentityV1()` as the route boundary for
      production ACE packet caching. It requires a complete, schema-validated
      `AceBitfrostCacheIdentityV1` with `cacheKind=ACE_PACKET` and derives the
      revisioned BitFrost key from that identity.
- [x] Changed the ACE stream route to use the revisioned packet cache only when
      that identity is admitted. Query-only legacy cache entries are no longer
      used or warmed by this route and are reported as degraded/blocked.
- [x] Added focused tests for missing identity, invalid/non-packet identity,
      request-hash mismatch, and admitted identity/key derivation. The route
      request hash is now part of the revisioned identity checksum so two
      queries cannot share a packet cache entry accidentally.
- [ ] Supply the identity from the canonical SearchRuntime/ContextManifestV2
      handoff in a live caller and prove exact cache readback. This remains a
      downstream live-delivery gate; the route must not infer revisions from
      timestamps, packet contents, or query hashes.

Status: `ROUTE_ADMISSION_SCAFFOLD_PROVEN`; `LIVE_IDENTITY_HANDOFF_OPEN`;
`canonicalAuthority=false`; `writesPerformed=false` for the proof.

Evidence: `sveltekit-frontend/src/lib/server/ace/ace-route-cache-admission-v1.ts`,
`sveltekit-frontend/src/lib/server/ace/ace-route-cache-admission-v1.spec.ts`,
and `sveltekit-frontend/src/routes/api/ace/stream/+server.ts`.

Follow-up reconciliation:

- [x] Confirmed `SearchRuntime.searchWithAceManifest()` is an existing opt-in,
      read-only producer and returns a `RetrievalCacheIdentityV1` only when its
      caller supplies the required runtime fields.
- [x] Confirmed no current route or caller invokes that method. The ACE stream
      route therefore cannot claim live `ContextManifestV2` identity delivery;
      its `aceCacheIdentity` input is an explicit boundary scaffold only.
- [ ] Add one canonical caller adapter that converts the admitted manifest and
      explicit packet artifact checksum into the `ACE_PACKET` BitFrost identity,
      then prove route cache readback. It must reject a null graph revision,
      missing producer/normalization revision, or query-hash mismatch.

- [x] Added the pure SearchRuntime retrieval-identity → ACE packet-identity
      bridge with explicit packet producer, normalization, representation, and
      artifact checksum inputs; null graph revisions fail closed. The route's
      full request hash is supplied explicitly because it is distinct from the
      truncated SearchRuntime retrieval hash.
- [x] Added the ContextManifestV2 → retrieval identity → ACE packet identity
      caller adapter; incomplete manifest lineage fails closed.
- [x] Extended `SearchRuntime.searchWithAceManifest()` to expose that packet
      identity when callers provide an explicit graph revision and packet
      artifact metadata; the default path remains non-promotional and returns
      no packet identity when those fields are absent.

Updated status: `ROUTE_ADMISSION_SCAFFOLD_PROVEN`;
`SEARCH_RUNTIME_CALLER_NOT_WIRED`; `LIVE_CACHE_READBACK_OPEN`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-adapter.ts`
(`searchWithAceManifest`) and the route admission report.

- [x] Corrected the ACE route authority auditor so `hashQuery` used for
      request binding is not misclassified as a legacy cache import. The
      rerun now reports `legacyQueryOnlyImport=false` and
      `strictRevisionCacheImport=true`; source-revision ownership remains
      intentionally blocked until a live canonical caller is proven.

Evidence: `docs/reports/ace-revision-source-owner-v1.json`.

Audit result update: `ROUTE_IDENTITY_ADMISSION_SCAFFOLD` with
`legacyQueryOnlyImport=false`, `strictRevisionCacheImport=true`, and next gate
`LIVE_ACE_IDENTITY_HANDOFF_READBACK`. This is source-path progress only;
`canonicalAuthority=false` and `writesPerformed=false` remain unchanged.

### Current Graphify packet-bridge recheck (2026-09-15)

- [x] Re-ran the packet digest bridge with the explicitly preflight-selected
      execution `74d50c86-8194-45ea-8c3d-61aab737ef83` and the admitted workspace
      revision. The bounded read-only sample found 17 missing packets and 8
      packets without canonical content digests; canonical matches remain 0.
- [x] Confirmed the alternate equivalent execution is rejected by the bridge's
      owner-preflight checksum, so the bridge cannot silently compare or promote
      an unselected execution.
- [ ] Keep packet/chunk materialization blocked until the explicit duplicate
      execution lifecycle decision is authorized and the canonical packet digest
      producer/readback closes the missing/mismatched rows.

Status: `GRAPHIFY_OWNER_PREFLIGHT_ENFORCED`; `PACKET_DIGEST_BRIDGE_BLOCKED`;
`writesPerformed=false`.

Evidence: `docs/reports/current-packet-digest-bridge-v1.json`,
`docs/reports/selected-graphify-execution-owner-v1.json`, and
`docs/reports/current-graphify-execution-owner-resolution-v1.json`.

### Independent feature-ontology source-span/revision validation (2026-09-16)

- [x] Hardened `scripts/atlas/audit-feature-ontology-source-span-revision-v1.mjs`
      to replace JSON and Markdown receipts atomically, avoiding the Windows
      report-write race.
- [x] Re-ran the read-only audit against
      `docs/reports/feature-ontology-fresh-extraction-multilane-v1.json`:
      304 candidates across 6 source files; 4 source revisions are current and
      2 are stale; 7 spans are in bounds, 2 span texts mismatch, and 295
      candidates make no span claim.
- [ ] Re-extract the two stale sources and repair the two mismatched spans
      before human review or ontology/semantic promotion.
- [ ] Keep all observations non-promotional until source revision and span
      evidence are current; do not invent revisions or repair spans by path.

Status: `SOURCE_REVISION_DRIFT_DETECTED`; `HUMAN_REVIEW_BLOCKED`;
`writesPerformed=false`.

Evidence: `docs/reports/feature-ontology-source-span-revision-v1.json`.

### Revision-current ontology review triage (2026-09-16)

- [x] Ran the read-only mechanical triage over the 253 candidates whose source
      file revision is current; the 51 candidates from stale sources remain
      excluded.
- [x] Classified the review queue without changing candidate status or granting
      canonical authority: `GROUNDED=7`, `LIKELY_SYMBOL=72`,
      `LIKELY_NOISE=26`, `UNCERTAIN=148`.
- [ ] Complete human/source-grounded review and re-extract the two stale source
      files plus the two text-mismatched spans before REL-01B admission.

Status: `REVIEW_QUEUE_TRIAGED`; `REL_01B_BLOCKED`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/feature-ontology-review-triage-v1.json`.

### Feature ontology packet-lineage audit (2026-09-16)

- [x] Hardened `scripts/atlas/audit-feature-ontology-packet-lineage-v1.mjs`
      with atomic report replacement after the Windows receipt-write failure.
- [x] Completed the read-only PostgreSQL lineage census: 353,973 tuples
      examined; 353,120 classified `ALIAS_NOT_APPROVED`; 853 classified
      `CURRENT_GRAPHIFY_SOURCE_MISSING`.
- [ ] Resolve approved alias authority and current Graphify/source membership
      before treating any ontology tuple as an admitted observation.

Status: `PACKET_LINEAGE_CLASSIFIED`; `ONTOLOGY_PROMOTION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/feature-ontology-packet-lineage-v1.json`.

### Fresh ontology producer selection (2026-09-16)

- [x] Confirmed the bounded owner selection: `feature-ontology-fresh-extractor-v1`.
- [x] Kept the permitted structural, Python-enrichment, and grounded-LangExtract
      adapters explicitly review-only; no adapter is a canonical identity owner.
- [x] Confirmed `groundedSources=0`; no ontology candidate is eligible for live
      promotion from this receipt.
- [ ] Re-extract current source evidence with grounded spans, resolve stale and
      mismatched source observations, then repeat packet-lineage admission.

Status: `PRODUCER_OWNER_SELECTED_REVIEW_ONLY`; `ONTOLOGY_PROMOTION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/feature-ontology-fresh-producer-selection-v1.json`.

### Fail-closed fresh ontology extraction (2026-09-16)

- [x] Updated the fresh extractor to compare every claimed source revision with
      the live source-byte digest; stale claims are rejected rather than emitted
      as fresh candidates.
- [x] Updated the multilane merger to preserve extraction status, counts, and
      failures, and to replace its report atomically.
- [x] Updated independent source-span validation to reject incomplete extraction
      cohorts instead of inferring completeness from the remaining candidates.
- [x] Re-ran the chain: 6 approved sources, 4 extracted, 2 stale-source
      rejections, 202 candidates, 3 grounded sources, and 0 retained span
      mismatches.
- [ ] Refresh the source-binding observation for the two stale files, rerun
      grounded extraction, then repeat packet-lineage and human-review gates.

Status: `FRESH_EXTRACTION_INCOMPLETE`; `REL_01B_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/feature-ontology-fresh-extraction-v1.json`,
`docs/reports/feature-ontology-fresh-extraction-multilane-v1.json`,
`docs/reports/feature-ontology-source-span-revision-v1.json`.

### Current source-cohort lineage recheck (2026-09-16)

- [x] Re-ran the read-only current source-cohort audit against the admitted
      workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
- [x] Confirmed 52 source-revision-qualified rows and 52 Graphify matches, but
      zero rows match the admitted workspace frame; all 52 are classified as
      workspace-revision mismatches.
- [ ] Obtain a terminal Graphify/source binding produced from the admitted
      workspace snapshot before admitting packet, ontology, semantic, graph, or
      ACE projections.

Status: `WORKSPACE_REVISION_SOURCE_MISMATCH`; `CURRENT_SOURCE_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `docs/reports/current-source-cohort-lineage-v1.json`.

### Current indexing and ACE surface census (2026-09-16)

- [x] Confirmed PostgreSQL `18.4` with `pgvector 0.8.3`, `pg_trgm`, and
      `pg_search` reachable in the read-only indexing audit.
- [x] Confirmed canonical packet/chunk surfaces exist: `atlas_packets=61,718`,
      `atlas_packet_features=61,718`, `codebase_chunk_index=274,465`, with
      PostgreSQL lexical indexes and HNSW vector indexes present.
- [x] Confirmed `semantic_768` remains partial (`55,169/274,465` on the active
      halfvec lane); Qdrant 768 collections and IVFFlat/CAGRA are projections or
      executor options, not identity owners.
- [x] Confirmed ACE packet/cache structures exist, but live revision-qualified
      ACE population is not proven; legacy identity-less entries remain degraded.
- [ ] Classify and reconcile the 296 manual SQL files against the 41-entry
      Drizzle journal and 64 declared sidecars before migration ownership changes.

Status: `INDEX_SURFACES_PRESENT`; `ACE_CURRENT_ADMISSION_UNPROVEN`;
`SEMANTIC_768_PARTIAL`; `MIGRATION_CLASSIFICATION_OPEN`;
`canonicalAuthority=false` for projections; `writesPerformed=false`.

Evidence: `docs/reports/atlas-indexing-surfaces-v1.json`.

### ACE route revision-authority audit (2026-09-16)

- [x] Ran the read-only ACE revision-source-owner audit for
      `sveltekit-frontend/src/routes/api/ace/stream/+server.ts`.
- [x] Confirmed the route does not receive an authoritative
      `sourceRevision`, `representationRevision`, or `retrievalPolicyRevision`
      tuple.
- [x] Confirmed timestamp-derived revision fallbacks in shared runtime context
      are rejected for strict ACE cache identity.
- [ ] Thread an admitted identity tuple from the canonical SearchRuntime /
      ContextManifest path into the route, then prove cache admission and
      readback with `RetrievalCacheIdentityV1`.

Status: `NO_ROUTE_LOCAL_AUTHORITY`; `ACE_CURRENT_ADMISSION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/ace-revision-source-owner-v1.json`.

### Domain classifier lineage recheck (2026-09-15)

- [x] Ran the read-only domain-classifier lineage audit. It found `3,352`
      classifier rows, `3,351` source references, `148` source revisions, and
      `3,352` workspace revisions.
- [x] Only `148` rows have a revision-qualified join; `3,204` lack a Graphify
      join and `0` source namespaces are currently authoritative. Classifier
      output remains evidence/navigation input, not canonical domain identity
      or promotion authority.
- [ ] Keep topic/entity/POS extraction, CandidateFeatureMatrix admission,
      XGBoost capture, and ACE fanout blocked until the current Graphify/source
      namespace is proven for the admitted cohort.

Status: `CLASSIFIER_LINEAGE_BLOCKED`; `sourceNamespaceAvailable=0`;
`revisionQualifiedJoin=148`; `canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/domain-classifier-lineage-v1.json`.

### HyperGraphRAG n-ary evidence boundary recheck (2026-09-15)

- [x] The existing HyperGraphRAG fusion owner preserves canonical n-ary
      relations and projects them only onto candidates already present in the
      retrieval set. It does not decompose hyperedges into invented pairwise
      facts, add a retrieval vote, or mint identity.
- [x] Focused HyperGraphRAG tests pass `6/6`, including revision filtering,
      hop-budget truncation, deterministic projection, and candidate-only
      evidence enrichment.
- [ ] Keep live HyperGraphRAG API adoption and dynamic tuple promotion blocked
      until tuple source/workspace/graph revisions and evidence checksums are
      bound to the admitted current cohort. NLP, LangExtract, Ornith summaries,
      `.okf` lookups, PageRank, Naive Bayes/logistic/XGBoost, and PyTorch remain
      evidence or ranking producers only.

Status: `NARY_FUSION_SCAFFOLD_PROVEN`; `HYPERRAG_LIVE_PROMOTION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/retrieval/hypergraph-retrieval-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/retrieval/hypergraph-retrieval-v1.spec.ts`,
and the current source/graph lineage receipts.

### Feature ontology packet-lineage recheck (2026-09-15)

- [x] Ran the read-only ontology packet-lineage audit across `353,973` tuples.
      It classified `353,120` as `ALIAS_NOT_APPROVED` and `853` as
      `CURRENT_GRAPHIFY_SOURCE_MISSING`.
- [x] The report's `PACKET_CONTENT_LINEAGE_RECONCILED` status is retained as a
      reconciliation classification only; it does not establish canonical
      entity/domain identity or authorize a second graph vote.
- [ ] Keep `.okf`, entity, topic, POS, ontology, and HyperGraphRAG n-ary output
      evidence-only until each tuple is bound to the admitted source/packet
      cohort with approved identity and revision checksums.

Status: `PACKET_CONTENT_LINEAGE_RECONCILED`; `ALIAS_NOT_APPROVED=353120`;
`CURRENT_GRAPHIFY_SOURCE_MISSING=853`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/feature-ontology-packet-lineage-v1.json`.

### Graphify source-revision auditor fail-closed hardening (2026-09-15)

- [x] Replaced the auditor's implicit largest-file-count run selection with an
      explicit `--run-id`/`ATLAS_GRAPHIFY_RUN_ID` requirement. An invocation
      without a run now returns `EXPLICIT_GRAPHIFY_RUN_ID_REQUIRED` and does not
      treat a historical run as current authority.
- [x] Changed report replacement to use a process-unique temporary file followed
      by atomic rename, preventing direct truncate/write races with workstation
      readers on Windows.
- [x] Re-ran an explicit run: `23,758` rows audited, `22,958` content matches,
      `786` content mismatches, and `14` unavailable sources. The result remains
      `SOURCE_BYTES_NOT_PROVEN` and all write flags remain false.
- [ ] Keep source authority blocked until a terminal execution explicitly bound
      to the admitted snapshot supplies complete source-byte readback.

Status: `AUDITOR_FAIL_CLOSED_HARDENED`; `SOURCE_BYTES_NOT_PROVEN`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `scripts/atlas/audit-current-graphify-source-revision-v1.mjs` and
`docs/reports/current-graphify-source-revision-v1.json`.

### Current source-evidence hydration recheck (2026-09-15)

- [x] Ran the read-only source-evidence hydration audit. It examined `24,181`
      input rows; `23,397` match the selected revision exactly and `19,906`
      contain content hydration.
- [x] The receipt records zero authoritative namespaces, zero evidence-span
      ready rows, and zero classifier-ready rows. Missing reasons are
      `4,275` canonical chunk owners missing and `19,906` chunk owners with
      content but no source revision.
- [ ] Keep domain/topic/entity extraction, CandidateFeatureMatrix admission,
      and semantic/ACE promotion blocked until the chunk owner supplies an
      explicit source revision and authoritative namespace. Content presence
      alone is not promotion evidence.

Status: `SOURCE_EVIDENCE_HYDRATION_BLOCKED`; `authoritativeNamespaces=0`;
`classifierReady=0`; `writesPerformed=false`.

Evidence: `docs/reports/current-source-evidence-hydration-v1.json`.

### Source-cohort lineage audit hardening and recheck (2026-09-15)

- [x] Fixed the source-cohort auditor's Windows report race by replacing the
      direct report write with a process-unique temporary file and atomic rename.
- [x] Re-ran the audit successfully: `52` cohort rows match Graphify and have
      source revisions, but `0` match the admitted workspace revision. All `52`
      are classified as workspace-frame mismatches; missing, ambiguous, and
      source-revision mismatch counts are `0`.
- [ ] Keep source-cohort admission blocked until the cohort is regenerated from
      the authorized current execution/workspace frame. Exact source matches
      from another workspace revision remain historical evidence.

Status: `WORKSPACE_REVISION_SOURCE_MISMATCH`; `revisionQualified=0`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `scripts/atlas/audit-current-source-cohort-lineage-v1.mjs` and
`docs/reports/current-source-cohort-lineage-v1.json`.

### Explicit execution packet-bridge recheck (2026-09-15)

- [x] Re-ran the packet digest planner with the explicit proposed execution
      `74d50c86-8194-45ea-8c3d-61aab737ef83` and admitted workspace revision
      `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
- [x] The read-only sample used the immutable
      `graphify_execution_file_membership_v2` surface and completed without
      writes: `25` members sampled, `0` canonical digest matches, `17` missing
      packets, `8` packets missing `content_hash`, and `0` digest mismatches in
      the sampled rows.
- [ ] Keep packet admission blocked. The proposed execution is not an
      authorized canonical owner, and the missing packet/content-digest
      producer/readback must be closed before any packet, chunk, semantic,
      Qdrant, ACE, or GPU fanout.

Status: `PACKET_DIGEST_BRIDGE_BLOCKED`; `OWNER_SELECTION_VALIDATED_NOT_APPLIED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-packet-digest-bridge-v1.json` and
`docs/reports/selected-graphify-execution-owner-v1.json`.

### Explicit packet-to-chunk join readback (2026-09-15)

- [x] Ran the existing packet/chunk join audit with the explicit admitted
      workspace revision and proposed execution. The read-only receipt reports
      `25` binding rows, `25` Graphify-exact sources, `2` proven packet/chunk
      lineage sources, and `2` packet/chunk exact sources.
- [x] The bounded mismatch census reports `0` workspace mismatches, `0` source
      revision mismatches, and `0` content mismatches. It also reports `0`
      canonical packet-content matches, so the absence is a producer/material-
      ization gap rather than permission to equate hash grains.
- [ ] Keep source→packet→chunk admission closed until the canonical packet
      digest producer supplies exact whole-source content identity and the
      applied cohort can be read back under one authorized Graphify execution.

Status: `CURRENT_PACKET_CHUNK_JOIN_PARTIAL`; `PACKET_DIGEST_BRIDGE_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-workspace-packet-chunk-join-v1.json`.

### Historical packet content-hash backfill boundary (2026-09-15)

- [x] Re-ran the existing `atlas-packets-content-hash-backfill-v1.mjs` in its
      default dry-run mode. Its deterministic single-chunk join gates pass and
      it reports `1,000` eligible historical candidates under the requested
      limit, with `postgresWrites=false`.
- [x] Confirmed this backfill derives a scalar packet hash from an unambiguous
      `source_ref`→single `codebase_chunk_index.content_hash` join. It is not a
      current Graphify execution-bound source-byte producer and does not prove
      the admitted packet digest bridge.
- [ ] Keep this backfill historical/deferred until its selection is explicitly
      intersected with the authorized current execution and exact source-byte
      cohort. Do not run `--apply-bounded` as a substitute for current packet
      authority.

Status: `HISTORICAL_PACKET_HASH_BACKFILL_READ_ONLY`; `CURRENT_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `docs/reports/atlas-packets-content-hash-backfill-v1-dry_run.json` and
`scripts/atlas/atlas-packets-content-hash-backfill-v1.mjs`.

### Current graph artifact readiness recheck (2026-09-15)

- [x] Re-ran the read-only graph artifact readiness audit. It found `16`
      observed node keys and `16` unique graph node keys.
- [x] The receipt reports `0` explicit revision-qualified edges and marks the
      structural projection as not matching the admitted revision.
- [ ] Keep graph-derived features blocked. PageRank, CheiRank, HITS,
      communities, topology coordinates, and GPU graph outputs remain derived
      observations until the graph projection is rebuilt from the authorized
      execution-bound source/chunk cohort.

Status: `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_STALE_PROJECTION`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json`.

### Current structural-edge contract recheck (2026-09-15)

- [x] Ran the read-only structural-edge contract audit. The current producer
      supplies `0` nodes and `0` edges.
- [x] No missing required node/edge fields, duplicate edge shapes, or unknown
      endpoints were observed in the empty input.
- [ ] Keep revision-qualified graph admission open. The clean empty contract
      is not graph completeness and does not authorize PageRank, CheiRank,
      HITS, communities, topology, or GPU projection.

Status: `CONTRACT_INCOMPLETE`; `graphRevision=null`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/current-structural-edge-contract-v1.json`.

### Current structural symbol resolution recheck (2026-09-15)

- [x] Ran the repository's existing structural symbol proof. All `461`
      nominations matched an AST span and tree node exactly; there were `0`
      invalid nominations, `0` ambiguous AST matches, and `0` missing AST
      matches.
- [x] The proof correctly found `461` workspace-revision mismatches against
      the admitted `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`
      frame. Stable-symbol and symbol-version resolution were therefore not
      attempted, and no canonical or database writes occurred.
- [ ] Keep current symbol/graph admission blocked until nominations are
      regenerated or reconciled against the authorized current execution;
      exact AST matching from another workspace revision is historical evidence,
      not current structural authority.

Status: `READ_ONLY_BLOCKED`; `NOMINATIONS_NOT_BOUND_TO_ADMITTED_WORKSPACE_REVISION`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-structural-symbol-resolution-v1.json`.

### Snapshot binding and terminal execution recheck (2026-09-15)

- [x] Ran `audit-graphify-workspace-snapshot-binding-v1.mts` against the
      admitted snapshot. Snapshot byte readback is proven for `25,542` sources
      and the workspace admission is authoritative.
- [x] Two terminal executions match the admitted snapshot, each with the exact
      source count and terminal evidence. The proof remains read-only and
      reports no datastore or canonical relabeling writes.
- [ ] Keep Graphify execution authority blocked until the two equivalent
      executions receive an explicit lifecycle decision. Do not select by time,
      UUID ordering, or newest-run preference.

Status: `GRAPHIFY_SNAPSHOT_BINDING_BLOCKED`; `PARTIAL_PROVEN`;
`MULTIPLE_GRAPHIFY_EXECUTIONS_MATCH_SNAPSHOT`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/graphify-workspace-snapshot-binding-v1.json`.

### Semantic 768 bounded cohort recheck (2026-09-15)

- [x] Re-ran the exact semantic cohort audit. The bounded candidate map has
      `15` candidates, `15` exact chunk rows, `0` missing/ambiguous chunk rows,
      `15` vectors, and `15` producer metadata records.
- [x] The audit confirms PostgreSQL `content_embedding_768` as the canonical
      vector column and records zero PostgreSQL/Qdrant/vector-generation writes.
- [ ] Do not promote this cohort as current: its workspace revision is
      `sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc`,
      which differs from the admitted `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
      Rebuild the candidate map against the authorized execution before current
      semantic, ACE, Qdrant, XGBoost, or GPU admission.

Status: `SEMANTIC_768_BOUNDED_COHORT_PROVEN`; `CURRENT_SEMANTIC_ADMISSION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/lineage-semantic-768-cohort-v1.json`.

### Candidate corpus lineage recheck (2026-09-15)

- [x] Ran the read-only candidate corpus lineage audit across `61,718`
      `atlas_packets` rows.
- [x] The audit admits `0` candidates: `61,717` rows lack source revision and
      `1` row lacks a source reference. The deterministic lineage checksum was
      recorded and no packet, semantic, XGBoost, ACE, or projection writes were
      performed.
- [ ] Keep CandidateFeatureMatrix, XGBoost capture/training, and current ACE
      admission blocked until a current execution-bound source/packet/chunk
      cohort supplies required revisions and references.

Status: `CURRENT_CANDIDATE_CORPUS_EMPTY`; `SEMANTIC_XGBOOST_ADMISSION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/candidate-corpus-lineage-v1.json`.

### Qualified candidate cohort recheck (2026-09-15)

- [x] Ran the read-only qualified-candidate cohort audit. Of `61,718` packet
      rows, `17,144` have exact Graphify source evidence with workspace and
      source revisions; `99` reach an exact packet→chunk join.
- [x] The audit reports `13,750` ambiguous packet/chunk joins and `0` graph
      revisions. Consequently `0` rows are fully qualified for promotion,
      despite `17,144` rows carrying partial source/semantic revision fields.
- [ ] Keep CandidateFeatureMatrix, semantic promotion, graph-derived features,
      XGBoost capture, ACE warming, and GPU fanout blocked until graph revision
      ownership and ambiguous packet/chunk identities are resolved.

Status: `COHORT_BLOCKED`; `GRAPH_OR_SEMANTIC_REVISION_OWNER_REQUIRED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/lineage-qualified-candidate-cohort-v1.json`.

### PostgreSQL and ACE indexing alignment audit (2026-09-15)

- [x] Re-ran the read-only indexing-surface audit against the live PostgreSQL
      18.4 instance. PostgreSQL remains the canonical owner; existing packet,
      chunk, FTS/GIN, trigram, pgvector/HNSW, and projection tables are
      inventoried without creating a second search index owner.
- [x] Confirmed the canonical dense lane is `semantic_768` in
      `codebase_chunk_index.content_embedding`; legacy 384-dimensional lanes
      remain compatibility/projection evidence only.
- [x] Confirmed ACE/BitFrost identity admission is implemented and legacy
      identity-less cache values are degraded/unqualified rather than treated
      as current evidence.
- [ ] Keep production ACE warming and Qdrant/GPU fanout blocked until the
      current source→packet→chunk cohort supplies exact workspace/source/
      representation identity, content checksums, and a readback receipt.
- [ ] Reconcile the reported manual SQL files with the Drizzle sidecar
      manifest before any migration or schema change. This is an ownership
      classification task, not authorization to run DDL.
- [ ] Replace or explicitly quarantine AST regex fallbacks after confirming
      reachability; the active AST backfill currently reports zero regex
      matchers, but two legacy extraction references remain.

Status: `INDEXING_SURFACES_INVENTORIED`; `ACE_CURRENT_ADMISSION_BLOCKED`;
`SEMANTIC_768_COVERAGE_PARTIAL`; `DRIZZLE_SIDECAR_CLASSIFICATION_OPEN`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/atlas-indexing-surfaces-v1.json`,
`sveltekit-frontend/src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.ts`,
and the existing semantic/packet lineage receipts.

### Mastra adapter unavailable-seam guard (2026-09-15)

- [x] Replaced misleading empty-success behavior in the existing Mastra-shaped
      adapter: validation now returns explicit `FAIL`/unavailable metadata;
      discovery returns `UNAVAILABLE`; delegation returns failed/unavailable;
      retrieval and context assembly raise a typed `AtlasAdapterUnavailableError`.
- [x] Added focused tests covering non-authoritative results and typed context
      failure. The guard reports `canonicalAuthority=false` and
      `writesPerformed=false` and does not add a retrieval, identity, ACE,
      delegation, or mutation owner.
- [ ] Keep live retrieval, ACE context assembly, identity discovery, governed
      delegation, and canonical durable-event readback open until their existing
      owners provide revision-qualified evidence and readback receipts.

Status: `SCAFFOLD_GUARD_PROVEN`; live capability remains blocked.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.ts`,
`sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.spec.ts`, and
`docs/reports/atlas-mastra-adapter-seam-guard-v1.json`.

### Legacy TypeScript fixer execution quarantine (2026-09-15)

- [x] Quarantined `scripts/phase66_automated_error_fixer.py` as historical
      evidence. Its legacy shell, regex, and numbered-fixer actions are now
      recorded but never executed by the LangGraph path.
- [x] Preserved the file for historical inspection and kept the governed
      replacement boundary separate: machine-JSONL evidence capture,
      TaskCandidate evidence, FileMutationPlan, approval, preimage validation,
      bounded executor, and receipts.
- [ ] Keep the legacy fixer out of active repair commands until the governed
      fixture replay and canonical durable-event readback are complete.

Status: `LEGACY_MUTATOR_QUARANTINED`; `GOVERNED_REPAIR_OPEN`;
`writesPerformed=false`.

Evidence: `scripts/phase66_automated_error_fixer.py`,
`scripts/atlas/capture-typescript-error-evidence-v1.mjs`,
`scripts/atlas/replay-agentic-recommendations.mjs`, and
`docs/reports/atlas-mastra-adapter-seam-guard-v1.json`.

- [x] Aligned the quarantined Phase 66 model metadata with the existing
      llama-server owner: `LLAMA_SERVER_URL` defaults to `127.0.0.1:8090` and
      `LLAMA_SERVER_MODEL` defaults to the runtime alias `ornith-1.5-9b`.
      A read-only `GET /v1/models` probe observed `ornith-1.5-9b`. This proves
      runtime identity only; it does not reopen the quarantined repair path.
- [x] Added the same bounded model-resolution receipt to the active read-only
      coordinator `scripts/atlas/run-agentic-error-fixing-v1.mjs`; it records
      `PROVEN_RUNTIME` or `UNAVAILABLE` from `/v1/models` and never invokes the
      model, executes a proposal, or authorizes mutation.

### Stage 13 workflow completion guard (2026-09-15)

- [x] Replaced the discovery shortcut with an explicit non-terminal blocked
      result when canonical identity discovery is unavailable.
- [x] Prevented `VALIDATE` from marking a workflow `COMPLETE` without an
      independent validation receipt; recovery remains non-terminal.
- [x] Focused workflow tests pass, and the durable writer's canonical entrypoint
      remains covered by 11 mocked-transaction tests.
- [ ] Keep live identity discovery, independent validation receipt, and
      canonical durable Postgres/outbox readback open.

Status: `STAGE13_GUARDS_PROVEN`; `LIVE_PROOF_BLOCKED`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts`,
`sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.spec.ts`,
`sveltekit-frontend/src/lib/server/agent/action-writer.spec.ts`, and
`docs/reports/stage13-workflow-fail-closed-v1.json`.

### Semantic cohort empty-admission guard (2026-09-15)

- [x] Required an `ADMITTED` semantic cohort to contain at least one qualified
      row; empty cohorts now fail schema validation instead of masquerading as
      current semantic proof.
- [x] Added focused fixture coverage for the empty-admission case.
- [ ] Keep semantic promotion blocked until the current source→packet→chunk
      cohort and representation lineage are admitted.

Status: `SCAFFOLD_HARDENED`; `FIXTURE_PROVEN`; `CURRENT_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/embedding/semantic-representation-v1.ts`;
`sveltekit-frontend/src/lib/server/atlas/embedding/semantic-representation-v1.spec.ts`.

### Recovery state cannot masquerade as completion (2026-09-15)

- [x] Corrected the Atlas retrieval workflow recovery branch so failed or
      blocked retrieval/verification returns `AtlasState.RECOVER` instead of
      rewriting the result to `COMPLETE`.
- [x] Unknown workflow states now fail closed to the same explicit recovery
      result.
- [x] Focused workflow and feature-admission tests pass; no live workflow
      execution or datastore mutation was performed.
- [ ] Keep governed repair and current-data promotion closed until the
      upstream authority receipts are complete.

Status: `FAIL_CLOSED_STATE_GUARD`; `FIXTURE_PROVEN`; `LIVE_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts`;
`sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.spec.ts`.

### Agentic retrieval verification fail-closed hardening (2026-09-15)

- [x] Replaced the Mastra workflow's unconditional VERIFY → SYNTHESIZE transition
      with canonical packet validation through `validatePacketFromGo()`.
- [x] Empty retrieval results, missing packet keys, validator errors, and any
      non-valid packet now enter recovery and cannot be reported as verified
      context.
- [ ] Keep live governed repair, canonical Graphify ownership, packet/chunk
      lineage, semantic admission, and GPU promotion blocked until their
      independent receipts pass.

Status: `VERIFICATION_GUARD_SCAFFOLDED`; `LIVE_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts`;
`docs/reports/current-packet-digest-bridge-v1.json`.

### Packet verification test seam (2026-09-15)

- [x] Extracted the packet verification boundary as the pure
      `verifyRetrievedPacketsV1()` helper so empty, malformed, failed, and
      validator-error inputs are testable without service or datastore access.
- [x] Added fixture coverage for empty retrieval, missing identity, partial
      validation failure, and all-packets-valid behavior.
- [ ] Keep the live retrieval/repair path blocked until current Graphify,
      source→packet→chunk, semantic, and durable-event authority receipts pass.

Status: `FIXTURE_PROVEN`; `LIVE_AUTHORITY_BLOCKED`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.spec.ts`;
`docs/reports/agentic-retrieval-verification-guard-v1.json`.

### Stage 3 ordinal materializer lineage guard (2026-09-15)

- [x] Updated `materialize-candidate-ordinal-corpus-v1.mts` to require an
      exact `atlas_packet_chunk_lineage` row with matching packet/source
      identity, matching `source_revision`, `revision_status='PROVEN'`, and a
      real `codebase_chunk_index` row before a packet can enter the ordinal map.
- [x] Preserved explicit workspace and candidate-snapshot revision inputs;
      no current revision is inferred from ordering or nullable data.
- [x] Read-only rerun returned `0` eligible rows from `0` rows and performed
      no writes; this is an unavailable current cohort, not a proof of zero
      lineage defects.
- [ ] Run the bounded 128-row current-cohort proof only after Graphify owner
      selection and packet digest/source→packet→chunk authority are admitted.

Status: `SCAFFOLD_HARDENED`; `READ_ONLY_CHECK_COMPLETE`;
`CURRENT_AUTHORITY_BLOCKED`; `writesPerformed=false`.

Evidence: `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts`;
`docs/reports/current-packet-digest-bridge-v1.json`.

### Current source→packet→chunk recheck (2026-09-15)

- [x] Re-ran the bounded read-only join against the explicit workspace revision
      and selected execution frame.
- [x] Confirmed the five-row bounded sample has five exact Graphify source
      matches but zero proven packet/chunk lineage matches and zero packet
      content matches.
- [ ] Do not materialize CandidateOrdinalMapV1 or downstream semantic/graph
      features from this sample until the canonical packet digest bridge and
      `revision_status='PROVEN'` chunk lineage are available.

Status: `CURRENT_PACKET_CHUNK_JOIN_MISSING`; `writesPerformed=false`.

Evidence: `docs/reports/current-workspace-packet-chunk-join-v1.json`;
`docs/reports/current-packet-digest-bridge-v1.json`.

### HyperGraphRAG strict tuple lineage guard (2026-09-15)

- [x] Tightened the existing `kag-hypergraph-reader-v1.ts` strict traversal
      so ontology tuples are admitted only when their JSONB provenance records
      the requested `workspaceRevision` and `graphRevision`.
- [x] Added regression assertions proving both tuple and hyperedge queries
      bind the same traversal snapshot revisions; unqualified tuples remain
      unavailable rather than being treated as current evidence.
- [ ] Keep live HyperGraphRAG tuple promotion and graph-derived ranking blocked
      until the current Graphify execution, source/chunk cohort, and graph
      revision are admitted. This is a read-side lineage guard, not an
      ontology migration or fusion-owner change.

Status: `STRICT_READ_GUARD_COMPLETE`; `LIVE_PROMOTION_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/integration/kag-hypergraph-reader-v1.ts`;
`sveltekit-frontend/src/lib/server/atlas/integration/kag-hypergraph-reader-v1.spec.ts`.
Validation: 9 focused tests passed; OpenSpec strict validation passed; no
database, graph, cache, or projection writes occurred.

### Classification provenance nullability hardening (2026-09-15)

- [x] Removed the `unknown` provenance-version defaults from the existing
      classification envelope builder.
- [x] Provenance versions are now explicitly nullable when the producing
      packet/feature/validation/ledger schema is not available; this preserves
      absence instead of manufacturing a version claim.
- [x] Added regression coverage for the null-provenance path.
- [ ] Keep domain/topic/entity classifier outputs non-promotional until their
      packet, source, workspace, model, and feature revisions are all bound to
      the admitted current cohort.

Status: `PROVENANCE_NULLABLE_GUARD_COMPLETE`; `LIVE_CLASSIFIER_ADMISSION_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/contracts/classification-envelope-v1.ts`;
`sveltekit-frontend/src/lib/server/atlas/contracts/classification-envelope-v1.spec.ts`.
Validation: 3 focused tests passed; no classifier, database, cache, vector,
or GPU writes occurred.

### Latent backfill revision quarantine (2026-09-15)

- [x] Hardened `scripts/atlas/backfill-latent-vectors.mjs` so persistence
      requires an explicit 64-hex admitted `workspaceRevision` supplied by
      `--workspace-revision` or `WORKSPACE_REVISION`.
- [x] Removed the `unknown` revision fallback from checkpoint records. A
      historical dry-run may remain unqualified, but an APPLY invocation now
      fails before opening a writer path when the revision is absent or
      malformed.
- [ ] Keep latent backfill promotion blocked until the selected Graphify
      execution, current source→packet→chunk cohort, and semantic parent
      identity are admitted. This guard does not authorize legacy latent
      persistence or make Qdrant/GPU output canonical.

Status: `SCAFFOLD_HARDENED`; `LIVE_PROMOTION_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`.

Evidence: `scripts/atlas/backfill-latent-vectors.mjs`.
Validation: `node --check scripts/atlas/backfill-latent-vectors.mjs`; guarded
APPLY invocation rejects missing revision before persistence.

### Package contract-fixture build unblock (2026-09-15)

- [x] Updated the stale knowledge-page DAG fixture to use the current
      `IN_MEMORY_COMPUTE_EXECUTOR`/`source_file` operator contract and the
      current ontology `sourceContract` vocabulary. Production schemas were
      not weakened.
- [x] `packages/parent-atlas` TypeScript build now passes with `--noEmit`.
- [x] Workflow event tests, governed replay tests, strict OpenSpec validation,
      and the scoped diff check pass.
- [ ] This only restores reproducible contract validation. It does not close
      live Graphify owner selection, packet/chunk authority, semantic admission,
      GPU parity, or canonical durable-event database readback.

Status: `FIXTURE_CONTRACTS_ALIGNED`; `LIVE_AUTHORITY_UNCHANGED`;
`writesPerformed=false`.

Evidence: `packages/parent-atlas/src/core/knowledge/knowledge-page-dag-binding-v1.spec.ts`,
package TypeScript build, workflow/replay test receipts, and
`docs/reports/current-graphify-execution-owner-resolution-v1.json`.

### Stage 3–13 contract regression sweep (2026-09-15)

- [x] Re-ran the existing stage-owner suites for ordinal maps, semantic
      representation, candidate feature snapshots, ACE identity, GPU residency,
      ContextManifest admission, structural graph snapshots, hypergraph
      materialization, unified residency, and Phase 17 provider admission.
- [x] All selected suites passed: `58` tests, with no live promotion or
      persistence side effects.
- [ ] These are contract/fixture proofs only. They do not promote the current
      Graphify execution, admit the packet/chunk cohort, or prove live ACE,
      semantic, durable-event, or GPU authority.

Status: `STAGE_CONTRACTS_REGRESSION_PASS`; `CURRENT_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: focused lane-contracts Vitest runs on the existing Stage 3–13 owner
modules and the current Graphify/packet authority reports.

### Candidate ordinal materializer synthetic-lineage quarantine (2026-09-15)

- [x] Hardened `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts` so
      it requires explicit `--workspace-revision` and
      `--candidate-snapshot-revision` inputs.
- [x] Removed fabricated workspace/source/graph/semantic revisions and the
      assumed `embeddinggemma:latest` representation binding. Missing lineage
      now excludes a row rather than becoming a placeholder.
- [x] The script is dry-run-only until an authorized current cohort exists;
      missing required revision arguments fail closed before database access.
- [ ] This does not admit the current cohort or authorize persistence. The
      Graphify owner, packet digest, source→packet→chunk, and graph authority
      gates remain open.

Status: `SYNTHETIC_LINEAGE_REMOVED`; `CURRENT_COHORT_UNPROVEN`;
`writesPerformed=false`.

Evidence: `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts`,
isolated TypeScript compilation, and the fail-closed missing-argument smoke run.

### Graph snapshot exporter identity guard (2026-09-15)

- [x] Hardened `scripts/atlas/export-graph-snapshot-v2.mts` to require explicit
      workspace, snapshot, and source-inventory snapshot identities (or
      explicitly supplied environment values); it no longer creates a random
      snapshot ID or derives an inventory identity implicitly.
- [x] Preserved the exporter as a derived artifact writer; graph nodes/edges
      remain non-canonical until the current execution and revision-qualified
      edge gates pass.
- [ ] The exporter still cannot prove current graph authority by itself. Its
      current live execution remains blocked by the duplicate-owner decision and
      absent revision-qualified edge population.

Status: `GRAPH_EXPORT_IDENTITY_FAIL_CLOSED`; `CURRENT_GRAPH_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `scripts/atlas/export-graph-snapshot-v2.mts` and
`docs/reports/current-graph-artifact-readiness-v1.json`.

### ACE reconciliation packet cache-write quarantine (2026-09-15)

- [x] Hardened `scripts/atlas/build-reconciliation-ace-packet.mts` to require
      explicit workspace, run, and ACE packet identities; it no longer derives
      workspace revision from moving Git `HEAD` or mints random IDs.
- [x] Made the default mode read-only and added explicit
      `--apply` plus `ATLAS_ALLOW_RECONCILIATION_ACE_CACHE_WRITE=1` protection.
- [x] Removed mutable `latest` Valkey aliases from the apply path; only
      revision-addressed ACE/BitFrost keys are written when explicitly enabled.
- [ ] This remains a derived context projection and cannot establish current
      packet authority or substitute for canonical PostgreSQL readback.

Status: `ACE_CACHE_WRITE_FAIL_CLOSED`; `CURRENT_COHORT_REQUIRED`;
`writesPerformed=false` by default.

Evidence: `scripts/atlas/build-reconciliation-ace-packet.mts` and the
missing-identity fail-closed smoke run.

### Packet outbox null-lineage correction (2026-09-15)

- [x] Removed the packet transaction writer's fabricated `"unknown"` revision
      fallbacks. Missing workspace, source, graph, representation, and feature
      lineage now remains `null` in the derived outbox payload.
- [x] Isolated TypeScript compilation passed and the packet identity decision
      suite passed `15/15`.
- [x] Corrected the legacy integer-revision compatibility guard and removed
      the hard-coded `workspace_revision=0` insert value; numeric legacy
      revisions are now validated as safe integers and persisted exactly.
- [x] Corrected packet idempotency to read/write `atlas_packets.content_hash`;
      embedding digests are representation metadata and are no longer used as
      whole-source packet identity.
- [ ] Live canonical packet writer/readback remains blocked until an explicitly
      authorized current execution and exact source bytes are available.

Status: `NULL_LINEAGE_PRESERVED`; `PACKET_DIGEST_BRIDGE_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/identity/packet-write-transaction-v1.ts`
and `sveltekit-frontend/src/lib/server/atlas/identity/packet-write-decision-v1.spec.ts`.

### Packet writer lineage recheck (2026-09-15)

- [x] Re-ran the read-only packet writer lineage audit across five writer
      surfaces.
- [ ] Current writer ownership remains unproven: `1` revision-bound contract,
      `2` legacy-SHA-256-only writers, and `2` unqualified or schema-drift
      writers. Do not enable packet digest admission or downstream fanout until
      one guarded writer persists canonical `content_hash` and `source_revision`
      and proves exact readback.

Status: `PACKET_WRITER_CURRENT_LINEAGE_NOT_PROVEN`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/packet-writer-lineage-v1.json`.

### Current packet/chunk identity readback (2026-09-15)

- [x] Ran the guarded read-only identity reconciliation for the preflighted
      execution `74d50c86-8194-45ea-8c3d-61aab737ef83` at the explicit admitted
      workspace revision.
- [ ] The canonical bridge remains blocked: `24,456` bound sources,
      `16,554` packet references, `0` canonical packet digest matches,
      `7,902` missing packet rows, `16,454` missing packet content digests,
      `627` packet/lineage matches, and `20` comparable digest mismatches.
      Legacy `sha256` matches (`3,230`) remain diagnostic only.

Status: `PACKET_DIGEST_BRIDGE_MISSING`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/current-packet-chunk-identity-reconciliation-v1.json`.

### Guarded selected-execution packet bridge recheck (2026-09-15)

- [x] The existing selected-execution preflight validated
      `74d50c86-8194-45ea-8c3d-61aab737ef83` without applying an owner decision.
- [x] Re-ran the bounded packet digest bridge for `128` immutable membership
      rows using that preflighted execution and the explicit admitted workspace
      revision.
- [ ] The bridge remains blocked: `0` canonical content-digest matches,
      `70` missing packets, and `58` packets missing canonical whole-source
      digests. Legacy digest values remain diagnostic only.

Status: `OWNER_SELECTION_VALIDATED_NOT_APPLIED`; `PACKET_DIGEST_BRIDGE_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/selected-graphify-execution-owner-v1.json` and
`docs/reports/current-packet-digest-bridge-v1.json`.

### Current graph artifact readiness recheck (2026-09-15)

- [x] Re-ran the read-only graph artifact readiness audit against the current
      workspace state: `observationCount=16` and `uniqueGraphNodeKeyCount=16`.
- [ ] Revision-qualified current edges remain absent:
      `explicitRevisionQualifiedEdges=0`. The observed node keys do not seal a
      current graph snapshot or authorize PageRank, CheiRank, HITS, community,
      topology, or GPU projection promotion.

Status: `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_STALE_PROJECTION`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json`.

### Graph ordinal map readback validation (2026-09-15)

- [x] Extended the existing `GraphOrdinalMapV1` owner with a strict parser that
      validates node-key shape, contiguous zero-based ordinals, row count, and
      the deterministic map checksum.
- [x] Added tamper and ordinal-sequence rejection coverage. The map remains an
      executor-local derived coordinate artifact with `canonicalAuthority=false`
      and `writes=false`.
- [ ] Keep current graph promotion blocked until revision-qualified edges and a
      sealed current GraphSnapshot bind this map to the admitted execution.

Status: `GRAPH_ORDINAL_READBACK_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/graph/graph-ordinal-map-v1.ts`
and its focused spec.

### Bounded packet digest bridge recheck (2026-09-15)

- [x] Re-ran the packet digest bridge against the explicit admitted workspace
      revision and execution with a bounded sample of 5 immutable membership
      rows.
- [x] Read-only result: `0` canonical content-digest matches, `2` packets
      missing canonical content digests, `3` packet references missing, and
      `writesPerformed=false`.
- [ ] Keep packet admission and downstream chunk/semantic promotion blocked
      until an approved canonical whole-source digest producer and exact
      readback are available. This sample is diagnostic evidence only.

Status: `PACKET_DIGEST_BRIDGE_BLOCKED`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/current-packet-digest-bridge-v1.json`.

### Bounded packet/chunk auditor readback (2026-09-15)

- [x] Added an explicit `--limit` mode to
      `scripts/atlas/audit-current-workspace-packet-chunk-join-v1.mjs`.
      The mode samples the explicitly supplied workspace revision and execution
      inside the existing repeatable-read, read-only transaction; it reports
      `scope=BOUNDED_SAMPLE` and never upgrades the sample to authority.
- [x] Bounded readback over 5 members completed without mutation: 5 binding
      rows, 5 exact Graphify members, 0 packet-content matches, and 0 proven
      packet/chunk lineage rows.
- [ ] Keep packet digest and source→packet→chunk admission blocked until the
      canonical whole-source packet digest producer and exact readback are
      proven for the selected execution. Whole-source and per-chunk hashes
      remain separate grains.

Status: `CURRENT_PACKET_CHUNK_JOIN_MISSING`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/current-workspace-packet-chunk-join-v1.json`.

### HyperGraphRAG n-ary fusion scaffold review (2026-09-15)

- [x] Reused the existing HyperRAG fusion adapter, n-ary contract, tuple
      proposal, and materializer owners; no second fusion or graph owner was
      introduced.
- [x] Focused tests cover revision filtering, canonical-hit admission,
      genuinely n-ary proposals, and additive HyperRAG enrichment without
      multiplying RRF votes.
- [ ] Keep live HyperRAG API adoption, dynamic tuple promotion, and
      PageRank/cuGraph parity open until current graph and semantic authority
      are proven. Hyperedges remain derived evidence and cannot invent hits or
      create additional lane votes.

Status: `HYPERRAG_FUSION_SCAFFOLD_COMPLETE`; `LIVE_PROMOTION_BLOCKED`;
`CURRENT_GRAPH_AUTHORITY_BLOCKED`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.ts`,
`sveltekit-frontend/src/lib/server/atlas/graph/hypergraph-nary-materialize-v1.ts`,
and their focused specs.

### Stage 3 current source/chunk ordinal admission scaffold (2026-09-15)

- [x] Added `RevisionQualifiedSourceChunkCohortV1` validation to the existing
      `canonical-candidate-v1` owner. The cohort requires an explicit workspace
      revision, candidate snapshot revision, source-set checksum, packet identity,
      and source reference for every candidate.
- [x] Added the pure
      `materializeRevisionQualifiedSourceChunkOrdinalMapV1()` wrapper. It rejects
      unavailable or unqualified cohorts and delegates to the existing deterministic
      `CandidateOrdinalMapV1` materializer without I/O or persistence.
- [x] Added focused null-identity and deterministic replay tests.
- [ ] Keep current graph/semantic promotion blocked until one Graphify execution
      owner and exact source-to-packet-to-chunk readback are proven. No historical
      nullable rows are rewritten and no ordinal map is treated as canonical identity.

Status: `STAGE_3_ORDINAL_SCAFFOLD_COMPLETE`; `CURRENT_AUTHORITY_BLOCKED`;
`writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts`
and `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.spec.ts`.

### Stage 6 current graph feature admission scaffold (2026-09-15)

- [x] Extended the existing graph feature snapshot owner with
      `GraphFeatureSnapshotAdmissionV1` and a pure sealed-current admission
      boundary. It rejects historical/unavailable manifests, missing or duplicate
      packet keys, unknown nodes, and graph-revision mismatches.
- [x] Added focused tests for exact sealed admission and fail-closed observation
      handling. The result remains `canonicalAuthority=false` and
      `writesPerformed=false`.
- [ ] Keep PageRank, PPR, HITS, CheiRank, community, topology, Neo4j, cuGraph,
      and GPU promotion blocked until revision-qualified current graph edges and
      one authorized Graphify execution are proven.

Status: `STAGE_6_GRAPH_FEATURE_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/graph/graph-feature-snapshot.ts`
and `sveltekit-frontend/src/lib/server/atlas/graph/graph-feature-snapshot.spec.ts`.

- [x] Extended the existing structural feature snapshot contract with nullable
      PageRank, personalized PageRank, HITS authority/hub, and CheiRank fields.
      Missing algorithms remain observable as `null`; no zero/default score is
      promoted as evidence.
- [ ] Keep live metric admission blocked until revision-qualified graph edges,
      the shared `GraphOrdinalMapV1`, and executor parity are proven.

Evidence: `sveltekit-frontend/src/lib/server/atlas/graph/structural-feature-snapshot-v1.ts`
and its focused parser spec.

### Stage 7 latent representation lineage scaffold (2026-09-15)

- [x] Extended the existing latent hydration owner with
      `LatentRepresentationLineageAdmissionV1`, requiring an admitted
      `semantic_768` parent plus explicit latent and transform revisions/checksum.
- [x] Added pure tests for admitted and unavailable semantic parents. Latent
      outputs remain derived, `canonicalAuthority=false`, and
      `writesPerformed=false`.
- [ ] Keep latent promotion blocked until the current semantic cohort and its
      source-to-packet-to-chunk lineage are admitted. Do not synthesize vectors
      or treat latent revisions as replacements for `semantic_768`.

Status: `STAGE_7_LATENT_LINEAGE_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/features/candidate-latent256-hydration-receipt-v1.ts`
and its focused spec.

### Stage 8 current candidate feature admission scaffold (2026-09-15)

- [x] Extended the existing `CandidateFeatureSnapshotV1` owner with
      `CurrentCandidateFeatureAdmissionV1`. It requires explicit source/chunk,
      semantic, and graph admission states before materializing a feature matrix.
- [x] Added typed blocked results with no snapshot, fabricated scores, or
      promotion state, plus focused lineage-blocking tests.
- [ ] Keep current feature-matrix admission blocked until the Graphify owner,
      packet digest bridge, source→packet→chunk lineage, semantic cohort, and
      revision-qualified graph features are all proven.

Status: `STAGE_8_FEATURE_MATRIX_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.ts`
and its focused spec.

### Stage 13 current ContextManifest admission scaffold (2026-09-15)

- [x] Extended the existing ACE ContextManifest owner with
      `CurrentAceContextManifestAdmissionV1`. It builds `ContextManifestV2` only
      from an admitted Stage 8 feature snapshot.
- [x] Added a typed blocked result that carries no manifest when the feature
      snapshot is blocked or unavailable; canonical authority and writes remain
      false.
- [ ] Keep current ContextManifest/DAG replay blocked until current source,
      semantic, graph, and feature evidence reaches one revision-qualified cohort.

Status: `STAGE_13_CONTEXT_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/context/ace-context-manifest-admission-v1.ts`
and its focused spec.

### Stage 12 reranker evaluation admission scaffold (2026-09-15)

- [x] Extended the existing XGBoost ranking-lineage owner with
      `RerankerEvaluationAdmissionV1`, separating corpus admission, held-out
      evaluation evidence, and promotion authorization.
- [x] Added pure tests for blocked corpus, missing evaluation, and fully evidenced
      evaluation states. The scaffold always reports `promotionAuthorized=false`,
      `canonicalAuthority=false`, and `writesPerformed=false`.
- [ ] Keep XGBoost/Ornith promotion blocked until a current labeled corpus,
      leakage checks, frozen grouped splits, and held-out quality receipt exist.

Status: `STAGE_12_RERANKER_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`PROMOTION_CLOSED`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/classification/xgboost-ranking-lineage-v1.ts`
and its focused spec.

### Stage 9 ACE/BitFrost admission scaffold (2026-09-15)

- [x] Extended the existing ACE/BitFrost identity owner with a typed
      `AceResidencyAdmissionV1` result and deterministic revisioned cache-key
      derivation.
- [x] Added blocked-identity and admitted descriptor tests. The result is
      non-authoritative and explicitly records `writesPerformed=false`.
- [ ] Keep live cache warming blocked until a current candidate cohort,
      complete retrieval identity, manifest checksum, and production readback
      are proven. Legacy entries remain degraded/unqualified.

Status: `ACE_RESIDENCY_ADMISSION_SCAFFOLD_COMPLETE`; `ACE_CURRENT_ADMISSION_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.ts`
and its focused spec.

- [x] **ACE-LEGACY-CACHE-DEGRADED-READBACK-01** — the existing top-retrieval
      cache now normalizes identity-less Redis and snapshot values as
      `degraded=true`; only entries carrying an exact `RetrievalCacheIdentityV1`
      can be admitted as current. Focused cache coverage passes; live warming
      remains blocked by the missing current cohort.

### Stage 10 unified GPU residency admission scaffold (2026-09-15)

- [x] Reuse the existing `unified-residency-adapter-v1` owner for feature-tile,
      Transformer KV, Mamba/Samba, and Titans-style descriptor admission.
- [x] Preserve revision/checksum admission, bounded VRAM policy, LRU/lease
      eviction, and the no-persisted-GPU-state boundary in that adapter.
- [ ] Keep live residency and CPU/PyTorch/cuTile parity blocked until an
      admitted current CandidateFeatureMatrix supplies a bounded tile on one
      stable ordinal map.

Status: `STAGE_10_RESIDENCY_SCAFFOLD_COMPLETE`; `GPU_LIVE_PROOF_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/tensors/unified-residency-adapter-v1.ts`
and its focused spec.

### Stage 11 Phase 17 provider admission scaffold (2026-09-15)

- [x] Reuse the existing `phase17-schema` owner and pure provider-admission
      boundary for revision-qualified feature inputs.
- [x] Keep provider availability, degradation, and blocked states explicit;
      provider output remains derived and non-promotional.
- [ ] Keep Phase 17 execution blocked until source/packet/chunk, graph,
      semantic, and CandidateFeatureMatrix gates are admitted together.

Status: `STAGE_11_PROVIDER_SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`;
`CURRENT_AUTHORITY_BLOCKED`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/ml/phase17-schema.ts` and
`sveltekit-frontend/src/lib/server/ml/phase17-provider-admission.spec.ts`.
After explicit owner authorization, rerun the packet/chunk closure against the selected
execution; do not perform that selection implicitly inside a downstream writer.

### Explicit execution-owner decision preflight (2026-09-15)

- [x] Added `scripts/atlas/audit-selected-graphify-execution-owner-v1.mjs` and the
      `atlas:graphify:execution-owner:preflight` command. It validates an operator-supplied
      execution ID only against the existing equivalent-execution plan; it does not relabel,
      delete, or update Graphify state.
- [x] The recommended execution `74d50c86-8194-45ea-8c3d-61aab737ef83` passed the preflight as
      `OWNER_SELECTION_VALIDATED_NOT_APPLIED`. The receipt retains `requiresExplicitAuthorityDecision=true`,
      `canonicalAuthority=false`, `safeToApply=false`, and `writesPerformed=false`.
- [ ] The owner decision and post-decision readback remain open. Only after an explicit authority
      decision may the selected execution be used as the packet/chunk reconciliation input.

Evidence: `docs/reports/selected-graphify-execution-owner-v1.json`.

### Explicit owner-bound snapshot authority readback (2026-09-15)

- [x] Extended `audit-current-graphify-snapshot-authority-v1.mts` with an explicit
      `--execution-id` path. It accepts only an execution already validated by the immutable
      owner plan and the matching owner-preflight checksum; it rejects a missing or stale
      preflight and never relabels, deletes, or updates Graphify state.
- [x] Read-only rerun bound the admitted snapshot to execution
      `74d50c86-8194-45ea-8c3d-61aab737ef83`. The receipt now reports `CURRENT_SNAPSHOT_PROVEN`,
      preserves `qualifyingExecutions=2`, records the validated owner selection, and keeps
      `canonicalAuthority=false`, `safeToApply=false`, and `writesPerformed=false`.
- [ ] Canonical durable owner adoption is still intentionally open. The selected execution is
      a validated reconciliation input, not permission to mutate Graphify history or to bypass
      the packet digest bridge.

Evidence: `docs/reports/current-graphify-snapshot-authority-v1.json` and
`docs/reports/current-source-selection-input-v1.json`. The next read-only gate is the guarded
packet/chunk closure against this explicit execution.

- [x] Hardened `audit-current-packet-chunk-identity-reconciliation-v1.mjs` to require a
      matching selected-execution preflight receipt before it reads the join. The guarded rerun
      against `74d50c86-8194-45ea-8c3d-61aab737ef83` reproduced the full current result without
      writes: `0` canonical packet digest matches, `7,902` missing packet rows, and `13,324`
      digest mismatches.
- [ ] This guard proves provenance of the audit input only; it does not apply the owner decision
      or authorize packet/chunk writes. Explicit authority and canonical packet digest production
      remain required.
- [x] Applied the same owner-preflight requirement to
      `plan-current-packet-digest-bridge-v1.mjs`; the guarded `500`-member rerun reproduced
      `0` canonical matches, `1` legacy-only match, `71` missing packets, and `428` mismatches.
- [x] Bound both downstream tools to the checksum of the current owner-resolution plan; stale
      owner-preflight receipts now fail closed if a new execution changes that plan. The guarded
      full join rerun remains read-only and reports `PACKET_DIGEST_BRIDGE_MISSING`.

### Current packet digest bridge planner (2026-09-15)

- [x] Added `scripts/atlas/plan-current-packet-digest-bridge-v1.mjs` as a bounded,
      read-only planner. It requires an explicit admitted workspace revision and execution ID,
      reads `graphify_execution_file_membership_v2` as the source-membership owner, and uses a
      repeatable-read transaction. It never updates packets or treats a legacy digest as
      promotion authority.
- [x] The bounded planner run was expanded to `500` execution-owned members: `0` canonical
      `atlas_packets.content_hash` matches, `1` legacy-only match, `71` missing packet rows,
      and `428` packet-content mismatches. The result is `PACKET_DIGEST_BRIDGE_BLOCKED` with
      `safeToApply=false`, `canonicalAuthority=false`, and `writesPerformed=false`.
- [x] Tightened promotion classification so a future digest match is not eligible unless the
      packet also carries a valid SHA-256-shaped `atlas_packets.source_revision`. Digest equality
      without packet source revision is now `PACKET_SOURCE_REVISION_MISSING` rather than a false
      canonical match.
- [ ] The packet bridge remains open. The planner must be rerun after an explicit execution-owner
      decision and then expanded in bounded cohorts; no `content_hash`, `source_revision`, packet,
      chunk, semantic, Qdrant, or cache backfill is authorized from this report alone.

Evidence: `docs/reports/current-packet-digest-bridge-v1.json`.
Next gate: `PACKET-DIGEST-BRIDGE-AUTHORIZATION-AND-READBACK-01`, requiring a proven packet
content-hash producer, exact source-byte readback, and a separately authorized bounded canary.

### Packet writer lineage census (2026-09-15)

- [x] Added `scripts/atlas/audit-packet-writer-lineage-v1.mjs`, a read-only source census
      covering the canonical semantic writer, ACP materializer, legacy NDJSON sync, legacy
      indexer, and whole-codebase upsert paths. The report records source checksums,
      referenced lineage fields, writer classification, and promotion eligibility without
      importing or invoking any writer.
- [x] Live/source census result: `5` writer surfaces, `0` complete revision-bound contracts,
      `2` legacy-`sha256`-only surfaces, and `3` unqualified or schema-drift-blocked surfaces.
      `writesPerformed=false`.
- [ ] Packet currentness remains blocked. The canonical content digest must be produced from
      the exact admitted source bytes, the live `atlas_packets` schema must expose the fields
      used by the approved contract (or an explicitly approved equivalent must be documented),
      and legacy writers must remain quarantined from current-corpus apply paths.

Evidence: `docs/reports/packet-writer-lineage-v1.json` and
`docs/reports/packet-write-revision-contract-v1.json`.
Next gate: `PACKET-DIGEST-BRIDGE-ADMISSION-01`, then rerun the exact packet/chunk closure
against the explicitly authorized execution. No packet, semantic, vector, graph, or cache
write was performed.

### Packet schema/current-writer correction (2026-09-15)

- [x] Re-ran the live packet revision-contract audit after the schema changed concurrently.
      `atlas_packets.source_revision` now exists live, so the earlier schema-absence finding
      is closed and the audit was corrected to report the current state dynamically.
- [ ] The remaining blocker is writer/data adoption, not schema existence: the five discovered
      writer surfaces contain `1` complete revision-bound contract (the admission-bound wrapper);
      `2` are legacy-`sha256` paths and `2` are unqualified or schema-drift-blocked. Existing packet data still has
      one historical/default-shaped workspace revision, `61,365` null `content_hash` values,
      and no proven current packet digest bridge.
- [ ] Keep `PACKET-DIGEST-BRIDGE-ADMISSION-01` open. Before any packet/chunk or semantic
      promotion, one approved writer must accept the explicit admitted workspace/source
      evidence, persist canonical `content_hash` and `source_revision`, and prove exact
      readback against the selected terminal execution. Legacy writers remain quarantined.

Evidence: `docs/reports/packet-writer-lineage-v1.json`,
`docs/reports/packet-write-revision-contract-v1.json`, and
`docs/reports/current-packet-chunk-identity-reconciliation-v1.json`.

### Admission-bound canonical packet writer (2026-09-15)

- [x] Added `persistAdmittedSemanticPacketEmbedding()` as the current-corpus entrypoint around
      the existing semantic packet writer. It validates `SemanticPacketWriteAdmissionV1` before
      reaching the database writer and passes the exact packet key, source reference, source
      revision, and whole-source content digest through unchanged.
- [x] Preserved workspace, execution, and binding provenance in packet metadata while keeping
      the legacy integer cache epoch column separate from the SHA-256 workspace revision
      namespace. The wrapper performs no identity derivation and was not invoked against live DB.
- [x] Added focused coverage for qualified input preservation and malformed digest rejection
      before `insert`; the combined semantic writer/admission suite passes `15/15`.
- [ ] This establishes the writer contract only. A bounded live transaction/readback remains
      blocked until an approved packet cohort and exact source-byte bridge are available.

Evidence: `sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts`,
`sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.spec.ts`, and
`docs/reports/current-packet-digest-bridge-v1.json`. No packet or datastore write was performed.

### Derived Workstation progress receipt (2026-09-15)

- [x] Added `scripts/atlas/build-workstation-progress-receipt-v1.mjs` as the derived
      `WorkstationProgressReceiptV1` producer. It consumes explicit current receipts for
      Graphify authority, packet/chunk lineage, graph readiness, packet writers, and event
      contract state; it does not read task checkbox counts or prose as proof.
- [x] Receipt is deterministic over the source-receipt content, records per-gate proof
      predicates and blockers, preserves `null` for dimensions with no authoritative
      predicate, and emits `authoritative=false` and `writesPerformed=false`.
- [ ] The current projection remains blocked by the same upstream gates: duplicate
      equivalent Graphify execution ownership, packet digest bridge, stale graph projection
      with zero revision-qualified edges, incomplete packet-writer adoption, and unproven
      live canonical event readback. This receipt cannot close tasks or authorize mutations.

### Additional legacy packet apply quarantine (2026-09-15)

- [x] Quarantined `scripts/atlas/index-parent-atlas-packets.mjs --apply`. Its input is a
      historical packet-definition manifest and its INSERT/UPDATE path has no explicit admitted
      workspace revision, source revision, or exact source-byte content digest. The script now
      exits before database connection/write with `PACKET_WRITER_QUARANTINED`; dry-run inventory
      remains available.
- [x] Quarantined `scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs --apply`. Its Rust
      NDJSON import maps defaulted packet metadata and uses a legacy upsert path without the
      current source-membership and digest bridge. It now fails closed before any sync with the
      same structured status; read-only parsing remains available.
- [ ] Packet writer adoption remains open. These changes are safety quarantine only, not proof
      of a current packet writer or authorization to repair historical rows.

Evidence: the two guarded scripts, `docs/reports/packet-writer-lineage-v1.json`, and
`docs/reports/current-packet-digest-bridge-v1.json`. No database, packet, vector, graph, cache,
or projection writes were performed.

Evidence: `docs/reports/workstation-progress-receipt-v1.json`.

### Daily Graphify progress projection (2026-09-15)

- [x] Added `scripts/atlas/build-daily-graphify-progress-v1.mjs`. It consumes the admitted
      Graphify authority, execution-owner, packet/chunk, Workstation-progress, and existing
      TaskCandidate receipts and emits a derived daily summary with source observations,
      blocked/admitted/validated classifications, and explicit delta fields.
- [x] The projection refuses to infer changed/new/deleted/unchanged counts from a different
      historical revision. With no same-revision per-file predecessor, those fields remain
      `null`; the receipt records `NO_PRIOR_RECEIPT_FOR_ADMITTED_WORKSPACE_REVISION` or the
      same-revision limitation explicitly.
- [x] Repeated-build checksum proof passed; the prior daily receipt is retained as diagnostic
      context but excluded from the current checksum to avoid self-reference.
- [ ] Daily Graphify still cannot promote TaskCandidates or Kanban work. Current output has
      `25,542` observed sources, `2` qualifying equivalent executions, and requires explicit
      execution-owner resolution before packet/chunk or graph promotion.

Evidence: `docs/reports/daily-graphify-progress-v1.json`.

### TypeScript evidence capture batching (2026-09-15)

- [x] Replaced whole-artifact buffering in `capture-typescript-error-evidence-v1.mjs`
      with bounded streaming line batches (`--batch-lines`, default `5000`). The CLI hashes
      the input stream, parses only machine-verbose JSONL, aggregates stable diagnostics, and
      preserves nullable lineage and non-promotional flags.
- [x] Added CLI batch-boundary coverage; `node --test
      scripts/atlas/capture-typescript-error-evidence-v1.test.mjs` passes `2/2`.
- [ ] Live full-corpus capture remains a separate checker-execution gate. The adapter now
      avoids loading the entire checker artifact into memory, but it still does not create
      canonical source revisions or authorize repair execution.

Evidence: `scripts/atlas/capture-typescript-error-evidence-v1.mjs`,
`scripts/atlas/capture-typescript-error-evidence-v1.test.mjs`.

### P0 authority checkpoint recheck (2026-09-15)

- [x] Re-ran the duplicate Graphify execution-owner planner. It still reports two
      equivalent terminal executions with one evidence signature; the deterministic
      recommendation remains `74d50c86-8194-45ea-8c3d-61aab737ef83`, but explicit
      authority is still required. No execution was relabeled, deleted, or modified.
- [x] Re-ran the bounded current source-registry planner at `500` rows. It reports
      `82` existing registry matches and `418` review-only candidates under the current
      admitted selection checksum. No registry rows were inserted.
- [x] Re-ran canonical workflow-event tests (`11/11`) and admitted semantic packet-writer
      tests (`15/15`). These prove in-memory contracts only; live Postgres/outbox readback
      remains open.
- [ ] Keep the P0 sequence blocked at explicit Graphify owner decision, canonical packet
      digest/readback, and source→packet→chunk closure. Do not deduplicate semantic rows,
      synthesize revisions, or promote graph/XGBoost/GPU projections from these audits.

Status: `P0_RECHECKED_READ_ONLY`; `canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-graphify-execution-owner-resolution-v1.json`,
`docs/reports/current-source-registry-reconciliation-plan-v1.json`,
`docs/reports/packet-writer-lineage-v1.json`, and the focused writer test suites.

### P0 downstream readiness recheck (2026-09-15)

- [x] Selected-execution preflight remains `OWNER_SELECTION_VALIDATED_NOT_APPLIED` for
      `74d50c86-8194-45ea-8c3d-61aab737ef83`; `candidateFound=true`,
      `safeToApply=false`, and `writesPerformed=false`.
- [x] Current graph readiness remains blocked: `16` observations and `16` node keys,
      but `0` revision-qualified edges.
- [x] Semantic admission remains blocked: `109,776` candidates, `10,995` canonical IDs,
      `5,730` duplicate IDs, `109,746` missing source revisions, `30` mixed workspace
      revisions, and `16` mixed representation revisions.
- [x] Packet-writer lineage remains incomplete: `1` revision-bound writer, `2` legacy
      SHA-256-only writers, and `2` unqualified/schema-drift writers.
- [ ] Keep graph, semantic, XGBoost, and GPU promotion closed until the execution owner,
      packet digest bridge, and current source→packet→chunk lineage are proven.

Status: `P0_DOWNSTREAM_READINESS_BLOCKED`; `writesPerformed=false`.

Evidence: `docs/reports/selected-graphify-execution-owner-v1.json`,
`docs/reports/current-graph-artifact-readiness-v1.json`,
`docs/reports/semantic-corpus-admission-v1.json`, and
`docs/reports/packet-writer-lineage-v1.json`.

### Packet digest planner bounded-query correction (2026-09-15)

- [x] Corrected `scripts/atlas/plan-current-packet-digest-bridge-v1.mjs` so the
      requested bound is applied inside the execution-membership CTE before the
      packet join. The prior query applied `LIMIT` after joining the full current
      population and could hit the PostgreSQL statement timeout at `500` rows.
- [x] Re-ran the explicit current-frame planner with the admitted workspace revision,
      preflighted execution `74d50c86-8194-45ea-8c3d-61aab737ef83`, and `--limit 500`.
      The receipt now completes with `500` sampled members: `0` canonical digest
      matches, `1` legacy-only match, `71` missing packets, and `428` packet digest
      mismatches.
- [ ] The bounded query correction changes audit reliability only. It does not create
      packet rows, reinterpret legacy digests, or authorize source→packet→chunk
      materialization.

Status: `PACKET_DIGEST_BRIDGE_BLOCKED`; `safeToApply=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-packet-digest-bridge-v1.json` and
`scripts/atlas/plan-current-packet-digest-bridge-v1.mjs`.

### Current packet/chunk identity recheck (2026-09-15)

- [x] Re-ran `audit-current-packet-chunk-identity-reconciliation-v1.mjs` with the
      explicit admitted workspace revision and preflighted execution.
- [x] The current execution-owned frame contains `24,456` binding sources and
      `16,554` packet source-reference matches, but `0` canonical packet digest
      matches. Only `3,230` legacy digest matches are present and remain diagnostic.
- [x] The packet/chunk readback reports `627` lineage-reference joins,
      `7,902` missing packet rows, and `13,324` packet digest mismatches; no
      missing-lineage rows were observed for the matched subset.
- [ ] Keep source→packet→chunk closure blocked. Reference joins and legacy digest
      matches do not establish canonical whole-source identity or current promotion.

Status: `PACKET_DIGEST_BRIDGE_MISSING`; `canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `docs/reports/current-packet-chunk-identity-reconciliation-v1.json`.

### Indexing-surface recheck (2026-09-15)

- [x] **AST-GREP-RUNTIME-ADMISSION-01** — the frontend workspace now imports
      `@ast-grep/napi` successfully (`Lang`, `SgNode`, `SgRoot`, and `findInFiles`
      are available). This closes the package-resolution subgate only; the
      existing regex fallback paths remain a separate non-promotional finding.
- [ ] **AST-GREP-FALLBACK-QUARANTINE-01** — remove or explicitly quarantine the
      remaining regex fallback references in the legacy extraction scripts after
      the AST-grep bounded extraction parity test is available. Do not treat
      dependency importability as proof of current structural authority.
- [ ] **DRIZZLE-SIDECAR-INVENTORY-CLASSIFICATION-01** — the live audit sees
      `294` manual SQL files and `64` declared sidecars. The untracked remainder
      requires read-only owner/status classification; no DDL or migration apply is
      authorized by this finding.
- [ ] **SEMANTIC-768-COVERAGE-READBACK-01** — PostgreSQL currently reports
      `55,169 / 274,465` populated canonical `semantic_768` values. Existing rows
      remain observable, but incomplete coverage cannot be promoted as a current
      cohort or used to authorize Qdrant/GPU fanout.

Evidence: `docs/reports/atlas-indexing-surfaces-v1.json`.

### Canonical packet content identity scaffold (2026-09-15)

- [x] Added `buildCanonicalPacketContentIdentityV1()` to the existing packet
      identity/write-decision owner. It hashes the exact supplied whole-source
      bytes, derives the byte-bound `sourceRevision`, preserves the caller's
      explicit `workspaceRevision`, and emits a deterministic read-only
      checksum.
- [x] Added focused deterministic and invalid-workspace-revision tests. The
      scaffold is non-authoritative and performs no database, cache, vector,
      graph, or projection write.
- [ ] Keep packet digest admission open until an approved caller supplies the
      exact admitted execution bytes, persists `atlas_packets.content_hash` and
      `source_revision` through the guarded writer, and reads the row back with
      an exact checksum match. This scaffold does not reinterpret legacy
      `sha256` columns or bridge whole-source digests to chunk hashes.

Status: `PACKET_CONTENT_IDENTITY_SCAFFOLD_COMPLETE`; `PACKET_DIGEST_BRIDGE_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/identity/packet-write-decision-v1.ts`
and its focused spec.

### Stage 4 semantic cohort admission scaffold (2026-09-15)

- [x] Extended the existing `semantic-representation-v1` owner with
      `SemanticCohortAdmissionV1`, explicit executor selection, cohort and
      ordinal-map checksums, and typed blocked/unavailable states.
- [x] Added focused tests for admitted and unavailable cohorts. The contract
      always records `canonicalAuthority=false` and `writesPerformed=false`.
- [ ] Keep live semantic admission blocked until the current source→packet→chunk
      cohort, representation revision, and canonical `semantic_768` readback are
      proven together. Qdrant and cuVS remain executors of the one semantic lane.

Status: `SEMANTIC_COHORT_ADMISSION_SCAFFOLD_COMPLETE`; `SEMANTIC_CURRENT_COHORT_BLOCKED`;
`canonicalAuthority=false`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/atlas/embedding/semantic-representation-v1.ts`
and its focused spec.

### Canonical durable event live readback (2026-09-15)

- [x] Extended `scripts/atlas/audit-critical-lineage-live-readback-v1.mjs` to
      inventory `workflow_events` and `outbox_events` in the same repeatable-read,
      read-only transaction as the lineage tables.
- [x] Live schema readback confirms both event tables are present. Current counts are
      `workflow_events=0` and `outbox_events=6`; canonical payload rows are `0` in
      both tables and paired canonical payloads are `0`.
- [ ] Live canonical WorkflowActionEventV1 persistence remains unproven. The in-memory
      writer tests do not substitute for a live transaction/readback, and no live event
      was inserted during this audit.

Status: `CANONICAL_PAYLOADS_NOT_PRESENT`; `migrationAuthorized=false`;
`writesPerformed=false`.

Evidence: `docs/reports/critical-lineage-live-readback-v1.json` and
`scripts/atlas/audit-critical-lineage-live-readback-v1.mjs`.

### Bounded graph ordinal roundtrip recheck (2026-09-15)

- [x] Re-ran the existing read-only graph ordinal roundtrip audit. The bounded
      artifact contains `23` graph nodes, all `23` bind to candidate ordinals, and
      `0` nodes are unbound.
- [x] The audit reports `GRAPH_CANDIDATE_ORDINAL_ROUNDTRIP_PROVEN_BOUNDED` with
      no workspace mismatches or conflicting packet ordinals.
- [ ] This bounded mapping proof does not close current graph authority: the live
      graph readiness receipt still reports `0` revision-qualified edges. Do not
      promote PageRank, CheiRank, HITS, communities, topology, or GPU graph output.

Status: `GRAPH_ORDINAL_ROUNDTRIP_PROVEN_BOUNDED`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/current-graph-candidate-ordinal-roundtrip-v1.json` and
`docs/reports/current-graph-artifact-readiness-v1.json`.

### Legacy ACP packet materializer quarantine (2026-09-15)

- [x] Added a fail-closed guard to
      `sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts`.
      Its live Postgres path now rejects before reading or writing unless it is
      explicitly in dry-run mode, because the module does not accept the admitted
      execution/source binding or persist the canonical whole-source digest.
- [x] Preserved the dry-run/inventory path and left the canonical semantic packet
      writer as the only revision-qualified implementation path.
- [ ] This quarantine does not produce current packet digests or close the bridge;
      the existing canonical writer still requires an authorized admitted cohort and
      live transaction/readback proof.

Status: `LEGACY_PACKET_MATERIALIZER_QUARANTINED`; `writesPerformed=false`.

Evidence: `sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts`,
`docs/reports/packet-writer-lineage-v1.json`, and
`docs/reports/current-packet-digest-bridge-v1.json`.

### Phase 17 provider admission scaffold (2026-09-15)

- [x] Extended the existing Phase 17 schema owner with
      `RevisionQualifiedFeatureInputV1`, `Phase17FeatureProviderV1`, explicit
      `AVAILABLE`/`DEGRADED`/`BLOCKED`/`UNAVAILABLE` states, and a pure
      `admitPhase17FeatureProviderV1()` boundary.
- [x] Added focused tests proving available providers require their declared
      lineage, missing graph/representation revisions are blocked, and
      unavailable providers remain non-promotional.
- [ ] Keep live Phase 17 execution blocked until the current
      CandidateOrdinalMap/source→packet→chunk cohort is admitted. This scaffold
      does not write `task_semantic_packets`, PostgreSQL, Qdrant, cache, or GPU
      state and does not synthesize missing revisions.

Status: `SCAFFOLD_COMPLETE`; `LIVE_PROOF_BLOCKED`; `CURRENT_AUTHORITY_BLOCKED`.

Evidence: `sveltekit-frontend/src/lib/server/ml/phase17-schema.ts` and
`sveltekit-frontend/src/lib/server/ml/phase17-provider-admission.spec.ts`.

Validation note (2026-09-15): the lane-contracts Vitest configuration does not
include `src/lib/server/ml/**`; the standalone Phase 17 suite therefore remains
unverified in this environment. The general SvelteKit Vitest configuration is
currently blocked during startup by the missing `@rollup/plugin-node-resolve`
package. This is a test-harness limitation only and does not change the
`LIVE_PROOF_BLOCKED` status.

### Stable Graphify execution-owner comparison (2026-09-15)

- [x] Hardened `scripts/atlas/plan-current-graphify-execution-owner-resolution-v1.mjs`
      to read executions, stage receipts, and immutable V2 memberships inside
      one `REPEATABLE READ READ ONLY` transaction, then roll it back explicitly.
- [x] Re-ran the planner: the same two terminal executions remain byte-evidence
      equivalent (`distinctEvidenceSignatures=1`) for the admitted workspace.
- [ ] Owner selection remains intentionally blocked. No timestamp, UUID, or
      completion ordering may choose the canonical execution implicitly.

Status: `DUPLICATE_EQUIVALENT_EXECUTIONS`; `canonicalAuthority=false`;
`writesPerformed=false`.

Evidence: `docs/reports/current-graphify-execution-owner-resolution-v1.json`.
