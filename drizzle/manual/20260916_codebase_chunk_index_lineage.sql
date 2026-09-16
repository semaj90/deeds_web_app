-- Parent Atlas current dense lineage bridge (2026-09-16)
--
-- PostgreSQL remains canonical. These nullable columns are a derived mirror on
-- codebase_chunk_index so dense projections can be admitted only after an
-- exact source/chunk lineage proof. Historical rows remain observable and are
-- intentionally not backfilled by this DDL.

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS representation_revision text,
  ADD COLUMN IF NOT EXISTS lineage_binding_checksum text,
  ADD COLUMN IF NOT EXISTS lineage_producer_revision text;

COMMENT ON COLUMN codebase_chunk_index.workspace_revision IS
  'Nullable admitted workspace revision copied from the exact source binding; NULL is historical/unqualified.';
COMMENT ON COLUMN codebase_chunk_index.source_revision IS
  'Nullable source revision copied from graphify/workspace binding; distinct from chunk content_hash.';
COMMENT ON COLUMN codebase_chunk_index.representation_revision IS
  'Nullable semantic representation revision; never inferred from embedding dimension or Qdrant point id.';
COMMENT ON COLUMN codebase_chunk_index.lineage_binding_checksum IS
  'Checksum of the source binding used to admit this derived chunk row.';
COMMENT ON COLUMN codebase_chunk_index.lineage_producer_revision IS
  'Producer revision that established the source/chunk lineage mirror.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_workspace_source_lineage
  ON codebase_chunk_index (workspace_revision, source_ref)
  WHERE workspace_revision IS NOT NULL AND source_ref IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_source_revision
  ON codebase_chunk_index (source_revision)
  WHERE source_revision IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_representation_revision
  ON codebase_chunk_index (representation_revision)
  WHERE representation_revision IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_lineage_checksum
  ON codebase_chunk_index (lineage_binding_checksum)
  WHERE lineage_binding_checksum IS NOT NULL;
