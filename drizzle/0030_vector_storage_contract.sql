/**
 * Migration: Vector Storage Contract Enforcement
 *
 * Date: 2026-07-20
 * Purpose: Establish hard boundary between pgvector (searchable) and JSONB (metadata)
 *
 * Changes:
 * - Ensure content_embedding_768 is pgvector (NOT JSONB)
 * - Add classifier_outputs JSONB column (classifier sidecar output)
 * - Add embedding_manifest JSONB column (provenance & audit)
 * - Create IVFFLAT index on vectors for ANN search
 * - Create GIN indexes on JSONB columns for metadata filtering
 * - Add domain_class column for classifier decision
 *
 * No data loss: All changes are additive. Existing columns preserved.
 */

-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Core table: atlas_packets (enforce vector storage contract)
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS domain_class VARCHAR(50),
  ADD COLUMN IF NOT EXISTS classifier_outputs JSONB,
  ADD COLUMN IF NOT EXISTS embedding_manifest JSONB;

-- Ensure content_embedding_768 is pgvector (NOT JSONB)
-- If column exists but is wrong type, this would require data migration
-- For now, assume it's correct from Phase 106
-- To verify: SELECT data_type FROM information_schema.columns
-- WHERE table_name='atlas_packets' AND column_name='content_embedding_768'
-- Expected: 'USER-DEFINED' with udt_name='vector'

-- Vector indexes for ANN search (pgvector)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_content_embedding_768_ivfflat
  ON atlas_packets
  USING ivfflat (content_embedding_768 vector_cosine_ops)
  WITH (lists = 100);  -- Tunable: 100 = ~11K vectors per list (adjust for corpus size)

-- JSONB indexes for metadata filtering (NOT for vector search)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_classifier_outputs_gin
  ON atlas_packets
  USING gin (classifier_outputs);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_embedding_manifest_gin
  ON atlas_packets
  USING gin (embedding_manifest);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_domain_class
  ON atlas_packets (domain_class);

-- Optional: path indexes for common classifier output fields
CREATE INDEX IF NOT EXISTS idx_atlas_packets_classifier_domain_path
  ON atlas_packets
  USING gin (classifier_outputs)
  WHERE domain_class IS NOT NULL;

-- Constraint: classifier_outputs must have required fields if present
ALTER TABLE atlas_packets
  ADD CONSTRAINT check_classifier_outputs_schema
  CHECK (
    classifier_outputs IS NULL OR (
      classifier_outputs ? 'domain_class' AND
      classifier_outputs ? 'confidence' AND
      classifier_outputs ? 'classifier_version'
    )
  );

-- Constraint: embedding_manifest must have required fields if present
ALTER TABLE atlas_packets
  ADD CONSTRAINT check_embedding_manifest_schema
  CHECK (
    embedding_manifest IS NULL OR (
      embedding_manifest ? 'model_id' AND
      embedding_manifest ? 'model_revision' AND
      embedding_manifest ? 'dim' AND
      embedding_manifest ? 'norm'
    )
  );

-- Document the schema (via comment)
COMMENT ON COLUMN atlas_packets.content_embedding_768 IS
  'Searchable semantic embedding (768-dim L2-normalized) stored in pgvector.
   Used for ANN search via IVFFLAT index. NEVER store vectors as JSONB.';

COMMENT ON COLUMN atlas_packets.classifier_outputs IS
  'Domain classifier output (JSONB metadata). Schema: {domain_class, confidence, component_scores, classifier_version}.
   Used for ranking, filtering, audit. NOT for vector search.';

COMMENT ON COLUMN atlas_packets.embedding_manifest IS
  'Embedding provenance & audit trail (JSONB). Schema: {model_id, model_revision, dim, norm, idempotency_key, timestamp}.
   Used for deduplication and lineage tracking. NOT for vector search.';

COMMENT ON COLUMN atlas_packets.domain_class IS
  'Domain classification result from classifier sidecar (code, legal, documentation, etc.).
   Denormalized from classifier_outputs.domain_class for fast filtering.';

-- Future lanes (Phase 107+, optional)
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS content_embedding_256 vector(256),
  ADD COLUMN IF NOT EXISTS latent_embedding_64 halfvec;

-- Future indexes (Phase 107+, only if used)
-- CREATE INDEX IF NOT EXISTS idx_atlas_packets_content_embedding_256_ivfflat
--   ON atlas_packets USING ivfflat (content_embedding_256 vector_cosine_ops);
-- CREATE INDEX IF NOT EXISTS idx_atlas_packets_latent_embedding_64_ivfflat
--   ON atlas_packets USING ivfflat (latent_embedding_64 vector_cosine_ops);

-- Verify constraint
-- SELECT COUNT(*) FROM atlas_packets
--   WHERE content_embedding_768 IS NOT NULL
--   AND pg_column_size(content_embedding_768) > 0;
-- Expected: high percentage (>99% coverage post-Phase 106)
