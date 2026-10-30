-- Proposed PostgreSQL 18 schema alignment for the EmbeddingGemma semantic_768
-- chunk contract. The existing vector column is resized only after an empty-
-- table guard; no vector data is converted or reused. Do not apply before review.

BEGIN;

DO $$
DECLARE
  current_embedding_type text;
  existing_rows bigint;
BEGIN
  IF to_regclass('public.evidence_vectors') IS NULL THEN
    RAISE EXCEPTION 'public.evidence_vectors is missing';
  END IF;

  LOCK TABLE public.evidence_vectors IN ACCESS EXCLUSIVE MODE;

  SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO current_embedding_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.evidence_vectors'::regclass
    AND attribute.attname = 'embedding'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF current_embedding_type IS NULL OR current_embedding_type NOT LIKE 'vector%' THEN
    RAISE EXCEPTION 'Expected a pgvector embedding column, found %', current_embedding_type;
  END IF;

  SELECT count(*) INTO existing_rows FROM public.evidence_vectors;
  IF existing_rows <> 0 THEN
    RAISE EXCEPTION 'Refusing to replace legacy embedding column: evidence_vectors contains % rows', existing_rows;
  END IF;
END $$;

DROP INDEX IF EXISTS public.evidence_vectors_hnsw_idx;
ALTER TABLE public.evidence_vectors
  ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768),
  ADD COLUMN chunk_index integer,
  ADD COLUMN content text,
  ADD COLUMN analysis_type text,
  ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN source_revision text,
  ALTER COLUMN embedding SET NOT NULL,
  ALTER COLUMN chunk_index SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN source_revision SET NOT NULL,
  ADD CONSTRAINT evidence_vectors_source_revision_sha256_ck
    CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT evidence_vectors_chunk_index_nonnegative_ck
    CHECK (chunk_index >= 0),
  ADD CONSTRAINT evidence_vectors_embedding_type_ck
    CHECK (embedding_type = 'evidence_text_semantic_768'),
  ADD CONSTRAINT evidence_vectors_source_field_ck
    CHECK (source_field = 'canonical_evidence_text');

CREATE INDEX evidence_vectors_hnsw_idx
  ON public.evidence_vectors USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE UNIQUE INDEX evidence_vectors_source_chunk_uq
  ON public.evidence_vectors (evidence_id, source_revision, chunk_index)
  WHERE source_revision IS NOT NULL AND chunk_index IS NOT NULL;

COMMIT;
