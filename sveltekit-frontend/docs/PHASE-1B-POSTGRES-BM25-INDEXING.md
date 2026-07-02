# Phase 1B — Postgres GIN tsvector + BM25 Ranking

**Status**: ✅ **BLOCKING PREREQUISITE FOR ACE_PIPELINE_VERSION=3.0.0**  
**Date**: July 1, 2026  
**Scope**: Full-text index codebase_chunk_index with BM25 ranking for legal-query lane RRF fusion

---

## TL;DR (Why This Blocks v3.0.0)

**Problem**: RRF fusion (reciprocal rank fusion) needs **at least 3 ranking signals**:
- ✅ Semantic (Qdrant cosine similarity)
- ✅ AST (graph authority)
- ❌ **Lexical/BM25 (MISSING — Phase 1B solves this)**

Without BM25, RRF can't fuse signals. Without RRF fusion wired, ACE_PIPELINE_VERSION stays at 2.x.

**Solution**: Create Postgres GIN index on full-text `search_vector` (tsvector), compute BM25 scores, enable legal-query lane to use `bm25_score` in RRF calculation.

**Dependency Chain**:
```
Phase 102: weight + summaries (✅ COMPLETE)
  ↓
Phase 1B: Postgres GIN + BM25 (← YOU ARE HERE)
  ↓
RRF Fusion Wiring (next)
  ↓
ACE_PIPELINE_VERSION=3.0.0 ✅
```

---

## What Phase 1B Creates

### Four Postgres Objects

**1. tsvector Column (search_vector)**
```sql
ALTER TABLE codebase_chunk_index
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE(symbol, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(feature_id, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C')
) STORED;
```

**Weighting**: 
- `symbol` → Weight A (highest relevance, 1.0x)
- `feature_id` → Weight B (medium, 0.2x)
- `content` → Weight C (lowest, 0.1x)

**2. GIN Index (full-text search)**
```sql
CREATE INDEX codebase_chunk_index_search_vector_gin
ON codebase_chunk_index USING GIN (search_vector);
```

**Performance**: O(log n) search on 40K+ chunks (instant for legal-query lane)

**3. BM25 Score Column**
```sql
ALTER TABLE codebase_chunk_index
ADD COLUMN bm25_score REAL DEFAULT 0.0;

UPDATE codebase_chunk_index
SET bm25_score = ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', search_vector,
  plainto_tsquery('english', COALESCE(symbol || ' ' || feature_id, '')))
WHERE search_vector IS NOT NULL;
```

**Range**: 0.0 (no match) to ~1.0 (exact match)

**4. BRIN Index (range scans)**
```sql
CREATE INDEX codebase_chunk_index_bm25_brin
ON codebase_chunk_index USING BRIN (bm25_score);
```

**Use**: Fast filtering on score ranges (top-100 by BM25)

---

## How It Powers RRF Fusion

**Before Phase 1B** (incomplete signal set):
```sql
-- Only semantic + AST available
SELECT chunk_id, feature_id,
  ts_rank(search_vector, query) as bm25,        -- ✗ NULL (no index)
  qdrant_similarity as semantic,                -- ✓ available
  graphAuthority                                 -- ✓ available (Phase 103)
FROM codebase_chunk_index
WHERE search_vector IS NOT NULL
ORDER BY (1/rank_bm25 + 1/rank_semantic + 1/rank_ast) DESC;  -- ✗ bm25 missing
```

**After Phase 1B** (complete signal set for RRF):
```sql
-- All 3 signals ready for fusion
SELECT chunk_id, feature_id,
  bm25_score,                                   -- ✓ available (Phase 1B)
  qdrant_similarity,                            -- ✓ available
  graphAuthority                                 -- ✓ available (Phase 103)
FROM codebase_chunk_index
WHERE bm25_score > 0
ORDER BY (1/(k + rank_bm25) + 1/(k + rank_semantic) + 1/(k + rank_ast)) DESC;  -- ✓ RRF ready
```

---

## Execution (4 Phases, ~15-30 min)

### Phase 1: Create tsvector Column
```bash
npm run atlas:phase1b:index:dry
# Preview: tsvector will be created, weighted by symbol/feature_id/content

npm run atlas:phase1b:index:apply --verbose
# Execute: column created, tsvector computed for all 40K+ chunks
```

**Expected**: tsvector_column_created = true

### Phase 2: Create GIN Index
```
# (Automatic within Phase 1B apply)
# Creates codebase_chunk_index_search_vector_gin on search_vector
```

**Expected**: gin_index_created = true

### Phase 3: Compute BM25 Scores
```
# (Automatic within Phase 1B apply)
# Uses ts_rank_cd to score each chunk by frequency + position
```

**Expected**: bm25_scores_computed = 40,754 (total chunks), avg_bm25_score > 0.01

### Phase 4: Create BRIN Index
```
# (Automatic within Phase 1B apply)
# Creates range-scan index on bm25_score for efficient filtering
```

**Expected**: brin_index_created = true

---

## Verification & Proof

