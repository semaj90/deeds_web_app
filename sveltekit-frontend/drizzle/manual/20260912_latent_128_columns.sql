-- openspec/changes/parent-atlas-error-embedding-768-migration, task 5.2/5.3 (registry
-- promotion itself, task 5.1, remains explicitly SKIPPED -- see tasks.md Section 5 note.
-- This migration builds the actual latent_128 data only, decoupled from the
-- unbuilt atlas_representations registry bookkeeping.
--
-- latent_128 is a deterministic SLICE_FIRST_N + L2-renormalize view of the already-computed
-- latent_256 column (an autoencoder output) -- NOT a new training run, NOT a slice of the raw
-- 768d embedding (that would be MRL truncation, a different, already-distinct mechanism per
-- this repo's Embedding Dimensions Policy hard rule). Two lanes, matching the two latent_256
-- columns already live:
--   latent_256                 -> latent_128                 (content_embedding's lane)
--   error_embedding_latent_256 -> error_embedding_latent_128 (error_embedding's lane, this change)
--
-- Per this repo's Drizzle Safety Rule, this file is proposed SQL only -- it is NOT applied by
-- this change. A human must review and run it manually.

BEGIN;

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS latent_128 halfvec(128),
  ADD COLUMN IF NOT EXISTS error_embedding_latent_128 halfvec(128);

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_latent_128_hnsw
  ON codebase_chunk_index
  USING hnsw (latent_128 halfvec_cosine_ops)
  WHERE latent_128 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_error_embedding_latent_128_hnsw
  ON codebase_chunk_index
  USING hnsw (error_embedding_latent_128 halfvec_cosine_ops)
  WHERE error_embedding_latent_128 IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT count(*) FILTER (WHERE latent_256 IS NOT NULL AND latent_128 IS NULL) AS content_gap,
--          count(*) FILTER (WHERE error_embedding_latent_256 IS NOT NULL AND error_embedding_latent_128 IS NULL) AS error_gap
--   FROM codebase_chunk_index;
-- Expect both 0 after scripts/atlas/backfill-latent-128-slice.mjs runs (see that script).

-- Rollback: DROP COLUMN latent_128, error_embedding_latent_128 (additive, zero pre-existing
-- data to lose -- both columns are brand new).
