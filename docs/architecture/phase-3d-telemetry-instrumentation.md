# Phase 3D Instrumentation Plan: Retrieval Telemetry Wiring

**Status**: ACTIVE  
**Updated**: 2026-06-11  
**Goal**: Instrument three core retrieval points to capture behavioral evidence before cache/lifecycle policy decisions

---

## Strategic Context

User explicit guidance (Message 12, 2026-06-11):

> Next active work should be Phase 3D telemetry instrumentation, not more registry expansion...
> Immediate implementation TODO:
> 1. Add retrieval_strategy field everywhere telemetry is emitted
> 2. Instrument ACE context assembler
> 3. Instrument hybrid-search / ngram retrieval fusion
> 4. Instrument RAG pipeline if it is still active
> 5. Emit selected_packet_key, selected_feature_id, latency_ms, vector_hits, fts_hits, trigram_hits
> 6. Keep recorder fire-and-forget
> 7. Generate retrieval-telemetry-summary
> 8. Collect 1,000+ query baseline before cache/lifecycle policy
>
> Hard rule: Do not promote COLD NESCHROM97 cards into Qdrant/Neo4j until telemetry proves retrieval demand.

---

## Schema State (Verified Ready)

**File**: `src/lib/server/db/schema/retrieval-telemetry.ts`

All Phase 3D fields already in schema:
- `retrievalStrategy` (default 'hybrid', indexed)
- `selectedPacketKey` / `selectedPacketKeys` (array, GIN indexed)
- `selectedFeatureId` / `featureIds` (array, GIN indexed)
- `vectorHits`, `trigramHits`, `ftsHits`
- `latencyMs`, `cacheHit`, `surface`, `environment`
- Indexes on all decision-critical fields

**Recorder**: `src/lib/server/telemetry/retrieval-recorder.ts`
- `recordRetrievalTelemetry()` — fire-and-forget with graceful error handling ✅
- `recordRetrievalTelemetryBatch()` — batch operation support ✅
- Interface: `RetrievalTelemetrySignal` with all fields

---

## Three Instrumentation Points

### POINT 1: ACE Context Assembler (Primary)

**File**: `src/lib/server/features/ai/ace/context-assembler.ts`

**Function**: `assembleACEContext(opts: { query, userId, caseId, ... })`

**Location**: ~line 1273 onwards

**Key instrumentation moments**:
1. **Entry**: Record query + timestamp
2. **After vector search** (Qdrant ANN): record `vectorHits`, `semanticScore`
3. **After lexical search** (Postgres FTS): record `trigramHits`, `lexicalScore`
4. **After Neo4j graph expansion**: record `kag_neighbors_count`
5. **After fusion/reranking**: record `selectedPacketKey`, `selectedFeatureId`, `fusionScore`, final latency

**Decision point**: Choose `retrievalStrategy` based on hybrid search mode + selection criteria:
- If vector-only path: `retrievalStrategy = 'vector_only'`
- If lexical-only path: `retrievalStrategy = 'lexical_only'`
- If Neo4j structural search: `retrievalStrategy = 'structural_only'`
- If combined (default): `retrievalStrategy = 'fusion'`
- If fallback to NESCHROM97: `retrievalStrategy = 'cold_neschrom'`

**Current state**: 
- Already logs Bifrost retrieval telemetry at line 1341
- Already has `statsOut` object for caller debugging
- `retrievalTrace` field exists (line 1414-1416) but minimal

**Action**: 
1. Create helper `recordACETelemetry()` function
2. Wire telemetry at key decision points
3. Emit async (fire-and-forget) before returning context

---

### POINT 2: Hybrid Search (Secondary)

**File**: `src/lib/server/search/hybrid-search.ts`

**Function**: `hybridSearchCode(query: string, opts: HybridSearchOptions)`

