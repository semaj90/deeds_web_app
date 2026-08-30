-- latent_256 columns on codebase_chunk_index (2026-08-29)
--
-- Learned nested-autoencoder representation. NOT a prefix truncation of content_embedding --
-- populated by an actual model forward pass (NestedSemanticAutoencoder.encode() on the
-- v3_full01 checkpoint). canonical_authority stays false: this is a routing/reranking lane,
-- never the primary retrieval authority. exact_semantic_768 (content_embedding) remains truth.
--
-- Justification: recall comparison in
-- openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md showed latent_256 (0.8957
-- knn_recall@10) beating semantic_mrl_256 (0.8575), a free MRL prefix truncation, outright --
-- see docs/reports/semantic-representation-recall-comparison-v2.json.
--
-- latent_128/latent_64 are NOT stored as separate columns: they are free prefix+renormalize
-- views of latent_256 (normalize(latent_256[:128]), normalize(latent_128[:64])), derived at
-- query time -- storing them would duplicate data that's cheap to recompute.

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS latent_256 halfvec(256);

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS latent_256_checkpoint_revision varchar(64);

-- Partial index: only rows with a populated latent_256 are indexed, matching the
-- pattern already used elsewhere in this repo (idx_codebase_chunk_summary_null) for
-- backfill-in-progress columns.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_latent_256_hnsw
  ON codebase_chunk_index
  USING hnsw (latent_256 halfvec_cosine_ops)
  WHERE latent_256 IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_latent_256_checkpoint_revision
  ON codebase_chunk_index (latent_256_checkpoint_revision)
  WHERE latent_256_checkpoint_revision IS NOT NULL;
