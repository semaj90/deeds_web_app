## 1. Implement RRF Lane Ranker Utility

- [x] 1.1 **VERIFIED LIVE 2026-09-08** (found stale-tracked while auditing cross-tree OpenSpec
      duplication as part of `parent-atlas-trace-search-joinback-proof`'s handoff) —
      `src/lib/server/retrieval/rrf-lane-ranker.ts` exists with exactly `rankHitsInLane(hits,
      laneWeight, k=60)`.
- [x] 1.2 **VERIFIED LIVE** — formula `contribution = weight / (k + rank)` present, read directly.
- [x] 1.3 **VERIFIED LIVE** — tie-breaking by hit ID present (read directly).
- [x] 1.4 **VERIFIED LIVE** — explicit `hits.length === 0` and `hits.length === 1` branches present.
- [ ] 1.5 **NOT FOUND** — no `rrf-lane-ranker.spec.ts` exists. `hyperrag-fusion-service.test.ts`
      exists and may cover this behavior at an integration level, but no dedicated unit test for
      this function in isolation was found.

## 2. Implement RRF Combiner Utility

- [x] 2.1 **VERIFIED LIVE 2026-09-08** — `src/lib/server/retrieval/rrf-combiner-utils.ts` exists
      with exactly `combineRRFLanes(lanes)`.
- [x] 2.2 **VERIFIED LIVE** — dedup-by-id accumulator + sum-contributions logic present (read
      directly).
- [x] 2.3 **PARTIALLY VERIFIED** — a metadata-priority mechanism exists in the combiner; exact
      "highest-contributing lane wins" tie-break semantics not independently re-derived from the
      formula, only confirmed the mechanism exists.
- [x] 2.4 **VERIFIED LIVE** — `sortByRRFScoreDescending()` present and used.
- [ ] 2.5 **NOT FOUND** — same gap as 1.5: no dedicated `rrf-combiner-utils.spec.ts`.

## 3. Refactor HyperRAG Signal Grouping

- [x] 3.1-3.4 **VERIFIED LIVE 2026-09-08** — `src/lib/server/retrieval/signal-grouping.ts` exists,
      exports `partitionHitsByLane`/`HyperRagSignals`, imported and used directly by
      `hyperrag-fusion-service.ts`. Full 9-signal-to-5-lane coverage not independently re-audited
      line-by-line, but the module exists and is wired, not a stub.
- [ ] 3.5 **NOT FOUND** — no dedicated `signal-grouping.spec.ts` found (not exhaustively searched
      beyond a direct filename check).

## 4. Wire RRF Fusion into HyperRAG

- [x] 4.1 **VERIFIED LIVE 2026-09-08** — the weighted-sum formula this task describes replacing is
      gone; `hyperrag-fusion-service.ts` calls `computeRRFScore(id, signals, allHitsInLanes)`
      (line ~519) inside a section explicitly commented `// 3. RRF Fusion + Boosting`.
- [x] 4.2 **VERIFIED LIVE** — `RRF_CONSTANT_K = 60` and `RRF_LANE_WEIGHTS` (dense_vector:1.0,
      graph_authority:0.8, lexical:0.6, cache:0.5, temporal:0.3 — exact lane names this proposal
      specified) both exist in `compute-rrf-score.ts`, imported into `hyperrag-fusion-service.ts`.
- [x] 4.3 **VERIFIED LIVE, note the actual location differs from this task's literal wording** —
      `computeRRFScore()` exists and does the described job, but lives in its own module
      (`compute-rrf-score.ts`) rather than being inlined directly into
      `hyperrag-fusion-service.ts` as this task's text specifies; a reasonable, arguably better,
      implementation choice, not a gap.
- [x] 4.4 **VERIFIED LIVE** — `rrfBreakdown` field present on the hit type (line ~84) and populated
      from `rrfResult.rrfBreakdown` (line ~600).
- [ ] 4.5 **NOT INDEPENDENTLY VERIFIED** — plausible given the surrounding evidence, but the "all 9
      original signals remain, none removed" claim was not exhaustively re-checked against the
      original 9-signal list.

## 5. Add A/B Comparison Mode

- [ ] 5.1 Add optional `compareScoring` parameter to HyperRagQuery type
- [ ] 5.2 Implement dual scoring path: compute both RRF and weighted-sum when compareScoring=true
- [ ] 5.3 Add `scoreWeightedSum` field to HyperRagHit output for comparison
- [ ] 5.4 Add fallback: if RRF throws error, use weighted-sum with warning log

## 6. Implement Semantic Fusion Metrics

- [x] 6.1 **VERIFIED LIVE 2026-09-08** — `src/lib/server/retrieval/semantic-fusion-metrics.ts`
      exists with `computeNDCG()`.
- [x] 6.2 **PLAUSIBLE, NOT RE-DERIVED** — `computeNDCG()` exists; the exact DCG/ideal-DCG/log2-decay
      formula internals were not independently re-checked line-by-line.
- [x] 6.3 **VERIFIED LIVE** — `computeMRR()` exists.
- [x] 6.4 **VERIFIED LIVE** — a "multi-lane coverage" section/comment exists in the file.
- [x] 6.5 **VERIFIED LIVE** — latency-tracking functions exist, including
      `validateFusionLatency()` which directly encodes this proposal's own "< 5ms" requirement
      (task 7.6 below) as a real runtime check (`latency.mergeMs < 5`).
- [ ] 6.6 **NOT FOUND** — no dedicated `semantic-fusion-metrics.spec.ts` found.

## 7. Local Testing and Validation

- [ ] 7.1 Create 10 reference queries covering codebase, evidence, docs modes
- [ ] 7.2 Manually label top-10 results for each query as relevant/irrelevant
- [ ] 7.3 Run queries with both weighted-sum (baseline) and RRF scoring
- [ ] 7.4 Compute NDCG@5, MRR@10, multi-lane coverage for both methods
- [ ] 7.5 Verify NDCG improvement ≥ 40% on reference queries
- [ ] 7.6 Verify fusion latency < 5ms (measure with console.time/console.timeEnd)
- [ ] 7.7 Verify no regressions: MRR@10 should not decrease

## 8. Integration and Smoke Testing

- [ ] 8.1 Run full TypeScript check: `npm run check` in sveltekit-frontend
- [ ] 8.2 Run existing HyperRAG tests (if any exist): verify no breakage
- [ ] 8.3 Test HyperRagFusionService.search() with compareScoring=true
- [ ] 8.4 Verify HyperRagHit output schema: signals present, rrfBreakdown added, score updated
- [ ] 8.5 Manual browser test: run a retrieval query, verify results render without errors

## 9. Documentation and Cleanup

- [ ] 9.1 Add code comments to rrf-lane-ranker.ts explaining RRF formula
- [ ] 9.2 Add code comments to rrf-combiner-utils.ts explaining lane merging
- [ ] 9.3 Add JSDoc to HyperRagFusionService methods mentioning RRF change
- [ ] 9.4 Document lane weights and k parameter (add comment block near RRF constants)
- [ ] 9.5 Create CHANGELOG entry: "Phase 1: Replace weighted-sum scoring with Reciprocal Rank Fusion (40-60% NDCG improvement)"

## 10. Verification and Commit

- [ ] 10.1 Re-run full test suite: `npm test` (if applicable)
- [ ] 10.2 Verify git diff: only hyperrag-fusion-service.ts modified + 2 new utils, no spurious changes
- [ ] 10.3 Create commit message: "feat(retrieval): implement RRF fusion for multi-signal ranking"
- [ ] 10.4 Push changes to working branch
- [ ] 10.5 Create PR with reference queries NDCG comparison results

## Status

**Found stale 2026-09-08** during a broader cross-tree OpenSpec duplication sweep spun off from
`parent-atlas-trace-search-joinback-proof`'s handoff notes (that change itself is unrelated to
RRF fusion — this was found by keyword-matching `phase1-rrf-semantic-fusion` against root's
`parent-atlas-retrieval-fusion-reachability`, since both concern RRF/fusion ownership). This
proposal had shown **0/52 tasks** since 2026-07-06 (over two months of zero recorded progress),
which turned out to be a pure tracking gap, not a reflection of reality: **the core
implementation is fully live in production code today**, apparently delivered by unrelated/
converged work (most plausibly folded into `parent-atlas-retrieval-fusion-reachability`, 55/62
tasks, which explicitly discusses `combineViaRRF`/RRF-fusion ownership) that never circled back
to close out this proposal's own tasks.md.

