# Phase 102+ Execution: Stage A0 → Priority 4 Complete Roadmap

**Date**: July 2, 2026 23:55 UTC  
**Status**: ✅ **STAGE A0 OPERATIONAL + PRIORITY 4 PLAN READY FOR SEQUENTIAL EXECUTION**

---

## 📊 Current State Summary

### Phase 7 (Summarization) — IN PROGRESS
```
📈 Postgres: 8,780 / 40,754 summarized (21.5%)
📋 RabbitMQ: 0 messages pending (4 workers active)
⏱️  ETA: ~19 hours remaining
🎯 Throughput: ~555 summaries/hour (sustainable)
```

### Stage A0 Envelope Assembly — WIRED & READY
```
✅ Hot bucket check: ~5–20ms (lines 909–965)
✅ Envelope assembly: Postgres rows → canonical shape (lines 1035–1054)
✅ Direct emission: Converted to RPC shape, fusion_score=1.0 (lines 1075–1124)
✅ Scope binding: potentialLanguage/potentialKind available (lines 893–895)
⏳ Activation: After Phase 7 → Hot bucket population → Testing → Active
```

### Priority 4 (Retrieval Lanes) — PLANNED & DOCUMENTED
```
📋 Phase 4A RRF: 1.5 hours (packetSeedCandidatesFromRrf)
📋 Phase 4B Qdrant: 2.0 hours (search payload extraction)
📋 Phase 4C Neo4j: 2.0 hours (graph neighbors + topology)
📋 Integration: 1.0 hour (cross-lane parity testing)
⏳ Total: 6.5 hours sequential
🎯 Goal: All lanes emit identical CanonicalAcePacketEnvelope shape
```

---

## 🚀 Execution Roadmap

### NOW (Immediately)
**Action**: Continue Phase 7 uninterrupted. Monitoring overhead minimal.

**Commands**:
```bash
# Monitor Phase 7 progress (run every 2–3 hours)
npm run atlas:phase102:step7:rabbitmq:monitor
```

**Expected Output**:
```
📊 Phase 7 Progress Monitor
  📈 Postgres: 8780/40754 summarized (22%)
  📋 RabbitMQ queue: 0 messages pending
  ⏱️  Remaining: 31974 chunks
```

**Acceptance Criteria**:
- ✅ Queue depth stays at 0 (workers consuming faster than producing)
- ✅ Progress increments by 300–600 summaries per hour
- ✅ No error messages in worker logs
- ✅ If rate drops below 10/min, investigate worker health

---

### AFTER Phase 7 Completes (~19h from now)

#### Step 1: Warm Hot Buckets (5–10 minutes)

**Phase 7 done when**: Postgres shows 40,754 summarized

**Action**: Populate BitFrost hot buckets from summarized packets

```bash
# Preview (dry-run)
cd sveltekit-frontend
npm run atlas:phase102:step8:hot-buckets:dry

# Expected output:
#   🔥 Phase 8: BitFrost Hot Bucket Bulk Population [DRY-RUN]
#   📦 Step 1: Fetch summarized packets from Postgres...
#   ✓ Fetched 40754 summarized packets
#   📊 Step 2: Build hot bucket operations...
#   ✓ Built XXXX hot buckets
#   Language: NNN
#   Kind: MMM
#   Feature: KKK
```

**Action**: Apply (execute real writes)

```bash
npm run atlas:phase102:step8:hot-buckets:apply

# Expected output:
#   🔥 Phase 8: BitFrost Hot Bucket Bulk Population [APPLY]
#   ...
#   🔥 Step 4: Populating hot buckets in Redis...
#   ✓ Written XXXXX packet references to hot buckets
#   ✅ Step 5: Verification...
#   ✓ Language buckets: NNN
#   ✓ Kind buckets: MMM
#   ✓ Feature buckets: KKK
#   ✓ Sample (bitfrost:hot:language:typescript): NNN packets
#   ✅ Phase 8: BitFrost hot bucket population complete
```

