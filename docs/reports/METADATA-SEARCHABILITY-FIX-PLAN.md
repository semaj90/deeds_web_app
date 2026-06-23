# Metadata Searchability Fix Plan — 4 Phases, 65 Minutes
**Date**: 2026-06-23T21:45:00.000Z  
**Goal**: Make Qdrant vectors searchable by Postgres identity metadata  
**Status**: READY TO EXECUTE

---

## Current State (Verified Live)

| Store | State | Critical Fields |
|-------|-------|-----------------|
| **Postgres `atlas_packets`** | ✅ COMPLETE | packet_key 100%, source_ref 100%, feature_id 100%, feature_label 100%, qdrant_point_id 100%, community_id 96.7% |
| **Qdrant `codebase_chunks_768`** | ❓ UNKNOWN | Need payload field coverage audit |
| **Valkey** | ✅ OPERATIONAL | 73,685 keys, 8 prefix groups |
| **Neo4j** | 📋 DEFERRED | Can handle after Phase 4 |

**Row counts**: Postgres 17,995 packets, Qdrant 52,606 points (3× Postgres count suggests P3g backfill in progress)

---

## The Fix: Unified Metadata Searchability

**Problem**: Qdrant vectors have points, but Postgres metadata isn't indexed for fast Qdrant payload filtering. Existing query pattern:
```sql
-- Current (SLOW): Postgres → Qdrant loop
SELECT packet_key FROM atlas_packets WHERE feature_id = $1;  -- Get IDs
THEN FOR EACH: Qdrant search by payload filter (NOT vector ANN) -- N queries
```

**Solution**: Qdrant named vectors + indexed payloads enable simultaneous vector ANN + metadata filter:
```typescript
// New (FAST): Single Qdrant ANN + filter
qdrant.search({
  collection: 'codebase_chunks_768',
  vector: queryEmbedding,
  query_filter: { must: [
    { key: 'packet_key', match: { value: $pkey } },
    { key: 'feature_id', range: { gte: 'auth', lte: 'auth' } }
  ]},
  limit: 100
});
```

---

## Phase 1: Qdrant Payload Audit (15 min)
**Goal**: Verify Qdrant payload structure and identify sync gaps

**Actions**:
1. Query top-5 points from `codebase_chunks_768` collection
   ```bash
   curl -s -X POST "http://localhost:6333/collections/codebase_chunks_768/points/scroll" \
     -H "Content-Type: application/json" \
     -d '{"limit":5,"with_payload":true,"with_vectors":false}' | jq '.result.points[0].payload | keys'
   ```

2. Check field coverage across 10-sample random points
   - Verify presence of: packet_key, source_ref, feature_id, qdrant_point_id, community_id
   - Identify missing/null counts
   - Note field name variance (e.g., sourceRef vs source_ref)

3. Validate against Postgres identity (join on qdrant_point_id)
   ```sql
   SELECT 
     qdrant_point_id,
     COUNT(*) as pg_rows,
     json_agg(packet_key) as packet_keys
   FROM atlas_packets
   WHERE qdrant_point_id IS NOT NULL
   GROUP BY qdrant_point_id
   HAVING COUNT(*) > 1;  -- Detect collisions
   ```

4. Create audit report: `docs/reports/qdrant-payload-coverage.json`

**Exit Criterion**: Audit complete, payload structure documented, coverage map created

**ETA**: 15 min

---

## Phase 2: Payload Sync Backfill (20 min)
**Goal**: Backfill Qdrant payloads with missing Postgres identity fields

**Actions**:
1. Identify sync gaps from Phase 1 audit
   - If `packet_key` missing in Qdrant: backfill from Postgres via qdrant_point_id join
   - If `feature_id` missing: backfill
   - If `source_ref` missing: backfill
   - If naming mismatch (sourceRef vs source_ref): normalize to snake_case

2. Create backfill script: `scripts/atlas/sync-qdrant-payloads.mjs`
   ```typescript
   // Pseudocode
   for (const pgPacket of pgPackets where qdrant_point_id IS NOT NULL) {
     const qdrantUpdate = {
       packet_key: pgPacket.packet_key,
       source_ref: pgPacket.source_ref,
       feature_id: pgPacket.feature_id,
       feature_label: pgPacket.feature_label,
       community_id: pgPacket.community_id,
       qdrant_point_id: pgPacket.qdrant_point_id
     };
     qdrant.upsert({
       collection: pgPacket.qdrant_collection,
       points: [{
         id: pgPacket.qdrant_point_id,
         payload: qdrantUpdate
       }]
     });
   }
   ```

3. Execute backfill (batch size: 500 packets, 4 parallel workers)
   - Dry-run first to count affected rows
   - Apply with progress reporting every 100 packets

4. Validate: Spot-check 10 random Qdrant points to verify payload sync

**Exit Criterion**: Qdrant payloads synced, all identity fields present, naming normalized

**ETA**: 20 min

---

## Phase 3: Qdrant Index Creation (15 min)
**Goal**: Add hashmap indexes on payload fields for O(1) filter lookup

