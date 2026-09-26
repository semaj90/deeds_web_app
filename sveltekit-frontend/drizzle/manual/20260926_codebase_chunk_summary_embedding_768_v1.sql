-- DESIGN ONLY / NOT APPLIED. Provenance for the EXISTING canonical admitted-summary vector.
-- public.codebase_chunk_index.summary_embedding is already halfvec(768) with cosine indexes; do NOT add a duplicate
-- summary_embedding_768 column. summary_embedding_384 is legacy and is never populated again. summary_hash is never reused.
-- Legacy rows (1,160 at 2026-09-26) have a vector but NULL provenance: they are unbound hints, never CURRENT.
-- Populate only from admitted summary_text via the RabbitMQ-fed single conditional writer; the writer's predicate
-- (summary_embedding IS NULL AND summary_provenance->'admission'->>'status'='ADMITTED' AND digest(summary_text)=job digest)
-- also skips legacy rows, so they are not silently re-bound.
BEGIN;

ALTER TABLE public.codebase_chunk_index
  ADD COLUMN IF NOT EXISTS summary_embedding_meta jsonb;

COMMENT ON COLUMN public.codebase_chunk_index.summary_embedding_meta IS
  'atlas.summary-embedding-provenance.v1: representationId (semantic_768), representationRevision, modelRevision, upstream executor, summaryInputDigest (= summary_provenance.summaryDigest), vectorDigest, generatedAt, jobId. NULL means the vector (if any) is legacy/unbound.';

COMMIT;
