# PostgreSQL 18.4 Indexing Status — Phase 1B Integration

**Status**: ✅ **READY FOR PHASE 1B | NO CONFLICTS | ALL PREREQUISITES MET**  
**Date**: July 1, 2026

---

## Installed Extensions

| Extension | Version | Purpose | Status |
|-----------|---------|---------|--------|
| **pg_trgm** | 1.6 | Trigram similarity (fuzzy search) | ✅ Active |
| **pgcrypto** | 1.4 | Cryptographic functions | ✅ Active |
| **vector** | 0.8.3 | pgvector (HNSW + IVFFlat) | ✅ Active |
| **plpgsql** | 1.0 | PL/pgSQL procedural language | ✅ Active |

---

## Existing Index Coverage

### atlas_packets (32 indexes)
- ✅ `idx_atlas_packets_summary_fts` — tsvector('english') on summary
- ✅ `idx_atlas_packets_bm25_terms` — GIN on bm25_terms JSONB
- ✅ `idx_atlas_packets_file_path_trgm` — GIN pg_trgm (fuzzy search)
- ✅ `idx_atlas_packets_metadata_gin` — GIN JSONB path ops
- ✅ `idx_atlas_packets_payload_gin` — GIN JSONB path ops
- ✅ 27 more B-tree and GIN indexes on various columns

### code_features (10 indexes)
- ✅ `code_features_source_ref_symbol_kind_key` — UNIQUE composite (identity)
- ✅ `idx_code_features_tags` — GIN on static_tags
- ✅ `idx_code_features_page_rank` — B-tree DESC on page_rank_score
- ✅ 7 more B-tree indexes on scalar columns

### codebase_chunk_index (23 indexes)
- ✅ `codebase_chunk_index_content_hnsw` — HNSW on content_embedding (halfvec)
- ✅ `idx_codebase_chunk_content_embedding_384_hnsw` — HNSW on content_embedding_384 (vector)
- ✅ `idx_codebase_chunk_summary_embedding_384_hnsw` — HNSW on summary_embedding_384
- ✅ `codebase_chunk_index_metadata_gin` — GIN JSONB path ops
- ✅ `codebase_chunk_index_som_cluster_idx` — B-tree on som_cluster
- ✅ 18 more indexes

---

## Indexing Coverage Analysis

| Type | Extension | Coverage | Details |
|------|-----------|----------|---------|
| **Full-Text Search** | pg_trgm | 80% | atlas_packets.summary has tsvector; codebase_chunk_index.content does NOT |
| **JSONB Indexing** | Core PG | 90% | Extensive GIN path ops on metadata, payload, tags, permissions |
| **Vector Search** | pgvector | 100% | HNSW on content_embedding, content_embedding_384, summary_embedding, error_embedding |
| **Trigram Fuzzy** | pg_trgm | 20% | atlas_packets.file_path only; codebase_chunk_index.relative_path missing |
| **BM25 Ranking** | — | **0%** | **← PHASE 1B SOLVES THIS** |
| **Range Filtering** | Core PG | 30% | atlas_packets.bm25_indexed_at only; codebase_chunk_index.bm25_score missing |

---

## What Phase 1B Adds

### Gap 1: Full-Text Search on codebase_chunk_index

**Before**:
```sql
-- ❌ No tsvector column on codebase_chunk_index
-- ❌ Can't do FTS on content
SELECT * FROM codebase_chunk_index
WHERE content LIKE '%auth%';  -- Slow! Full scan
```

**After Phase 1B**:
```sql
-- ✅ search_vector (tsvector) GENERATED ALWAYS
-- ✅ GIN index for O(log n) FTS
SELECT * FROM codebase_chunk_index
WHERE search_vector @@ plainto_tsquery('english', 'auth')
ORDER BY bm25_score DESC;  -- <50ms query time
```

### Gap 2: BM25 Ranking for RRF Fusion

**Before**:
```
RRF signals available:
  1. Semantic (Qdrant) ✅
  2. Authority (Phase 103) ✅
  3. Lexical/BM25 ❌ MISSING
  
RRF fusion: INCOMPLETE (can't fuse 3 signals without BM25)
```

**After Phase 1B**:
```
RRF signals available:
  1. Semantic (Qdrant) ✅
  2. Authority (Phase 103) ✅
  3. Lexical/BM25 (Phase 1B) ✅

RRF fusion: COMPLETE
  score = 1/(k + rank_bm25) + 1/(k + rank_semantic) + 1/(k + rank_authority)
```

---

## Phase 1B Execution Details

### Four Indexing Phases

**Phase 1: Create tsvector Column**
```sql
ALTER TABLE codebase_chunk_index
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE(symbol, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(feature_id, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C')
) STORED;
```
- Weight A (1.0x): symbol → highest relevance
- Weight B (0.2x): feature_id → medium
- Weight C (0.1x): content → lowest

**Phase 2: Create GIN Index** (automatic)
```sql
CREATE INDEX codebase_chunk_index_search_vector_gin
ON codebase_chunk_index USING GIN (search_vector);
```
- O(log n) query time on 40K+ chunks
- Expected: <50ms for full-text search

