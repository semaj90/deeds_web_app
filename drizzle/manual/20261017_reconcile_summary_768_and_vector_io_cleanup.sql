-- ============================================================================
-- Migration: Reconcile Summary 768 and Vector Index I/O Cleanup
-- Created: 2026-10-17
-- Target: public.codebase_chunk_index
--
-- Background:
--   1. Summary Embeddings:
--      - Canonical summary embeddings are ALREADY 768-D in `summary_embedding` (halfvec(768)).
--      - `summary_embedding_384` is a legacy column with only 10 rows from June 2026.
--      - Retiring the obsolete `idx_codebase_chunk_summary_embedding_384_hnsw` index removes
--        unnecessary 384-D vector maintenance.
--      - Retiring the redundant `idx_codebase_chunk_summary_embedding_ivfflat` index removes
--        duplicate index churn over the canonical HNSW index.
--
--   2. I/O Bottleneck ('DataFileRead') Remediation:
--      - Non-HOT row updates on `codebase_chunk_index` force index pointer writes across
--        all 12 vector indexes (>954 MB).
--      - Unfiltered HNSW indexes (`summary_embedding`, `error_embedding`, `summary_embedding_384`)
--        force PostgreSQL to load index pages into buffer memory for every updated tuple,
--        even when those vector columns are NULL on 99.5%+ of rows.
--      - Adding `WHERE col IS NOT NULL` partial predicates completely isolates index
--        maintenance from row updates that do not touch those vector columns.
--
-- Note: Run statements individually outside transactions using CONCURRENTLY.
-- ============================================================================

-- Step 1: Drop obsolete 384-D vector index (10 rows, retired representation)
DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_384_hnsw;
DROP INDEX CONCURRENTLY IF EXISTS idx_cci_kmeans384_cluster;

-- Step 2: Drop redundant summary IVFFlat index (redundant with canonical HNSW)
DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_ivfflat;

-- Step 3: Create partial HNSW index for canonical 768-D summary embeddings
-- (Filters out 273,305 NULL rows; only indexes populated summary embeddings)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_summary_embedding_768_hnsw
    ON public.codebase_chunk_index USING hnsw (summary_embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 200)
    WHERE (summary_embedding IS NOT NULL);

-- Step 4: Drop old unfiltered summary HNSW index once partial candidate is ready
-- (Operator action: verify candidate above before executing drop)
-- DROP INDEX CONCURRENTLY IF EXISTS codebase_chunk_index_summary_hnsw;

-- Step 5: Create partial HNSW index for canonical 768-D error embeddings
-- (Filters out 274,445 NULL rows; only indexes the 20 populated error embeddings)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_error_embedding_768_hnsw
    ON public.codebase_chunk_index USING hnsw (error_embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE (error_embedding IS NOT NULL);

-- Step 6: Drop old unfiltered error HNSW index once partial candidate is ready
-- (Operator action: verify candidate above before executing drop)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_index_error_embedding_hnsw;
