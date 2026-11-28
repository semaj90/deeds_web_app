-- Reverse of 20261128_eg2_embeddings_recipe_key_v1.sql. DRAFT: run only with explicit operator approval,
-- with --single-transaction. Refuses while any chunk has more than one recipe: it never deletes rows.
-- Dropping input_sha256 / input_truncated discards those values for any rows written after the change.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.codebase_chunk_eg2_embeddings GROUP BY source_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'EG2_DOWN_BLOCKED_MULTIPLE_RECIPES_PER_CHUNK';
  END IF;
END $$;

-- A view cannot lose columns through CREATE OR REPLACE.
DROP VIEW public.codebase_chunk_eg2_domain_registry;

ALTER TABLE public.codebase_chunk_eg2_embeddings
  DROP CONSTRAINT codebase_chunk_eg2_embeddings_pkey,
  ADD CONSTRAINT codebase_chunk_eg2_embeddings_pkey PRIMARY KEY (source_id),
  ALTER COLUMN representation_id SET DEFAULT 'embeddinggemma2-q8-challenger',
  DROP CONSTRAINT codebase_chunk_eg2_embeddings_input_sha256_check,
  DROP COLUMN input_sha256,
  DROP COLUMN input_truncated;

CREATE VIEW public.codebase_chunk_eg2_domain_registry AS
SELECT
  COALESCE(domain, '(unclassified)') AS domain,
  count(*)::int AS indexed_chunks,
  min(created_at) AS first_indexed_at,
  max(created_at) AS last_indexed_at
FROM public.codebase_chunk_eg2_embeddings
GROUP BY COALESCE(domain, '(unclassified)');
