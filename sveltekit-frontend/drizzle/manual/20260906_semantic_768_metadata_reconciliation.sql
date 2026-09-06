-- SEMANTIC-METADATA-RECONCILIATION-01
--
-- Prepared sidecar migration. It corrects only the metadata default and adds
-- a future-write guard for the canonical codebase_chunk_index vector lane.
-- It does not rewrite rows, backfill vectors, drop legacy columns, or change
-- Qdrant/Go Retrieval projections.
--
-- Preconditions proved by:
--   node scripts/atlas/prove-semantic-768-metadata-reconciliation-v1.mjs
--
-- Apply only through the reviewed sidecar migration process after the
-- preflight receipt and migration authorization are accepted.

BEGIN;

ALTER TABLE public.codebase_chunk_index
  ALTER COLUMN embedding_dimension SET DEFAULT 768;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.codebase_chunk_index'::regclass
      AND conname = 'codebase_chunk_index_semantic_768_metadata_ck'
  ) THEN
    ALTER TABLE public.codebase_chunk_index
      ADD CONSTRAINT codebase_chunk_index_semantic_768_metadata_ck
      CHECK (
        content_embedding IS NULL
        OR (embedding_dimension IS NOT NULL AND embedding_dimension = 768)
      )
      NOT VALID;
  END IF;
END
$$;

COMMIT;