**Acceptance Criteria**:
- ✅ Language/kind/feature buckets created
- ✅ Redis key counts > 0
- ✅ Sample bucket membership verified
- ✅ All 3 bucket types populated

---

#### Step 2: Test Stage A0 Cache Operationality (10–15 minutes)

**Action**: Query with feature/language/kind to trigger Stage A0 cache hits

```bash
# Example: Query via the retrieval endpoint
curl -X POST http://localhost:5173/api/retrieval/unified \
  -H "Content-Type: application/json" \
  -d '{
    "q": "authentication session",
    "language": "typescript",
    "kind": "function"
  }'
```

**Expected Response** (with Stage A0 cache hit):
```json
{
  "candidates": [
    {
      "packet_id": "ace:packet:auth:001",
      "packet_ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "title_id": "abc-123",
      "packet_key": "ace:packet:auth:001",
      "fusion_score": 1.0,
      "traces": [
        {
          "stage": "A0",
          "source": "bitfrost:hot:language:typescript",
          "timing": "12.5ms",
          "confidence": 0.99
        }
      ]
    }
  ],
  "stages_completed": ["A0"]
}
```

**Verification Checklist**:
- ✅ `stageA0CacheEnvelopes.size > 0` in logs
- ✅ Packets emitted with `fusion_score: 1.0`
- ✅ Trace shows `"stage": "A0"`
- ✅ Timing shows 5–20ms (BitFrost cache hit)
- ✅ `packet_id`, `title_id` present and non-null
- ✅ No shape divergence vs non-cached results

**Console Log Indicators**:
```
[hyperrag-packet-rpc] Stage A0 cache hit: NN packets in 12.5ms (source: bitfrost:hot:language:typescript)
[hyperrag-packet-rpc] Built NN canonical envelopes for Stage A0 cache hits (source: bitfrost:hot:language:typescript)
```

---

#### Step 3: Execute Priority 4 — Retrieval Lane Updates (6.5 hours sequential)

**Why sequential?** Each lane depends on understanding the canonical envelope shape. Testing each independently prevents cross-contamination.

##### Phase 4A: RRF Lane Update (1.5 hours)

**File**: `src/lib/server/retrieval/hyperrag-packet-rpc.ts`  
**Function**: `packetSeedCandidatesFromRrf()` (line 264)

**Current behavior**:
- Takes RRF result rows
- Extracts metadata fields
- Returns seed shape: `{ stable_key, source_refs, packet_key, metadata, kind: 'rrf' }`

**Target behavior**:
- Load Postgres rows via `loadAtlasPacketsByIdentity(source_refs)`
- For each RRF result, find matching Postgres row
- Call `buildCanonicalAcePacketEnvelope(row, context)` with context including:
  - `page_rank_score: row.rrf_combined_score` (from RRF fusion)
  - `language`, `kind` from RRF metadata
- Return array of canonical envelopes (NOT seeds)

**Implementation Checklist**:
- [ ] Update function signature to return `CanonicalAcePacketEnvelope[]`
- [ ] Add `loadAtlasPacketsByIdentity()` call after RRF extraction
- [ ] Build context object with page_rank_score from RRF fusion
- [ ] Call `buildCanonicalAcePacketEnvelope()` for each result
- [ ] Test with `npm run test:retrieval:rrf:unit`
- [ ] Verify shape matches Stage A0 envelopes
- [ ] Check that `packet_id`, `title_id` are preserved

**Expected Impact**:
- RRF lane now emits canonical shape
- packet_id/title_id explicit and preserved
- Downstream ACE merge becomes deterministic

---

##### Phase 4B: Qdrant Search Update (2 hours)

**File**: `src/lib/server/retrieval/hyperrag-packet-rpc.ts`  
**Function**: `searchCodeLexicalBounded()` or direct Qdrant call (lines ~978–1021)

