-- EG2-RE-02. DRAFT: NOT APPLIED. Apply only with explicit operator approval, in one transaction:
--   psql -v ON_ERROR_STOP=1 --single-transaction < this file
-- Lets codebase_chunk_eg2_embeddings hold one vector per (chunk, representation, model revision).
-- Release together with: build-eg2-index-batch-v1.mts (ON CONFLICT target) and a recipe filter in
-- python/atlas_graph_runtime/eg2_challenger_lane_v1.py. Does not touch codebase_chunk_index or the HNSW index.
-- Reverse: 20261128_eg2_embeddings_recipe_key_v1_down.sql. Take a row pre-image first.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.codebase_chunk_eg2_embeddings'::regclass AND contype = 'p')
     IS DISTINCT FROM 'PRIMARY KEY (source_id)' THEN
    RAISE EXCEPTION 'EG2_PRECHECK_UNEXPECTED_PRIMARY_KEY';
  END IF;
END $$;

ALTER TABLE public.codebase_chunk_eg2_embeddings
  ADD COLUMN input_sha256 text,
  ADD COLUMN input_truncated boolean,
  ADD CONSTRAINT codebase_chunk_eg2_embeddings_input_sha256_check
    CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[0-9a-f]{64}$'),
  -- Every writer must name its recipe; the old default would silently label new rows as GGUF Q8.
  ALTER COLUMN representation_id DROP DEFAULT,
  DROP CONSTRAINT codebase_chunk_eg2_embeddings_pkey,
  ADD CONSTRAINT codebase_chunk_eg2_embeddings_pkey
    PRIMARY KEY (source_id, representation_id, model_revision);

-- Existing four columns keep their names and order; the recipe columns are appended.
CREATE OR REPLACE VIEW public.codebase_chunk_eg2_domain_registry AS
SELECT
  COALESCE(domain, '(unclassified)') AS domain,
  count(*)::int AS indexed_chunks,
  min(created_at) AS first_indexed_at,
  max(created_at) AS last_indexed_at,
  representation_id,
  model_revision
FROM public.codebase_chunk_eg2_embeddings
GROUP BY COALESCE(domain, '(unclassified)'), representation_id, model_revision;
