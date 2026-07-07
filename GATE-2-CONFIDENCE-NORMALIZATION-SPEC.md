# Gate 2: Confidence Score Normalization — Specification & Execution Plan

**Date**: July 7, 2026  
**Status**: 🟡 **DESIGN_READY — AWAITING PATH A/B DECISION TO EXECUTE**  
**Scope**: Path-independent (execute immediately once user decides)  
**Owner**: Claude / Session 121+  

---

## Purpose

Normalize all confidence signals across the system to a unified `[0, 1]` scale. This unifies:
- Dispatcher routing decisions
- RRF (Reciprocal Rank Fusion) signal weighting
- HMM observation inputs
- Telemetry calibration (predicting confidence → actual accuracy)
- Cache hit decisions (Bitmap Gate threshold)

**Hard Rule**: Every signal producer (Ontology, Engram, Retrieval, Telemetry, Reranking) MUST report normalized `[0, 1]` confidence. No exceptions.

---

## Systems to Normalize (6 Sources)

| Source | Current Scale | Current Formula | Target Scale | Owner | File |
|--------|--------------|-----------------|--------------|-------|------|
| **Ontology** | 0-1 (keyword overlap) | `overlap_count / max_keywords` | 0-1 ✅ | Phase 3b.1 done | `atlas_packets.ontology_confidence` |
| **Engram** | 0-1 (AST coverage) | `ast_symbols_found / ast_symbols_expected` | 0-1 ✅ | Session 110+ done | `atlas_packets.feature_confidence` |
| **Dispatcher** | Posterior prob (Naive Bayes) | `exp(score) / sum(exp(*))` | 0-1 ✅ | Dispatcher logic | Routing decision |
| **Telemetry** | 0-1 (tool success rate) | `successful_calls / total_calls` | 0-1 ✅ | Tool telemetry | `agent_telemetry.confidence_score` |
| **Retrieval (RRF)** | Varies per signal | Different per lane | 0-1 ⏳ **TO DO** | Gate 2 work | RRF formula |
| **Reranking** | Cosine similarity | `-1 to 1` → `(x+1)/2` | 0-1 ✅ | Existing mapping | `reranking_score` |

**Current Status**: 4/6 sources already normalized. Gate 2 focuses on normalizing Retrieval + validating Dispatcher.

---

## Retrieval Signals Normalization (RRF Lane Weights)

**6 signals feed into RRF. Currently mixed scales. Target: all [0, 1].**

### Signal 1: Qdrant Dense (768-d semantic)
- **Source**: `Qdrant /search` → `score` field
- **Current**: `[0, 2]` range (cosine similarity after Qdrant normalization)
- **Normalization**: `normalized = (score + 1) / 2` → `[0, 1]`
- **Test**: Query → verify all scores in `[0, 1]`

### Signal 2: Qdrant Keywords (TF-IDF)
- **Source**: `Qdrant /search` with `keywords` named vector
- **Current**: `[0, ∞)` range (TF-IDF raw scores)
- **Normalization**: `normalized = min(score / percentile_75, 1.0)` → `[0, 1]`
  - Compute p75 of historical scores
  - Cap at 1.0 for outliers
- **Test**: Query → verify all scores in `[0, 1]`

### Signal 3: Neo4j Graph Distance
- **Source**: Neo4j shortest path, HNSW neighbors, PageRank
- **Current**: Path length `[1, N]`, PageRank `[0, ∞)`, similarity `[-1, 1]`
- **Normalization**:
  - Path length: `normalized = exp(-distance / avg_distance)` → `[0, 1]`
  - PageRank: `normalized = (score - min) / (max - min)` → `[0, 1]`
  - Similarity: `normalized = (score + 1) / 2` → `[0, 1]`
- **Test**: Graph query → verify all outputs normalized

### Signal 4: PostgreSQL FTS (Full-Text Search)
- **Source**: PostgreSQL `ts_rank()` function
- **Current**: `[0, ∞)` range (TF-IDF weights)
- **Normalization**: `normalized = min(score / p75_historical, 1.0)` → `[0, 1]`
- **Test**: FTS query → verify scores in `[0, 1]`

### Signal 5: Ontology Confidence
- **Source**: Keyword overlap, domain class match, entity match
- **Current**: Already `[0, 1]` ✅
- **Normalization**: No change needed
- **Test**: Read from `atlas_packets.ontology_confidence`

### Signal 6: Freshness Boost
- **Source**: `(now - last_modified) / reference_age`
- **Current**: `[0, 1]` after decay function
- **Normalization**: Already normalized ✅
- **Test**: Verify decay formula produces `[0, 1]`

---

## Dispatcher Confidence Blending

**Formula after normalization:**

```
dispatcher_confidence = 
  0.30 × qdrant_dense +
  0.20 × qdrant_keywords +
  0.20 × neo4j_graph +
  0.15 × postgres_fts +
  0.10 × ontology_confidence +
  0.05 × freshness_boost

where all signals ∈ [0, 1]
```

**Result**: `dispatcher_confidence ∈ [0, 1]`

**Routing threshold** (post-normalization):
- If `dispatcher_confidence ≥ 0.85` → Go Retrieval (fast path)
- Else → RabbitMQ Worker (async recovery)

---

## HMM Observation Normalization

All 10 HMM observations must be normalized to `[0, 1]`:

| Observation | Current Range | Normalization | After |
|-------------|--------------|----------------|-------|
| `bitmap_score` | `[0, 1]` | No change | `[0, 1]` ✅ |
| `symbol_resolver_success` | `[0, 1]` | No change | `[0, 1]` ✅ |
| `qdrant_exists` | Boolean {0, 1} | No change | `[0, 1]` ✅ |
| `neo4j_exists` | Boolean {0, 1} | No change | `[0, 1]` ✅ |
| `telemetry_score` | `[0, 1]` | No change | `[0, 1]` ✅ |
| `pagerank` | `[0, ∞)` | Normalize via min/max | `[0, 1]` ⏳ |
| `community_id_consistency` | `[0, 1]` | No change | `[0, 1]` ✅ |
| `freshness` | `[0, 1]` | No change | `[0, 1]` ✅ |
| `feature_confidence` | `[0, 1]` | No change | `[0, 1]` ✅ |
| `reconstruction_error` | `[0, ∞)` | Invert: `1 / (1 + error)` | `[0, 1]` ⏳ |

**Status**: 8/10 observations already normalized. Gate 2 finalizes pagerank + reconstruction_error.

---

## Execution Checklist

### Phase 1: Audit Current State (2 hours)
- [ ] Query all confidence sources from Postgres
- [ ] Sample 1000 candidates from each source
- [ ] Collect min/max/mean/p75 for each signal
- [ ] Document outliers and edge cases
- [ ] **npm script**: `atlas:gate2:audit:confidence:dry`

### Phase 2: Build Normalizer Functions (3 hours)
- [ ] Create `src/lib/server/retrieval/confidence-normalizer.ts`
  - `normalizeQdrantDense(score: number): number`
  - `normalizeQdrantKeywords(score: number): number`
  - `normalizeNeo4jGraph(score: number): number`
  - `normalizePostgresFts(score: number): number`
  - `normalizeOntologyConfidence(score: number): number`
  - `normalizeFreshness(score: number): number`
  - `rrf_fused(signals: ConfidenceSignals): number` (unified RRF)
- [ ] Add Zod schema: `ConfidenceSignals` type
- [ ] **npm script**: `atlas:gate2:functions:test:dry`

### Phase 3: Integration Tests (2 hours)
- [ ] Test each normalizer with 100 inputs
- [ ] Verify output ∈ [0, 1]
- [ ] Verify RRF sum = 1.0 (sanity check)
- [ ] Test with edge cases (NaN, Infinity, negative)
- [ ] **npm script**: `atlas:gate2:integration:test`

### Phase 4: Wire Into Retrieval Path (4 hours)
- [ ] Update `go-retrieval-orchestrator.ts` to call normalizers
- [ ] Update RRF fusion to use normalized signals
- [ ] Update Dispatcher routing to use normalized confidence
- [ ] Add telemetry field `signal_normalized` (per signal)
- [ ] **npm script**: `atlas:gate2:wire:dry`

### Phase 5: Validation Gates (2 hours)
- [ ] **Gate 2.1**: All signals in [0, 1] (100% check)
- [ ] **Gate 2.2**: Dispatcher confidence ≥ 0.85 triggers fast path (sanity)
- [ ] **Gate 2.3**: Confidence calibration: 0.85 avg → 85% actual accuracy (post-deployment)
- [ ] **Gate 2.4**: No NaN/Infinity in logs (100% clean)
- [ ] **npm script**: `atlas:gate2:validate:all`

### Phase 6: Apply to Production (1 hour)
- [ ] Deploy normalizer functions
- [ ] Wire into live retrieval path
- [ ] Monitor telemetry for 1 hour
- [ ] If any issues: rollback to previous behavior
- [ ] **npm script**: `atlas:gate2:apply`

---

## Success Criteria

✅ **Gate 2 passes when:**
1. All 6 retrieval signals report confidence ∈ [0, 1]
2. RRF formula applies without rescaling (weights sum to 1.0)
3. Dispatcher confidence ∈ [0, 1]
4. HMM observations normalized (10/10 ∈ [0, 1])
5. Telemetry captures `signal_normalized` for audit
6. Zero NaN/Infinity in logs (24-hour run)

**Target**: 99%+ of queries report normalized confidence end-to-end.

---

## Blocking Dependencies

✅ **Gate 2 is independent**:
- Does NOT require Path A (autoencoder)
- Does NOT require Path B (multi-vector lanes)
- Does NOT require Gate 3 (symbol resolver)
- Does NOT require Gate 4 (Go API contract)

**Can execute immediately once user decides Path A or B.**

---

## Timeline

- **Research + Design**: 2-3 hours (already done ✅)
- **Implementation**: 13-14 hours (audit + normalizers + tests + wire + validate + apply)
- **Total**: ~1-2 days for full execution
- **Post-Deployment Monitoring**: 24 hours (confidence calibration)

**Target**: Complete by end of Session 121 (same week as Path A/B execution).

---

## Reference

- **SYSTEM-ARCHITECTURE-BLUEPRINT.md** — RRF formula (6 signals, normalized 0-1)
- **SESSION-120-PRODUCTION-ROADMAP.md** — Gate 2 overview
- **PRODUCTION-ARCHITECTURE-REFINED.md** — Dispatcher blending formula, confidence calibration

---

## Next Steps

1. **User decides**: Path A or Path B
2. **Execute**: Gates 2-4 in parallel (independent)
3. **Session 121**: Start Gate 2 audit + Phase 7 monitoring
4. **Session 122**: Apply Gate 2 + assess Phase 7 completion
5. **Session 123**: Wire Gate 5 (depends on Gate 2 completion)

---

**Status**: READY TO EXECUTE — Awaiting user decision on Path A vs B.