**Current behavior**:
- Searches Qdrant for vectors
- Extracts payload fields (feature_id, source_ref)
- Returns metadata shape

**Target behavior**:
- After Qdrant `.search()` returns points
- Extract point metadata (source_ref, packet_key)
- Load Postgres rows via `loadAtlasPacketsByIdentity(sourceRefs)`
- For each point, call `buildCanonicalAcePacketEnvelope(row, context)` with context including:
  - `page_rank_score: point.score * 0.5` (normalize Qdrant cosine score)
  - `embedding_model: point.metadata.embedding_model`
- Return canonical envelopes

**Implementation Checklist**:
- [ ] Update Qdrant search wrapper to return canonical envelopes
- [ ] Extract source_ref from Qdrant payload
- [ ] Load Postgres rows for all Qdrant points
- [ ] Normalize cosine similarity to page_rank_score
- [ ] Build context object with embedding metadata
- [ ] Test with `npm run test:retrieval:qdrant:unit`
- [ ] Verify no payload extraction errors
- [ ] Cross-check shape vs RRF (should be identical)

**Expected Impact**:
- Qdrant lane emits canonical shape
- Vector scores threaded as page_rank_score
- All lanes now compatible

---

##### Phase 4C: Neo4j Expansion Update (2 hours)

**File**: `src/lib/server/retrieval/hyperrag-packet-rpc.ts`  
**Function**: `expandNeighbours()` / Neo4j traversal (lines ~1089–1092)

**Current behavior**:
- Queries Neo4j for neighbors
- Returns node IDs or minimal shapes
- Caller extracts metadata

**Target behavior**:
- After Cypher query returns neighbors
- Extract neighbor node IDs/identifiers
- Load Postgres rows via `loadAtlasPacketsByIdentity(neighborRefs)`
- For each neighbor, call `buildCanonicalAcePacketEnvelope(row, context)` with context including:
  - `page_rank_score: row.pagerank_score` (from Neo4j GDS)
  - `som_cell: row.som_cell` (if available)
- Return canonical envelopes

**Implementation Checklist**:
- [ ] Update Neo4j expansion to return canonical envelopes
- [ ] Extract neighbor refs from Cypher result
- [ ] Load Postgres rows for all neighbors
- [ ] Thread pagerank_score and topology metadata
- [ ] Test with `npm run test:retrieval:neo4j:unit`
- [ ] Verify neighborhood expansion depth
- [ ] Cross-check shape vs RRF + Qdrant

**Expected Impact**:
- Neo4j expansion emits canonical shape
- Topology metadata preserved throughout
- No downstream shape divergence

---

##### Integration Testing (1 hour)

**Action**: Run unified retrieval with all lanes active

```bash
# Query that triggers all three lanes
npm run test:retrieval:all-lanes:unified

# Expected behavior:
# 1. Stage A0 cache check (BitFrost)
# 2. RRF lane returns canonical envelopes
# 3. Qdrant lane returns canonical envelopes
# 4. Neo4j lane returns canonical envelopes
# 5. ACE assembler receives identical shapes
# 6. Unified rank produces final order
```

**Verification Checklist**:
- [ ] All lanes return identical 10-field envelope shape
- [ ] packet_id/title_id consistent across lanes
- [ ] No type mismatches in RPC validator
- [ ] ACE merge is deterministic
- [ ] Trace metadata captures all 3 lanes
- [ ] No performance degradation (<100ms full retrieval)
- [ ] Fallback chains work (if one lane fails, others succeed)

---

## 📋 Files Involved

| File | Lines | Component |
|------|-------|-----------|
| `hyperrag-packet-rpc.ts` | 1035–1054 | Stage A0 envelope assembly |
| `hyperrag-packet-rpc.ts` | 1075–1124 | Direct emission (high-priority cache hits) |
| `hyperrag-packet-rpc.ts` | 893–895 | Scope binding (query intent signals) |
| `phase8-bitfrost-hot-buckets-bulk.mjs` | 1–270 | Hot bucket population script |
| `canonical-packet-builder.ts` | — | `buildCanonicalAcePacketEnvelope()` function |
| `SESSION-102-PRIORITY-4-LANE-UPDATES.md` | 1–283 | Comprehensive lane update reference |