**Verified live 2026-09-08** (sections 1-4 and 6, marked `[x]` above with individual evidence):
`rrf-lane-ranker.ts`, `rrf-combiner-utils.ts`, `signal-grouping.ts`, `semantic-fusion-metrics.ts`,
and `compute-rrf-score.ts` all exist with the exact function names, formula, and lane-weight
constants (`dense_vector`/`graph_authority`/`lexical`/`cache`/`temporal`, `k=60`) this proposal
specified — `compute-rrf-score.ts`'s own header comment literally quotes this proposal's language
("Replaces weighted-sum formula (lines 471-477)... 40-60% NDCG@5"). `hyperrag-fusion-service.ts`
calls `computeRRFScore()` directly, and the old weighted-sum formula this proposal set out to
replace is gone.

**Not verified / likely genuinely incomplete**: per-function unit tests (1.5, 2.5, 3.5, 6.6 — no
`.spec.ts` files found for these specific modules, though `hyperrag-fusion-service.test.ts` may
cover related behavior at an integration level), the A/B `compareScoring` comparison mode
(section 5 — not checked, may never have been built since production simply cut over to RRF
rather than keeping a dual-scoring path), the formal NDCG/MRR validation run against 10 labeled
reference queries (section 7), and the documentation/commit/PR process steps (sections 8-10,
which don't really apply retroactively to work whose actual commit history is unknown from this
vantage point).

**Not fixed here** — this proposal isn't part of either OpenSpec change actively being worked this
session; updating its own tracking to reflect verified reality (rather than misleadingly showing
"0/52 pending" for already-shipped work) was judged worth doing on sight, per this repo's
Duplication Prevention "record what you found even when you don't fix it" discipline, but
building the missing unit tests or running the formal validation in section 7 was not attempted.
If someone wants NDCG-improvement proof for this specific change, section 7 still needs to be run
for real against production data — the code changes are live, but the *measurement* this proposal
promised was never independently confirmed here.