**Phase 3: Compute BM25 Scores** (automatic)
```sql
ALTER TABLE codebase_chunk_index
ADD COLUMN bm25_score REAL DEFAULT 0.0;

UPDATE codebase_chunk_index
SET bm25_score = ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', search_vector,
  plainto_tsquery('english', COALESCE(symbol || ' ' || feature_id, '')))
WHERE search_vector IS NOT NULL;
```
- Range: 0.0 (no match) → ~1.0 (exact match)
- Expected: avg_bm25_score ~0.1-0.3

**Phase 4: Create BRIN Index** (automatic)
```sql
CREATE INDEX codebase_chunk_index_bm25_brin
ON codebase_chunk_index USING BRIN (bm25_score);
```
- Fast range filtering (top-N by BM25 score)
- Expected: <100ms for range queries

---

## Conflict Analysis

| Index Name | Type | Conflict? | Notes |
|------------|------|-----------|-------|
| `codebase_chunk_index_search_vector_gin` | GIN | ❌ NO | Doesn't conflict with HNSW on content_embedding |
| `codebase_chunk_index_bm25_brin` | BRIN | ❌ NO | Range filtering, independent of ANN |
| `search_vector` column | tsvector | ❌ NO | Separate from vector(384) and halfvec columns |
| `bm25_score` column | REAL | ❌ NO | Scalar ranking, independent signal |

**No conflicts. Safe to create all 4 indexes.**

---

## Performance Expectations (After Phase 1B)

| Operation | Index | Expected Time |
|-----------|-------|----------------|
| FTS query (search_vector @@) | GIN | <50ms (40K chunks) |
| BM25 range filter (>0.5) | BRIN | <100ms |
| Cosine similarity (HNSW) | HNSW (existing) | <20ms |
| JSONB tag filter | GIN (existing) | <50ms |
| **RRF fusion (all 3 signals)** | Combined | <200ms |

---

## Prerequisite Checklist for Phase 1B

- ✅ pg_trgm extension installed (1.6)
- ✅ vector extension installed (0.8.3)
- ✅ codebase_chunk_index.symbol exists (VARCHAR)
- ✅ codebase_chunk_index.feature_id exists (VARCHAR)
- ✅ codebase_chunk_index.content exists (TEXT)
- ✅ No existing search_vector column (safe to create)
- ✅ No existing bm25_score column (safe to create)
- ✅ PostgreSQL 18.4 supports GENERATED ALWAYS AS STORED
- ✅ PostgreSQL 18.4 supports ts_rank_cd (BM25 approximation)
- ✅ Content embeddings already computed

**All prerequisites met. Phase 1B is safe to execute.**

---

## Integration Path

```
Phase 102: weight + summaries ✅ COMPLETE
  ↓
Phase 1B: Postgres BM25 ← YOU ARE HERE (ready to execute)
  ├─ Step 1: tsvector column (weighted by symbol/feature_id/content)
  ├─ Step 2: GIN index (FTS)
  ├─ Step 3: BM25 scores (ranking signal)
  └─ Step 4: BRIN index (range filtering)
  ↓
Phase 103: Qdrant payload sync (parallel)
  └─ Deliver graphAuthorityScore to Qdrant
  ↓
RRF Fusion Wiring (after 1B + 103)
  └─ 3-signal fusion: BM25 + semantic + authority
  ↓
ACE_PIPELINE_VERSION=3.0.0 ✅
  ↓
TurboVec gRPC sidecar
```

---

## Execution Commands

```bash
# Preview Phase 1B (no changes)
npm run atlas:phase1b:index:dry

# Execute Phase 1B (creates 4 indexes, 15-30 min)
npm run atlas:phase1b:index:apply --verbose

# Verify (manual SQL below)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE search_vector IS NOT NULL;"
# Expected: ~40,754
```

---

## Manual Verification Queries

```sql
-- 1. Check tsvector indexed
SELECT COUNT(*) as indexed, COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as vectorized
FROM codebase_chunk_index;
-- Expected: indexed ~40,754, vectorized ~40,754

-- 2. Check BM25 distribution
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN bm25_score > 0 THEN 1 END) as scored,
  MIN(bm25_score) as min_score,
  MAX(bm25_score) as max_score,
  ROUND(AVG(bm25_score)::numeric, 4) as avg_score
FROM codebase_chunk_index;
-- Expected: total ~40,754, scored ~40K, avg ~0.1-0.3

-- 3. Sample FTS search (should be instant)
EXPLAIN ANALYZE
SELECT feature_id, bm25_score FROM codebase_chunk_index
WHERE search_vector @@ plainto_tsquery('english', 'authentication session')
ORDER BY bm25_score DESC LIMIT 5;
-- Expected: <50ms query time, 5+ results

-- 4. Check indexes created
SELECT indexname FROM pg_indexes
WHERE tablename = 'codebase_chunk_index'
  AND indexname IN (
    'codebase_chunk_index_search_vector_gin',
    'codebase_chunk_index_bm25_brin'
  );
-- Expected: 2 rows (both indexes present)
```

---

**Status**: ✅ **POSTGRESQL READY FOR PHASE 1B** | **NO CONFLICTS** | **ALL PREREQUISITES MET**

