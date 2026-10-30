BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

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

  IF current_embedding_type IS DISTINCT FROM 'vector(768)' THEN
    RAISE EXCEPTION 'Refusing rollback: expected vector(768), found %', current_embedding_type;
  END IF;

  SELECT count(*) INTO existing_rows FROM public.evidence_vectors;
  IF existing_rows <> 0 THEN
    RAISE EXCEPTION 'Refusing lossy rollback: evidence_vectors contains % rows', existing_rows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence_vectors'::regclass
      AND conname = 'evidence_vectors_source_revision_sha256_ck'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence_vectors'::regclass
      AND conname = 'evidence_vectors_chunk_index_nonnegative_ck'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence_vectors'::regclass
      AND conname = 'evidence_vectors_embedding_type_ck'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence_vectors'::regclass
      AND conname = 'evidence_vectors_source_field_ck'
  ) THEN
    RAISE EXCEPTION 'Refusing rollback: expected semantic_768 checks are absent';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.evidence_vectors_source_chunk_uq;
DROP INDEX IF EXISTS public.evidence_vectors_hnsw_idx;

ALTER TABLE public.evidence_vectors
  DROP CONSTRAINT evidence_vectors_source_revision_sha256_ck,
  DROP CONSTRAINT evidence_vectors_chunk_index_nonnegative_ck,
  DROP CONSTRAINT evidence_vectors_embedding_type_ck,
  DROP CONSTRAINT evidence_vectors_source_field_ck,
  DROP COLUMN source_revision,
  DROP COLUMN metadata,
  DROP COLUMN analysis_type,
  DROP COLUMN content,
  DROP COLUMN chunk_index,
  ALTER COLUMN embedding TYPE vector(384) USING embedding::vector(384),
  ALTER COLUMN embedding DROP NOT NULL;

CREATE INDEX evidence_vectors_hnsw_idx
  ON public.evidence_vectors USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMIT;
