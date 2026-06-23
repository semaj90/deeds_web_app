# Parent Atlas — Metadata Searchability Next Steps

**Date**: 2026-06-23T22:00:00.000Z  
**Decision**: Finish P3g backfill THEN apply metadata normalization  
**Action Items Ordered by Priority**

---

## Critical Finding: Qdrant Payloads Already Synced

Phase 1 audit reveals:
- ✅ **packet_key**: Present in 100% of Qdrant vectors
- ✅ **source_ref**: Present in 100% of Qdrant vectors  
- ✅ **qdrant_point_id**: Present in 100% of Qdrant vectors
- ✅ **community_id**: Present in 90% of Qdrant vectors
- ⚠️ **feature_id**: Present in 80% (camelCase `featureId` in 10%)

**Issue**: Field names are **inconsistent** (both `packet_key` and `packetKey` exist in same payload). Qdrant filter queries can't rely on snake_case.

**Root cause**: Historical payloads use camelCase (legacy Qdrant upserts), newer backfill uses snake_case (P3g). Both coexist in same collection.

**Impact**: Filter queries FAIL if they reference only snake_case — 20% of vectors have ONLY camelCase.

---

## 65-Minute Completion Path (Revised)

### Phase 1: Qdrant Payload Normalization (25 min)
**Goal**: Convert all camelCase field names to snake_case

**Scope**: `codebase_chunks_768` collection (52,606 points)

**Algorithm**:
```
For each point in codebase_chunks_768:
  - Rename: packetKey → packet_key (delete old if exists)
  - Rename: sourceRef → source_ref
  - Rename: featureId → feature_id
  - Rename: featureLabel → feature_label
  - Rename: featureIds → feature_id (dedupe)
  - Rename: qdrantPointId → qdrant_point_id
  - Rename: communityId → community_id
  - Rename: sourceRefs → source_ref (dedupe)
  - Rename: somRow → som_row
  - Rename: somCol → som_col
  - Keep: packet_key, source_ref, feature_id (already snake_case, no-op)
```

**Script**: `scripts/atlas/normalize-qdrant-payloads.mjs`

**Implementation**:
```bash
# Dry-run (count affected points)
node scripts/atlas/normalize-qdrant-payloads.mjs --dry-run --collection codebase_chunks_768

# Apply (batch: 500 points, 4 workers, progress every 100)
node scripts/atlas/normalize-qdrant-payloads.mjs --apply --collection codebase_chunks_768

# Verify (spot-check 20 random points)
node scripts/atlas/verify-qdrant-normalization.mjs --collection codebase_chunks_768 --sample 20
```

**Exit Criterion**: All 52,606 points have snake_case field names, no camelCase variants remain

**ETA**: 25 min (5 min scan + 15 min upsert + 5 min verify)

---

### Phase 2: Qdrant Payload Indexes (15 min)
**Goal**: Create hashmap indexes on normalized fields for O(1) filter lookup

**Fields to index**:
1. `packet_key` — for source-of-truth joins
2. `source_ref` — for file-path resolution
3. `feature_id` — for feature-scoped retrieval
4. `community_id` — for community-scoped ranking
5. `som_cluster` — for topology-aware reranking

**Commands**:
```bash
# Create 5 indexes (idempotent)
for field in packet_key source_ref feature_id community_id som_cluster; do
  curl -X PUT "http://localhost:6333/collections/codebase_chunks_768/index" \
    -H "Content-Type: application/json" \
    -d "{\"field_name\":\"$field\",\"field_schema\":\"Keyword\"}"
done

# Verify all 5 indexes exist
curl -s "http://localhost:6333/collections/codebase_chunks_768" | \
  jq '.result.payload_schema.fields | with_entries(select(.value.type == "Keyword"))'
```

**Exit Criterion**: 5 indexes created, Qdrant status GREEN

**ETA**: 15 min (5 min create + 5 min verify + 5 min buffer)

---

### Phase 3: Query Validation (15 min)
**Goal**: Verify metadata-filtered retrieval works and is fast

**Test queries**:
```typescript
// Test 1: Vector ANN only (baseline)
const start1 = Date.now();
const results1 = await qdrant.search({
  collection: 'codebase_chunks_768',
  vector: testEmbedding,
  limit: 100
});
const latency1 = Date.now() - start1;  // Should be ~40-50ms

// Test 2: ANN + packet_key filter
const start2 = Date.now();
const results2 = await qdrant.search({
  collection: 'codebase_chunks_768',
  vector: testEmbedding,
  query_filter: { must: [{ key: 'packet_key', match: { value: 'ace:packet:*' } }] },
  limit: 100
});
const latency2 = Date.now() - start2;  // Should be ~40-50ms (no overhead if indexed)

// Test 3: ANN + feature_id filter
const start3 = Date.now();
const results3 = await qdrant.search({
  collection: 'codebase_chunks_768',
  vector: testEmbedding,
  query_filter: { must: [{ key: 'feature_id', match: { value: 'auth.sessions' } }] },
  limit: 100
});
const latency3 = Date.now() - start3;

// Assertions
assert(results1.length > 0, 'ANN returns results');
assert(results2.length > 0, 'Filtered results exist');
assert(results3.length > 0, 'Feature filter works');
assert(latency2 < latency1 * 1.1, 'Filter adds <10% latency');  // Index is working
assert(results2.length < results1.length, 'Filter reduces result count');
```