**Key instrumentation moments**:
1. **Entry**: Record query, mode (lexical/semantic/hybrid)
2. **After Postgres FTS**: record `trigramHits`
3. **After Qdrant ANN**: record `vectorHits`
4. **After Neo4j rerank**: record authority scores
5. **After GPU rerank**: record `gpuScore`
6. **Exit**: Record final selected result, latency, fusion score

**Current state**:
- Already has mode detection (line 69)
- Already has cache logic (Redis topo-candidate cache)
- Returns `HybridSearchOutput` with results + mode + traceKey

**Action**:
1. Add telemetry emission at end of `hybridSearchCode()`
2. Record hit counts per lane
3. Capture selected result + confidence score
4. Keep Redis cache separate (not a telemetry point itself)

---

### POINT 3: RAG Pipeline (Tertiary)

**File**: `src/lib/server/rag/rag-pipeline.ts` (if it exists as standalone)

**Status**: Need to verify if RAG is still active as standalone vs integrated into ACE

**Key instrumentation moments**:
1. **Entry**: Query + context tokens
2. **After retrieval**: vector + lexical hit counts
3. **After reranking**: selected chunk + score
4. **After LLM generation**: latency breakdown

**Action**:
1. Check if RAG pipeline is active
2. If it is a callpoint from ACE, emit telemetry after RAG returns
3. If it's standalone, wire its own instrumentation
4. Mark which surface called it (ACE vs direct API call)

---

## Implementation Order

### Phase 3D.1: ACE Assembler Instrumentation (THIS WEEK)

**Tasks**:
1. ✅ Verify schema ready (done)
2. ✅ Verify recorder ready (done)
3. [ ] Create `src/lib/server/telemetry/ace-telemetry-emitter.ts`
   - Helper function: `recordACERetrievalTelemetry()`
   - Emit async with fire-and-forget pattern
   - Capture all required fields
4. [ ] Modify `context-assembler.ts` to call emitter at:
   - After vector search (record `vectorHits`)
   - After lexical search (record `trigramHits`)
   - After graph expansion (record `kagNeighbors`)
   - After final selection (record `selectedPacketKey`, `featureIds`, latency)
5. [ ] Test with >10 manual queries
6. [ ] Verify telemetry recorded to Postgres

**Success criteria**:
- [ ] At least 10 telemetry records in DB
- [ ] `retrievalStrategy` field populated for each
- [ ] `selectedPacketKey` captured when available
- [ ] `vectorHits + trigramHits > 0` for hybrid queries
- [ ] `latencyMs` within reasonable range (100-5000ms)

### Phase 3D.2: Hybrid Search Instrumentation (NEXT WEEK)

**Tasks**:
1. [ ] Check if hybrid-search is called separately or only via ACE
2. [ ] If called directly, add telemetry at exit point
3. [ ] If called only via ACE, merge into ACE emitter
4. [ ] Wire `chooseRetrievalMode()` result to `retrievalStrategy`
5. [ ] Emit hit counts per lane (vector/lexical/Neo4j separately)

**Success criteria**:
- [ ] Hybrid search mode selection visible in telemetry
- [ ] Hit counts attributed to correct lane

### Phase 3D.3: RAG Pipeline Instrumentation (OPTIONAL)

**Tasks**:
1. [ ] Verify if RAG pipeline is still active
2. [ ] If yes, add telemetry at pipeline exit
3. [ ] If integrated into ACE, merge into ACE emitter

**Success criteria**:
- [ ] All active retrieval code paths emit telemetry

### Phase 3D.4: Baseline Collection & Summary (2-WEEK MARK)

**Tasks**:
1. [ ] Run dev server for 2 weeks
2. [ ] Accumulate >1,000 queries
3. [ ] Create `retrieval-telemetry-summary.md`
   - Distribution of retrieval strategies
   - Average latency per strategy
   - Cache hit rate
   - Vector vs lexical hit ratio
   - Feature distribution in selected results
