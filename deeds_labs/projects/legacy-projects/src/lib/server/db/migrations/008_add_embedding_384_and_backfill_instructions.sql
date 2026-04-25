-- Migration: add embedding_384 column and index (non-destructive)
-- Safe flow: add column (nullable), create index concurrently, backfill, verify, then optionally swap/rename

ALTER TABLE public.vector_embeddings
  ADD COLUMN IF NOT EXISTS embedding_384 vector(384);

ALTER TABLE public.vector_embeddings
  ADD COLUMN IF NOT EXISTS embedding_model text;

-- Create an ivfflat index for efficient nearest-neighbor on embedding_384.
-- Use CONCURRENTLY to avoid write locks. Adjust LISTS based on table size
-- (heuristic: lists ~ sqrt(N_rows)). Example uses lists='100' as a starting point.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vector_embeddings_embedding_384_ivfflat
  ON public.vector_embeddings USING ivfflat (embedding_384 vector_cosine_ops) WITH (lists = '100');

-- Backfill instructions (manual):
-- 1) Ensure Ollama (or your embedding service) is running and can produce 384-dim embeddings.
-- 2) Run the provided Node backfill script: sveltekit-frontend/scripts/backfill_embedding_384.mjs
--    Set env: DATABASE_URL or DB_* variables, OLLAMA_URL, EMBEDDING_MODEL (if using a custom model), BATCH_SIZE, PAUSE_MS.
-- 3) Verify counts and vector_dims: SELECT count(*)..., SELECT vector_dims(embedding_384) FROM public.vector_embeddings WHERE embedding_384 IS NOT NULL LIMIT 10;
-- 4) Test nearest-neighbor queries using embedding_384 in your SQL (embedding_384 <-> query)
-- 5) (Optional) When verified, rename/swap columns:
--    ALTER TABLE public.vector_embeddings RENAME COLUMN embedding TO embedding_1536;
--    ALTER TABLE public.vector_embeddings RENAME COLUMN embedding_384 TO embedding;
--    DROP or recreate indexes as needed for the new 'embedding' column.

-- NOTE: Do not drop the original embedding column until you have verified results and have backups.
