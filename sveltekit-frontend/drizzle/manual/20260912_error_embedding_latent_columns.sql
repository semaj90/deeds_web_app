-- openspec/changes/parent-atlas-error-embedding-768-migration, task 4.1
--
-- Adds autoencoder-latent derived-view columns scoped to the error-fixing
-- embedding lane, kept architecturally distinct from content_embedding's
-- existing latent_256/latent_64 columns (no shared column names, no shared
-- meaning -- per spec.md's "Derived autoencoder-latent views for
-- error_embedding" requirement and design.md decision D2).
--
-- Mirrors content_embedding's existing latent_256/latent_64 column shapes
-- exactly (same types, same supporting metadata columns), just prefixed
-- error_embedding_* and computed from error_embedding via a second forward
-- pass through the same NestedSemanticAutoencoder model -- not a slice of
-- content_embedding's latent values, and not sharing a code path with the
-- MRL-truncation columns from the prior migration in this change.
--
-- Per this repo's Drizzle Safety Rule, this file is proposed SQL only -- it
-- is NOT applied by this change. A human must review and run it manually.

BEGIN;

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS error_embedding_latent_256 halfvec(256),
  ADD COLUMN IF NOT EXISTS error_embedding_latent_256_checkpoint_revision varchar(64),
  ADD COLUMN IF NOT EXISTS error_embedding_latent_64 vector(64),
  ADD COLUMN IF NOT EXISTS error_embedding_latent64_model text DEFAULT 'packet-autoencoder-768-64',
  ADD COLUMN IF NOT EXISTS error_embedding_latent_valid boolean,
  ADD COLUMN IF NOT EXISTS error_embedding_latent_validated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_error_embedding_latent_256_hnsw
  ON codebase_chunk_index
  USING hnsw (error_embedding_latent_256 halfvec_cosine_ops)
  WHERE error_embedding_latent_256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_error_embedding_latent64_hnsw
  ON codebase_chunk_index
  USING hnsw (error_embedding_latent_64 vector_cosine_ops)
  WHERE error_embedding_latent_64 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_error_embedding_latent_256_checkpoint_revision
  ON codebase_chunk_index (error_embedding_latent_256_checkpoint_revision)
  WHERE error_embedding_latent_256_checkpoint_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_error_embedding_latent_valid
  ON codebase_chunk_index (error_embedding_latent_valid);

COMMIT;

-- Verification:
--   SELECT count(*) FILTER (WHERE error_embedding_latent_256 IS NOT NULL) AS populated
--   FROM codebase_chunk_index;
-- Expect 0 immediately after apply (additive columns, no backfill yet), then
-- matching the error_embedding-populated row count once
-- python/backfill_latent_256.py --source-column=error_embedding is run.

-- Rollback: DROP COLUMN error_embedding_latent_256, error_embedding_latent_256_checkpoint_revision,
-- error_embedding_latent_64, error_embedding_latent64_model, error_embedding_latent_valid,
-- error_embedding_latent_validated_at (all additive, zero pre-existing data to lose).