**Proof artifact**: `docs/reports/phase-1b-postgres-bm25-index-proof.json`

**Manual verification**:
```sql
-- 1. Check tsvector column exists and is populated
SELECT COUNT(*) as indexed FROM codebase_chunk_index WHERE search_vector IS NOT NULL;
-- Expected: ~40,754 (all chunks indexed)

-- 2. Check GIN index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'codebase_chunk_index_search_vector_gin';
-- Expected: codebase_chunk_index_search_vector_gin

-- 3. Check BM25 scores are computed
SELECT COUNT(*), AVG(bm25_score), MAX(bm25_score) FROM codebase_chunk_index WHERE bm25_score > 0;
-- Expected: count ~40K, avg ~0.1-0.3, max ~1.0

-- 4. Sample search (should return results instantly)
SELECT feature_id, bm25_score FROM codebase_chunk_index
  WHERE search_vector @@ plainto_tsquery('english', 'authentication session')
  ORDER BY bm25_score DESC LIMIT 5;
-- Expected: <50ms query time, 5+ results ranked by BM25
```

---

## Integration with RRF Fusion

**Next step after Phase 1B**:

**RRF Fusion Wiring** (npm run atlas:phase1b:rrf-fusion:wire)
```typescript
// src/routes/api/search/legal-query/+server.ts
const rrf_score = (
  (1 / (k + rank_bm25)) * bm25_weight +           // ← Phase 1B provides bm25_score
  (1 / (k + rank_semantic)) * semantic_weight +   // ← Qdrant provides this
  (1 / (k + rank_authority)) * auth_weight        // ← Phase 103 provides graphAuthority
);
```

---

## Success Criteria

| Gate | Target | Status |
|------|--------|--------|
| tsvector column created | YES | ⏳ |
| GIN index created | YES | ⏳ |
| BM25 scores computed | 40,754 chunks | ⏳ |
| Average BM25 score | > 0.01 | ⏳ |
| BRIN index created | YES | ⏳ |
| Sample search latency | < 100ms | ⏳ |
| RRF fusion signal ready | YES | ⏳ |

---

## Why This Matters

### Before Phase 1B
- RRF fusion incomplete (2 signals instead of 3)
- Legal-query lane uses semantic only (misses lexical matches)
- Search results favor dense vectors over exact term matches

### After Phase 1B
- RRF fusion complete (3 signals: BM25 + semantic + authority)
- Legal-query lane fuses all signals (terms + concepts + authority)
- Search results balanced across lexical/semantic/authority

### Impact on ACE_PIPELINE_VERSION
```
v2.x: semantic only (Qdrant)
v3.0.0: semantic + BM25 + authority (RRF fusion) ← Phase 1B enables this
v4.0: semantic + BM25 + authority + cross-encoder rerank (Phase 3)
```

---

## Dependency Chain: Phase 102 → Phase 1B → Phase 103 → v3.0.0

```
Phase 102 (weight + summaries) ✅ COMPLETE
  └─ Delivers: code_features.weight, code_features.summary
  └─ Enables: Phase 1B scoring, cross-encoder context

Phase 1B (Postgres BM25) ← YOU ARE HERE
  └─ Delivers: bm25_score column, GIN index, RRF signal ready
  └─ Enables: RRF fusion wiring, legal-query lane
  └─ Blocks: ACE_PIPELINE_VERSION=3.0.0

Phase 103 (Qdrant payload sync) [PARALLEL]
  └─ Delivers: graphAuthorityScore in Qdrant, weight factors
  └─ Enables: RTT elimination, Qdrant-only scoring
  └─ Blocks: 4D-aware RRF (needs manifold4 from Phase 104)

RRF Fusion Wiring [AFTER 1B + 103]
  └─ Delivers: 3-signal fusion (BM25 + semantic + authority)
  └─ Enables: ACE_PIPELINE_VERSION=3.0.0

ACE_PIPELINE_VERSION=3.0.0 ✅ [FINAL]
  └─ Requires: Smoke gates 27/27 green
  └─ Unblocks: TurboVec gRPC sidecar
```

---

## Files Modified

- `scripts/atlas/phase-1b-postgres-bm25-index.mjs` (new)
- `package.json` (2 new npm scripts)
- `docs/PHASE-1B-POSTGRES-BM25-INDEXING.md` (this file)

---

## Next Steps (After Phase 1B Apply)

1. ✅ Run Phase 1B apply: `npm run atlas:phase1b:index:apply`
2. ✅ Verify: `npm run atlas:phase1b:index:verify` (or manual SQL above)
3. ⏳ Parallel Phase 103: Sync graphAuthority to Qdrant
4. ⏳ Wire RRF fusion: `npm run atlas:phase1b:rrf-fusion:wire`
5. ⏳ Smoke gates: verify 27/27 green
6. ⏳ Set `ACE_PIPELINE_VERSION=3.0.0` in env

---

**Status**: ✅ PHASE 1B READY FOR EXECUTION | BLOCKS ACE v3.0.0