**Script**: `scripts/atlas/validate-metadata-queries.mjs`

**Commands**:
```bash
# Run validation (5 iterations, report aggregated stats)
node scripts/atlas/validate-metadata-queries.mjs --iterations 5 --report

# Output: docs/reports/metadata-query-validation.json
```

**Exit Criterion**: All 5 query types succeed, filter latency <10% overhead, results are reduced by filters

**ETA**: 15 min (2 min setup + 5 min queries + 5 min reporting + 3 min buffer)

---

### Phase 4: Cascading Backfill Prep (10 min)
**Goal**: Document next collections to normalize (enable P4 to proceed in parallel)

**Collections to normalize after Phase 1-3**:
1. `documents_atlas_768` — 6,515 points
2. `glyph_atlas` — 1,336 points
3. `summary_cards_768` — 4,654 points
4. `kb_notecards` — 2,298 points
5. `legal_documents` — 9,840 points

**Action**: Create a backlog script template for each collection:
```bash
# Template
node scripts/atlas/normalize-qdrant-payloads.mjs --apply --collection {NAME} &
```

**Parallel execution** (can run after Phase 3 validates first collection):
```bash
# All 5 in parallel (one worker per collection)
for collection in documents_atlas_768 glyph_atlas summary_cards_768 kb_notecards legal_documents; do
  node scripts/atlas/normalize-qdrant-payloads.mjs --apply --collection $collection &
done
wait
```

**Exit Criterion**: Backlog documented, Phase 1-3 complete, ready for parallel Phase 4 lanes

**ETA**: 10 min (5 min scripting + 5 min documentation)

---

## Total Time Breakdown

| Phase | Activity | Duration | Cumulative |
|-------|----------|----------|-----------|
| **1** | Normalize payloads (52.6K points) | 25 min | 25 min |
| **2** | Create 5 indexes + verify | 15 min | 40 min |
| **3** | Query validation + reporting | 15 min | 55 min |
| **4** | Document backlog + prep parallel | 10 min | **65 min** |

---

## Success Criteria (All Required to Proceed)

### Phase 1 Success
- ✅ All 52,606 points have snake_case field names
- ✅ No camelCase (`packetKey`, `sourceRef`, etc.) variants remain
- ✅ Spot-check: 20 random points verified

### Phase 2 Success
- ✅ 5 indexes created (packet_key, source_ref, feature_id, community_id, som_cluster)
- ✅ Qdrant collection status GREEN
- ✅ Index list confirmed via API

### Phase 3 Success
- ✅ All 5 query types succeed without errors
- ✅ Filter latency < 10% overhead on indexed fields
- ✅ Results are reduced by filters (not all returned)
- ✅ Validation report created and attached to memory

### Phase 4 Success
- ✅ Backlog documented for remaining 5 collections
- ✅ Parallel execution script ready
- ✅ ETA: 120+ min for all 7 collections (can parallelize 5 at once)

---

## After P3g Backfill Completes

Once P3g embedding backfill finishes (projected ~12:50 UTC today):

1. **Verify P3g added all qdrant_point_ids**: `SELECT COUNT(DISTINCT qdrant_point_id) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL;` (should be ≈17,995 or higher if additional packets backfilled)

2. **Run Phase 1-4 metadata fix** (65 min total)

3. **Repeat for secondary collections** (120+ min parallel)

4. **Proceed to P4 GPU Authority Blend**:
   - PageRank now has complete metadata for ranking
   - Attention scores can filter by feature_id/community_id
   - Karpathy blend: 0.4·PR + 0.3·attn + 0.3·authority operational

---

## Rollback Plan (If Needed)

**Phase 1 rollback**: Query Qdrant audit snapshot (Phase 0, baseline saved). Restore camelCase variants if normalization corrupts data (rare, but possible if partial upsert).

**Phase 2 rollback**: Drop indexes (no data loss).
```bash
curl -X DELETE "http://localhost:6333/collections/codebase_chunks_768/index/packet_key"
# Repeat for other 4 indexes
```

**Phase 3 rollback**: No action needed (validation is read-only).

**Phase 4 rollback**: Skip backlog prep, restart Phase 1 for next collection.

---

## Next Immediate Action

**When ready**:
```bash
# Check P3g backfill status
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as qdrant_backed_packets FROM atlas_packets WHERE qdrant_point_id IS NOT NULL;"

# If result ≈17,995 or higher:
# → Proceed to Phase 1
node scripts/atlas/normalize-qdrant-payloads.mjs --dry-run --collection codebase_chunks_768
```

---

**Planned Start Time**: After P3g backfill confirms complete (estimated 12:50 UTC today)  
**Risk Level**: LOW (additive normalization, easy rollback)  
**Blocking Issues**: None — can start anytime after P3g backfill is done  
**Owner**: Automation (65 min unattended)