---

## ⏱️ Timeline Estimate

| Phase | Duration | Cumulative | Status |
|-------|----------|-----------|--------|
| Phase 7 (ongoing) | 19h | 19h | 🔄 In progress |
| Hot bucket population | 5–10 min | 19h 5 min | ⏳ After Phase 7 |
| Stage A0 testing | 10–15 min | 19h 20 min | ⏳ After Phase 7 |
| **Priority 4A (RRF)** | 1.5h | 20h 50 min | 📋 Planned |
| **Priority 4B (Qdrant)** | 2h | 22h 50 min | 📋 Planned |
| **Priority 4C (Neo4j)** | 2h | 24h 50 min | 📋 Planned |
| **Integration testing** | 1h | 25h 50 min | 📋 Planned |
| **COMPLETE** | — | 25h 50 min | 🎯 Goal |

**Total execution time**: ~26 hours (Phase 7 + Stage A0 + Priority 4)

---

## 🎯 Success Criteria

### Pre-Launch
- ✅ Stage A0 infrastructure wired (envelope assembly, direct emission)
- ✅ Hot bucket population script ready
- ✅ Priority 4 plan documented with implementation details
- ✅ All npm scripts registered

### Post-Execution
- ✅ All retrieval lanes emit `CanonicalAcePacketEnvelope`
- ✅ No shape divergence across RRF, Qdrant, Neo4j
- ✅ packet_id/title_id preserved end-to-end
- ✅ Stage A0 cache hits: 5–20ms latency
- ✅ Full retrieval without cache: <100ms latency
- ✅ Deterministic ACE assembly (no lossy merge)
- ✅ All traces show canonical stage + timing info

---

## 🚨 Risk & Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Phase 7 worker crash | Low | Monitor queue; add 4th worker if needed |
| Hot bucket population incomplete | Low | Dry-run first; verify Postgres row count |
| Stage A0 cache miss in production | Low | Fallback to RRF/Qdrant seamless (no error) |
| Priority 4 RRF refactor breaks seeds | Medium | Test independently; revert if needed |
| Cross-lane shape mismatch | Low | Integration test before marking complete |
| Performance regression | Low | Monitor latency; compare vs baseline |

---

## 📞 Escalation Path

**If Phase 7 stalls** (rate drops <10/min):
1. Check worker logs: `docker logs <worker-container>`
2. Verify RabbitMQ connection: `npm run atlas:phase102:step7:rabbitmq:produce --status`
3. Restart workers if needed
4. Add 4th worker: `npm run atlas:phase102:step7:rabbitmq:worker:4`

**If hot bucket population fails**:
1. Verify Postgres query: `SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL AND LENGTH(summary) > 10`
2. Check Redis connection: `redis-cli PING`
3. Run dry-run again to diagnose: `npm run atlas:phase102:step8:hot-buckets:dry --verbose`

**If Stage A0 cache test shows no hits**:
1. Verify hot bucket keys exist: `redis-cli KEYS 'bitfrost:hot:*' | wc -l`
2. Check sample bucket: `redis-cli SMEMBERS 'bitfrost:hot:language:typescript' | head`
3. If empty, re-run hot bucket population with full count

**If Priority 4 lane breaks**:
1. Test independently: `npm run test:retrieval:<lane>:unit`
2. Revert to previous commit if catastrophic
3. Debug shape mismatch: compare enum fields vs canonical envelope

---

**Status**: ✅ **READY FOR EXECUTION**  
**Next Checkpoint**: Phase 7 completion → Hot bucket population → Stage A0 testing → Priority 4 sequential execution  
**Long-term Goal**: Unified retrieval pipeline, deterministic packet envelope, explicit lineage end-to-end
