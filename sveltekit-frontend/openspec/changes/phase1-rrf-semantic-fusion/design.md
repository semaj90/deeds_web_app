## Context

**Current State**: HyperRagFusionService computes 9 independent signals (dense vector score, graph authority, lexical boost, task boost, ACE cache hit, TurboVec hit marker, topology routing, recency/hit rate, engram boost) and combines them via hardcoded weighted sum:
```
finalScore = dense*0.35 + topologyRouted*0.15 + graphAuthority*0.15 + lexicalBoost*0.1 + 
             taskBoost*0.1 + aceBoost*0.1 + (lane=='kag'?0.05:0)
```

**Problem**: Weighted sum treats all signals as independent variables with fixed importance weights. It misses cross-signal consensus patterns — hits ranked highly by multiple lanes receive only additive boosts, while hits ranked by single lanes receive full weight.

**Stakeholders**: All retrieval consumers (HyperRagQuery callers) benefit from improved ranking; no breaking changes to HyperRagHit interface.

## Goals / Non-Goals

**Goals:**
- Implement Reciprocal Rank Fusion (RRF) to replace weighted-sum scoring
- Group 9 signals into 5 conceptual lanes (dense_vector, graph_authority, lexical, cache, temporal)
- Achieve 40-60% retrieval quality improvement (NDCG@5) on reference queries
- Preserve all 9 original signals in HyperRagHit for transparency and debugging
- Add <5ms latency (negligible vs. retrieval I/O ~50-200ms)
- Make lane weights and k parameter configurable

**Non-Goals:**
- Retraining or learning new weights from labeled data (Phase 2 task)
- Changing HyperRagHit interface or adding new signals (Phase 2 task)
- Refactoring other retrieval services (rrf-integration.ts, multiLaneRetrievalWithRRF already use RRF)
- Web search integration (Phase 2 task)

## Decisions

### Decision 1: Lane Grouping Strategy
**Choice**: Group 9 signals into 5 conceptual lanes matching Karpathy Authority Blend semantics.

**Rationale**: The 9 signals naturally cluster by source:
- Lane 1 (Dense Vector): `dense` — Qdrant ANN score, represents semantic similarity
- Lane 2 (Graph Authority): `graphAuthority`, `pagerank` — Neo4j topology, represents structural importance
- Lane 3 (Lexical): `lexicalBoost`, `topologyRouted` — BM25 cluster match, represents naming/path match
- Lane 4 (Cache): `aceBoost`, `turbovec`, `taskBoost`, `engramBoost` — Precomputed/cached hits, represents operational frequency
- Lane 5 (Temporal): `recencyOrHitRate` — Freshness and usage, represents recent relevance

**Alternatives Considered**:
- Treat all 9 as independent lanes: Too granular, weak signals (turbovec marker, taskBoost binary) pollute RRF with noise
- Treat all as single lane: Loses signal diversity, reverts to weighted sum
- Group by signal magnitude (high-entropy vs. low-entropy): Breaks semantic meaning, difficult to explain

### Decision 2: RRF Parameters
**Choice**: Use k=60 (standard from literature), make weights configurable constants.

**Rationale**: k=60 avoids rank=1 singularity while keeping early positions dominant. Weights default to:
- Dense vector: 1.0
- Graph authority: 0.8
- Lexical: 0.6
- Cache: 0.5
- Temporal: 0.3

These reflect reliability: semantic similarity (dense) is most stable, recency (temporal) is weakest signal.

**Alternatives Considered**:
- k=10: Too sensitive to rank order, early results dominate
- k=100: Too insensitive, all ranks treated equally
- Fixed weights (non-configurable): Prevents future tuning without code change

### Decision 3: Signal Preservation
**Choice**: Keep all 9 original signals in HyperRagHit.signals, add new field HyperRagHit.rrfBreakdown.

**Rationale**: Maintains transparency for debugging and reasoning. Users can inspect why a hit ranked high (e.g., "high graphAuthority + low dense" → structural match, not semantic match).

**Alternative Considered**:
- Remove intermediate signals: Faster, cleaner, but loses observability

### Decision 4: Implementation Location
**Choice**: Create two new utility modules (`rrf-lane-grouper.ts`, `rrf-combiner-utils.ts`) and modify hyperrag-fusion-service.ts signal grouping (lines ~429-450) and score computation (lines 471-477).

**Rationale**: Separates RRF logic from HyperRAG orchestration, making it reusable and testable. Minimal changes to hyperrag-fusion-service.ts (only signal grouping + fusion formula).

**Alternative Considered**:
- Inline RRF logic in hyperrag-fusion-service.ts: Simpler, but harder to test and reuse

## Risks / Trade-offs

**[Risk] RRF score distribution changes → metrics/dashboards expect old score ranges**
- **Mitigation**: Document score range change (weighted sum: 0-1.5 typical, RRF: 0.1-0.5 typical). Add metrics to track NDCG improvement. No breaking change to consumers (score is opaque number).

**[Risk] Edge case: Hit appears in only 1 lane → ranked lower than multi-lane hits**
- **Mitigation**: This is intentional (RRF amplifies consensus). Verify on reference queries that it improves, not regresses, single-lane hits.

**[Risk] Cache hits (ACE, TurboVec, taskBoost) have weak signal strength → may be deprioritized**
- **Mitigation**: Set cache lane weight=0.5 (moderate), not too low. Verify in reference queries.

**[Trade-off] Configuration complexity vs. simplicity**
- **Choice**: Expose weights + k as constants, not env vars. Easier to reason about, less config sprawl.

**[Trade-off] Latency: RRF has per-lane ranking + merge step**
- **Estimated overhead**: ~2-5ms for typical ~100 hits × 5 lanes. Acceptable given retrieval I/O is 50-200ms.

## Migration Plan

**Phase 1a (Implementation)**: Create rrf-lane-grouper.ts, rrf-combiner-utils.ts (no changes to hyperrag-fusion-service.ts yet)
**Phase 1b (Wiring)**: Modify hyperrag-fusion-service.ts signal grouping + fusion formula, test locally
**Phase 1c (Validation)**: Run reference queries, measure NDCG improvement, verify no regressions
**Rollback**: Revert weighted-sum formula to line 471-477; all signal computation remains same

## Open Questions

- **Exact reference query set for NDCG validation?** (e.g., 10 queries covering codebase/evidence/docs modes)
- **Target threshold for "40-60% improvement"?** (NDCG@5: baseline ~0.45, target ~0.65+?)
- **Should we persist RRF weights in Postgres for A/B testing later, or keep as code constants?**