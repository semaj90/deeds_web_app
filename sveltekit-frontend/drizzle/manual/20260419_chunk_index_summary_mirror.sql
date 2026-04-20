-- Codebase Chunk Index: add content + cluster_summary columns for pgvector mirror
-- Safe to re-run: IF NOT EXISTS on all ops

-- 0. Unique constraint on qdrant_id (required for ON CONFLICT upsert in index-stream)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'codebase_chunk_index_qdrant_id_unique'
  ) THEN
    CREATE UNIQUE INDEX codebase_chunk_index_qdrant_id_unique ON codebase_chunk_index (qdrant_id);
  END IF;
END $$;
-- Drop the old non-unique index if it exists (superseded by unique index above)
DROP INDEX IF EXISTS codebase_chunk_index_qdrant_id_idx;

-- 1. Content column (full chunk text — needed for QLoRA hydration + local search)
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS content TEXT;

-- 2. Cluster summary JSONB (mirrors Redis cluster summary for offline/SQL queries)
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS cluster_summary JSONB DEFAULT '{}'::jsonb;

-- 3. Summary embedding vector (autoencoded from cluster_summary.summary via embeddinggemma)
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS summary_embedding halfvec(768);

-- 4. Signature embedding vector (AST metadata embedding from dual-embedder)
ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS signature_embedding halfvec(768);

-- 5. HNSW index for summary ANN search (enables "find chunks with similar cluster context")
CREATE INDEX CONCURRENTLY IF NOT EXISTS codebase_chunk_index_summary_hnsw
    ON codebase_chunk_index
    USING hnsw (summary_embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- 6. GIN index on cluster_summary for JSONB queries (e.g. WHERE cluster_summary->>'purpose' LIKE '%...')
CREATE INDEX IF NOT EXISTS codebase_chunk_index_cluster_summary_gin
    ON codebase_chunk_index USING gin (cluster_summary jsonb_path_ops);