**Actions**:
1. Create indexes on key payload fields (hashmap index type):
   ```bash
   curl -X PUT "http://localhost:6333/collections/codebase_chunks_768/index" \
     -H "Content-Type: application/json" \
     -d '{
       "field_name": "packet_key",
       "field_schema": "Keyword"
     }'
   
   # Repeat for: source_ref, feature_id, qdrant_point_id, community_id
   ```

2. Verify index creation:
   ```bash
   curl -s "http://localhost:6333/collections/codebase_chunks_768" | jq '.result.payload_schema.fields | keys'
   ```

3. Create index verification report: `docs/reports/qdrant-index-status.json`

**Exit Criterion**: 5 indexes created and verified operational

**ETA**: 15 min

---

## Phase 4: Query Validation & Performance Baseline (15 min)
**Goal**: Verify metadata searchability and measure performance improvement

**Actions**:
1. Run 5 baseline queries WITHOUT metadata filter:
   ```typescript
   // Query 1: Vector ANN only
   const start = Date.now();
   const results = await qdrant.search({
     collection: 'codebase_chunks_768',
     vector: queryVec,
     limit: 100
   });
   const nnTime = Date.now() - start;  // Baseline
   ```

2. Run 5 queries WITH metadata filter:
   ```typescript
   // Query 2: Vector ANN + metadata filter
   const start = Date.now();
   const results = await qdrant.search({
     collection: 'codebase_chunks_768',
     vector: queryVec,
     query_filter: { must: [
       { key: 'feature_id', match: { value: 'auth.sessions' } }
     ]},
     limit: 100
   });
   const filteredTime = Date.now() - start;  // With filter
   ```

3. Measure improvements:
   - Filter latency overhead (should be <10% if index working)
   - Result count reduction (should be >80% if data distributed)
   - Verify no collisions or missing identity fields in results

4. Create validation report: `docs/reports/metadata-searchability-validation.json`
   ```json
   {
     "phase": 4,
     "queries_tested": 5,
     "avg_nn_latency_ms": 42,
     "avg_filtered_latency_ms": 45,
     "filter_overhead_pct": 7.1,
     "avg_result_reduction_pct": 85.3,
     "collisions_found": 0,
     "payload_sync_verified": true,
     "indexes_operational": 5,
     "ready_for_production": true
   }
   ```

**Exit Criterion**: All 5 queries pass, indexes operational, <10% filter overhead, validation report created

**ETA**: 15 min

---

## Expected Outcomes

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Metadata search latency** | N/A (no filter support) | 45ms | 🚀 ENABLED |
| **Result precision** | 0% (no filtering) | 85%+ (filtered to feature_id) | 85%+ |
| **False positives** | 100% (all vectors returned) | <15% | 85%+ reduction |
| **Identity field sync** | Postgres only | Postgres + Qdrant | ✅ Unified |
| **Query flexibility** | Vector ANN only | Vector ANN + metadata filter | 🚀 HYBRID |

---

## Commands Reference

**Execute Phase 1-4**:
```bash
# Phase 1: Audit (run manually, inspects output)
node scripts/atlas/audit-qdrant-payloads.mjs --report

# Phase 2: Sync (DRY-RUN first)
node scripts/atlas/sync-qdrant-payloads.mjs --dry-run
node scripts/atlas/sync-qdrant-payloads.mjs --apply  # Actual backfill

# Phase 3: Index creation (idempotent)
node scripts/atlas/create-qdrant-indexes.mjs

# Phase 4: Validation (read-only)
node scripts/atlas/validate-metadata-searchability.mjs --report
```

---

## Rollback Plan

If any phase fails or regressions detected:

1. **Phase 1 failure**: No-op, restart from audit
2. **Phase 2 failure**: `DELETE FROM atlas_packets WHERE updated_at > $timestamp` (only affected rows)
3. **Phase 3 failure**: Drop indexes, redo
4. **Phase 4 failure**: Indexes remain but query logic unchanged; revert to vector-only ANN

All changes are additive (indexes don't delete data) — easy rollback.

---

## Success Criteria (All Required)

- ✅ Qdrant payloads synced with Postgres identity fields
- ✅ 5 new indexes created and verified
- ✅ Metadata filters operational (<10% latency overhead)
- ✅ Zero collisions or identity mismatches
- ✅ Validation report shows all gates PASS
- ✅ No cascading failures in dependent systems

---

## Next Steps After Completion

1. **Wire ACE retrieval lane** to use metadata filters: `fetchACPKnowledgeResults()` Stage A0 add query_filter for feature_id/community_id
2. **Update retrieval contract** docs to document new metadata filter support
3. **Backfill remaining Qdrant collections** (documents_atlas_768, glyph_atlas, etc.) with same 4-phase approach
4. **Proceed to P4 GPU Authority Blend** — Phase 2 PageRank now has complete identity metadata for ranking

---

**Estimated Total Time**: 65 minutes  
**Parallel Phases**: None (sequential dependency: 1→2→3→4)  
**Risk Level**: LOW (additive changes, easy rollback)  
**Blocking**: None — can execute immediately
