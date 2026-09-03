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

## 1. BEST-FIT-SCORE-SEMANTICS-02 (not started)

- [ ] 1.1 In `okf-fit.ts`: rename `naive_bayes_score` → `heuristicPriorScore`,
      `logistic_regression_score` → `heuristicFitScore`, `fit_margin` → `heuristicFitMargin`.
      Keep the old snake_case fields as deprecated compatibility aliases (do not silently break
      OKF/HMM consumers) — mark them `@deprecated` and set from the new fields.
- [ ] 1.2 Fix `classifyOkfFit()` to preserve `classifyDomainTaxonomy()`'s own `confidence`/
      `classifier_version` under distinct field names (`domainTaxonomyConfidence`/
      `domainTaxonomyRevision`) instead of being overwritten by the heuristic values
      (`heuristicFitScore`/`heuristicFitRevision`).
- [ ] 1.3 Apply the same rename to `hmm-policy-bridge.ts`'s independently hand-built
      `naiveBayesScore`/`logisticRegressionScore` pair.
- [ ] 1.4 Rename the live `:8095` sklearn outputs (in `miniforge_nlp_sidecar.py`'s `classify` pass
      and every TS consumer — `train_domain_classifier.py`, `ACPToolRegistry.ts`'s
      `nlp:classify_domain`, `trace-mcp-server.ts`'s `domain.classify`, `domain-taxonomy-ml-bridge.ts`)
      to `naiveBayesDomainProbability`/`logisticRegressionDomainProbability`, distinct from the
      OKF/HMM heuristic names — three genuinely different things must not share a name family.
- [ ] 1.5 Add regression tests freezing: the exact 0.80/0.55 OKF threshold behavior, the exact
      coefficient formula (so a future edit can't silently drift it), and that the compatibility
      aliases stay in sync with the renamed fields.

## 2. RERANK-WEIGHT-BOUNDARY-01 (not started)

- [ ] 2.1 Add `BlendWeightsSchema.parse()` inside `blendScores()` itself (or at minimum at every
      externally-reachable call site that accepts a caller-supplied `blendWeights`, starting with
      `scoreCandidates()`'s `options.blendWeights`).
- [ ] 2.2 Add a malformed-sum rejection test (weights not summing to 1.0 ± 0.0001) proving the
      boundary is actually enforced, not just present in the class constructors.

## 3. XGBOOST-RERANK-ACTIVATION-01 (not started)

- [ ] 3.1 Fix `canonical-rerank-executor.ts:487-501` so the XGBoost score actually contributes to
      `blendedScore` (either via a real non-zero `crossEncoder` weight when the XGBoost path is
      active, or a dedicated blend signal — the exact mechanism is an open design choice, not
      decided here).
- [ ] 3.2 Prove the fix actually changes candidate ordering on a real query (a live before/after
      ranking comparison, not just a code read) — until then, keep classifying this path
      `LEARNED_SCORE_OBSERVED_NOT_RANKING_ACTIVE`, per finding 0.7 above.
- [ ] 3.3 Update `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s `XGBOOST-RERANKER-EVAL-01`
      gate to reference this task and its distinct scope (future training-eval vs. this session's
      already-deployed-path bug) before that gate starts.

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
