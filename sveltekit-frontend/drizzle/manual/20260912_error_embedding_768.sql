-- openspec/changes/parent-atlas-error-embedding-768-migration, task 1.2
--
-- Migrates codebase_chunk_index.error_embedding from vector(384) to halfvec(768),
-- matching the canonical embeddinggemma output dimension already used by
-- signature_embedding and content_embedding on this same table.
--
-- Pre-migration state (verified live 2026-09-12): 0/55853 rows populated. The
-- existing idx_codebase_chunk_index_error_embedding_hnsw index uses vector_cosine_ops,
-- which is NOT compatible with halfvec -- it must be dropped and recreated with
-- halfvec_cosine_ops (matching idx_codebase_chunk_latent_256_hnsw's convention on
-- this same table), not just widened in place.
--
-- Per this repo's Drizzle Safety Rule, this file is proposed SQL only -- it is NOT
-- applied by this change. A human must review and run it manually (task 1.3).
--
-- Pre-migration snapshot: deeds_labs/archive/2026-09-12/error_embedding_384_backup.csv
-- (header-only -- confirmed zero populated rows at snapshot time), manifest entry in
-- docs/archive-manifest.json.
--
-- Rollback: ALTER COLUMN error_embedding TYPE vector(384) USING NULL, then restore
-- any rows from the archived CSV above (none existed at snapshot time).

BEGIN;

DROP INDEX IF EXISTS idx_codebase_chunk_index_error_embedding_hnsw;

ALTER TABLE codebase_chunk_index
  ALTER COLUMN error_embedding TYPE halfvec(768) USING NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_error_embedding_hnsw
  ON codebase_chunk_index
  USING hnsw (error_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMIT;

-- Verification (task 1.4):
--   SELECT vector_dims(error_embedding::vector) FROM codebase_chunk_index
--   WHERE error_embedding IS NOT NULL LIMIT 5;
-- Expect 0 rows (freshly nulled) immediately after apply, or 768 for any row
-- populated later by scripts/atlas/backfill-graphify-rff-embeddings-768.mjs.