4. [ ] Identify "hot" vs "warm" vs "cold" query patterns
5. [ ] Flag if NESCHROM97 fallback (cold_neschrom) is ever used

**Success criteria**:
- [ ] Summary report with ≥1,000 data points
- [ ] Clear visibility into which retrieval strategies are used
- [ ] Evidence for/against promoting cold cards

---

## Field Mapping

### Emission Points → Schema Fields

```
ACE Entry:
  query → RetrievalTelemetrySignal.query
  <timestamp> → retrieval_telemetry.created_at (auto)

During Retrieval:
  (vector search hits) → vectorHits
  (FTS hits) → trigramHits
  (Neo4j results) → ftsHits (repurposed for graph hits)

After Selection:
  (top packet_key) → selectedPacketKey
  (all feature_ids) → featureIds
  (top feature_id) → selectedFeatureId
  (vector score) → fusionScore (or custom GPU score)

Mode Detection:
  chooseRetrievalMode() → retrievalStrategy
  (If Neo4j only) → 'structural_only'
  (If Qdrant + Postgres) → 'fusion'
  (If fallback to NESCHROM97) → 'cold_neschrom'

Surface & Environment:
  Caller context → surface ('ace', 'api', 'cli', ...)
  ENV.NODE_ENV → environment ('development', 'production')

Timing:
  Date.now() at entry → timestamp
  Date.now() at exit → latencyMs = exit - entry
  Redis cache state → cacheHit (true/false)
```

---

## Hard Rules (User Explicit)

1. **Fire-and-forget always**: Telemetry failure NEVER blocks query execution
2. **No retrospective mutations**: Only emit at decision point, not after LLM sees context
3. **Collect baseline BEFORE policy**: Must have >1,000 real queries before making cache/cold-card decisions
4. **NESCHROM97 cold cards stay out**: No Qdrant/Neo4j promotion until telemetry proves demand
5. **Strategy field is CRITICAL**: Every signal must include `retrievalStrategy` — this is the key that unlocks Phase 3F/3G decisions

---

## Success Metrics

By end of Phase 3D (2 weeks):

| Metric | Target | Reason |
|--------|--------|--------|
| Total queries captured | ≥1,000 | Baseline statistical significance |
| `retrievalStrategy` populated | 100% | Every query tagged with strategy |
| `selectedPacketKey` hits | ≥70% | Show that canonical packets are being selected |
| `vectorHits > 0` | ≥80% | Show vector search is active |
| `trigramHits > 0` | ≥60% | Show lexical search has hits (optional fallback) |
| `latencyMs < 5000ms` | ≥95% | Performance within bounds |
| Cold (NESCHROM97) strategy usage | ≤5% | Verify cold lane is emergency fallback only |

---

## Next Steps

**Immediate (today)**:
1. Create `ace-telemetry-emitter.ts`
2. Wire first instrumentation into context assembler
3. Test with 5 manual queries

**This week**:
1. Accumulate 50+ test queries
2. Verify all fields populated correctly
3. Check for any telemetry failures in logs
4. Adjust emitter as needed

**Next week**:
1. Instrument hybrid-search
2. Start baseline collection
3. Generate first summary

---

## References

- Schema: `src/lib/server/db/schema/retrieval-telemetry.ts`
- Recorder: `src/lib/server/telemetry/retrieval-recorder.ts`
- ACE assembler: `src/lib/server/features/ai/ace/context-assembler.ts` (line 1273)
- Hybrid search: `src/lib/server/search/hybrid-search.ts`
- User guidance: Session 2026-06-11, Messages 10-12
- Architecture reframe: `docs/reports/neschrom97-architecture-reframe.md`
- Phase progression: `docs/reports/phase-3d-3e-progression.md`

---

**DO NOT SKIP TO PHASE 3F/3G**: Cache policy and Neo4j promotion decisions depend entirely on this telemetry baseline. Jumping ahead risks false canonicalization of NESCHROM97 derived artifacts.
