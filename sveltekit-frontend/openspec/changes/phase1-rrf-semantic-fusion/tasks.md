## 1. Implement RRF Lane Ranker Utility

- [ ] 1.1 Create `src/lib/server/retrieval/rrf-lane-ranker.ts` with `rankHitsInLane(hits, laneWeight, k=60)` function
- [ ] 1.2 Implement RRF formula: `contribution = weight / (k + rank)` for each hit
- [ ] 1.3 Add tie-breaking logic: sort by hit ID when scores are equal for deterministic ordering
- [ ] 1.4 Handle edge cases: empty lane, single hit, all zero scores
- [ ] 1.5 Unit test: verify RRF formula correctness with known inputs

## 2. Implement RRF Combiner Utility

- [ ] 2.1 Create `src/lib/server/retrieval/rrf-combiner-utils.ts` with `combineRRFLanes(lanes)` function
- [ ] 2.2 Implement lane merging: deduplicate hits by ID, sum contributions across lanes
- [ ] 2.3 Add metadata priority logic: use metadata from highest-contributing lane when duplicates exist
- [ ] 2.4 Implement sorting: return hits sorted by final RRF score descending
- [ ] 2.5 Unit test: verify hit deduplication and score summation

## 3. Refactor HyperRAG Signal Grouping

- [ ] 3.1 Read current hyperrag-fusion-service.ts lines 429-449 (signal computation)
- [ ] 3.2 Create signal grouping function: map 9 signals to 5 lanes (dense_vector, graph_authority, lexical, cache, temporal)
- [ ] 3.3 Implement lane hit grouping: partition all hits by lane based on signal presence/strength
- [ ] 3.4 Verify all 9 signals are covered in exactly one lane (no gaps, no duplicates)
- [ ] 3.5 Unit test: verify signal grouping correctness

## 4. Wire RRF Fusion into HyperRAG

- [ ] 4.1 Replace weighted-sum formula (lines 471-477) with RRF fusion call
- [ ] 4.2 Add RRF constants to hyperrag-fusion-service.ts: `RRF_CONSTANT_K = 60`, lane weights object
- [ ] 4.3 Implement `computeRRFScore(signalsByLane, k, weights)` function in hyperrag-fusion-service.ts
- [ ] 4.4 Add `rrfBreakdown` field to HyperRagHit for transparency (lane contributions)
- [ ] 4.5 Ensure all 9 original signals remain in HyperRagHit.signals (no removal)

## 5. Add A/B Comparison Mode

- [ ] 5.1 Add optional `compareScoring` parameter to HyperRagQuery type
- [ ] 5.2 Implement dual scoring path: compute both RRF and weighted-sum when compareScoring=true
- [ ] 5.3 Add `scoreWeightedSum` field to HyperRagHit output for comparison
- [ ] 5.4 Add fallback: if RRF throws error, use weighted-sum with warning log

## 6. Implement Semantic Fusion Metrics

- [ ] 6.1 Create `src/lib/server/retrieval/semantic-fusion-metrics.ts` with `computeNDCG(rankedHits, relevanceLabels, k=5)` function
- [ ] 6.2 Implement NDCG formula: DCG@K / ideal_DCG@K with log2 position decay
- [ ] 6.3 Implement MRR@10: track rank of first relevant result
- [ ] 6.4 Implement multi-lane coverage: percentage of top-K results from 2+ lanes
- [ ] 6.5 Implement latency tracking: measure per-lane ranking + merge time
- [ ] 6.6 Unit test: verify metric calculations match reference implementations

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
