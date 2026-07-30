-- Fix gRPC Proto → Postgres Alignment Issues
-- Manual sidecar migration for gRPC proto alignment.
-- Addresses missing indexes and columns identified by align-grpc-proto-to-postgres-indexes.mjs.
-- Generated: 2026-07-28T21:00:57.005Z

-- ============================================================================
-- 1. ATLAS_PACKETS: Add missing composite and GIN indexes
-- ============================================================================

-- Composite index for source_ref + feature_id joins (multi-hop queries)
CREATE INDEX IF NOT EXISTS idx_packets_source_feature_multi_hop
  ON atlas_packets (source_ref, feature_id);

-- GIN index for metadata JSONB pathwise queries (feature_id, domain lookups)
CREATE INDEX IF NOT EXISTS atlas_packets_metadata_gin_idx
  ON atlas_packets USING gin (metadata);

-- GIN index for payload JSONB (used in ACE packet assembly)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_path
  ON atlas_packets USING gin (payload);

-- Composite index for feature_id + feature_label (identity resolution)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id_composite
  ON atlas_packets (feature_id, feature_label);

-- Partial index for centroid cache lookups (SOM cluster assignment)
CREATE INDEX IF NOT EXISTS idx_packets_centroid_cache
  ON atlas_packets (feature_id) WHERE som_cluster_id IS NOT NULL;

-- ============================================================================
-- 2. ROUTE_RUNTIME_PACKETS: Add missing columns (proto → table mapping)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.route_runtime_packets') IS NOT NULL THEN
    -- feature_id column for gRPC proto alignment
    EXECUTE 'ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS feature_id VARCHAR(512)';

    -- raw column for JSONB route state serialization
    EXECUTE 'ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS raw JSONB';

    -- route_state column for explicit async state tracking
    EXECUTE 'ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS route_state VARCHAR(50) DEFAULT ''PENDING''';

    -- Indexes for new columns
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_feature_id ON route_runtime_packets (feature_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rrp_raw_gin ON route_runtime_packets USING gin (raw)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rrp_feature_cluster ON route_runtime_packets (feature_id, route_state)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rrp_feature_ids_gin ON route_runtime_packets USING gin (raw -> ''feature_ids'')';
  END IF;
END $$;

-- ============================================================================
-- 3. TASK_SEMANTIC_PACKETS: Add missing metadata GIN index
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_metadata_gin
  ON task_semantic_packets USING gin (metadata);

-- ============================================================================
-- 4. CONCEPT_RECORDS: Add missing metadata column and indexes
-- ============================================================================

-- metadata column for JSONB envelope (gRPC proto contract)
ALTER TABLE concept_records
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_concept_records_feature_ids_gin
  ON concept_records USING gin (feature_ids);

CREATE INDEX IF NOT EXISTS idx_concept_records_metadata_gin
  ON concept_records USING gin (metadata);

-- ============================================================================
-- 5. Validation: Check index coverage
-- ============================================================================

-- After running this migration, verify coverage:
-- SELECT indexname FROM pg_indexes WHERE tablename='atlas_packets' ORDER BY indexname;
-- SELECT indexname FROM pg_indexes WHERE tablename='route_runtime_packets' ORDER BY indexname;
-- SELECT column_name FROM information_schema.columns WHERE table_name='route_runtime_packets';
-- SELECT column_name FROM information_schema.columns WHERE table_name='concept_records';
