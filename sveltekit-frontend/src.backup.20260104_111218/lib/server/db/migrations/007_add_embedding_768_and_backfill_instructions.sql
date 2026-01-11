-- Migration 007: Add 768-dim embedding column for embeddinggemma and index
-- Purpose: vector_embeddings currently stores embedding VECTOR(1536). To use
-- embeddinggemma (768 dim) we add a new nullable column `embedding_768`
-- and create an ivfflat index on it. Backfill must be performed by calling
-- your embedding service (Ollama / embeddinggemma) to generate 768-d vectors
-- and update this column. After backfill & verification you may drop the
-- old column or keep it for historical/reference purposes.

BEGIN;

-- 1) Add new nullable column for embeddinggemma (768 dims)
ALTER TABLE public.vector_embeddings
  ADD COLUMN IF NOT EXISTS embedding_768 vector(768);

-- 2) Create an ivfflat index (cosine ops) for the new column. Use CONCURRENTLY
-- to avoid long table locks in production. Tune `lists` according to expected
-- cardinality (lists ~= sqrt(N)). Defaulting to lists = 64 (adjust as needed).
DO $$
BEGIN
  -- create index concurrently if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_vector_embeddings_embedding_768_ivfflat'
  ) THEN
    EXECUTE 'CREATE INDEX CONCURRENTLY idx_vector_embeddings_embedding_768_ivfflat ON public.vector_embeddings USING ivfflat (embedding_768 vector_cosine_ops) WITH (lists = 64)';
  END IF;
END$$;

-- 3) Add helpful comments so future maintainers know how to backfill
COMMENT ON COLUMN public.vector_embeddings.embedding_768 IS
  'Embedding column for embeddinggemma (768 dims). Backfill externally via Ollama or the repo''s embedding job.';

-- 4) Optional: add model metadata column if you want to track which model produced the vector
ALTER TABLE public.vector_embeddings ADD COLUMN IF NOT EXISTS embedding_model varchar(128) DEFAULT NULL;

COMMIT;

-- === Backfill instructions (manual step) ===
-- The migration above only adds the new column and index. You must populate
-- `embedding_768` by re-embedding documents with embeddinggemma (768 dims).
-- Example backfill plan (recommended approach):

-- 1) Create a small server-side script that:
--    - Queries rows needing backfill: SELECT id, content FROM public.vector_embeddings WHERE embedding_768 IS NULL LIMIT 1000;
--    - Calls your Ollama embedding endpoint for each content chunk (model: 'embeddinggemma:latest') and obtains a 768-dimensional array.
--    - Updates the row with the new vector (use parameterized queries). Example update:
--        UPDATE public.vector_embeddings SET embedding_768 = '[v1,v2,...]', embedding_model = 'embeddinggemma:latest' WHERE id = '<id>';

-- 2) Backfill in batches (e.g., 500-1000 rows) and throttle to avoid overloading Ollama.

-- 3) After a representative sample of rows is populated, validate search results:
--    - Run nearest-neighbor queries against `embedding_768` using pgvector operators:
--        SELECT id, content, embedding_768 <-> '[<query-vector>]' as dist FROM public.vector_embeddings WHERE embedding_768 IS NOT NULL ORDER BY dist ASC LIMIT 10;

-- 4) When you are satisfied with the backfill and results, you can swap columns:
--    - Option A (rename): Drop the old `embedding` column and rename `embedding_768` to `embedding`.
--      NOTE: This is destructive. Only do this after full backfill and verification.
--      Example (careful, only run after backup):
--        BEGIN; ALTER TABLE public.vector_embeddings DROP COLUMN embedding; ALTER TABLE public.vector_embeddings RENAME COLUMN embedding_768 TO embedding; COMMIT;

--    - Option B (keep both): Keep `embedding` (1536 dims) for historical use and query whichever column matches the model of the query vector.

-- 5) If you prefer 384 dims instead, repeat the steps but create embedding_384 vector(384) and backfill with the desired model/config.

-- End of migration 007
