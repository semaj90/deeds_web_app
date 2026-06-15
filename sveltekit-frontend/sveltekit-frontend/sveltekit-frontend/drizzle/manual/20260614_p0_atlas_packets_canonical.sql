-- P0 Phase: Canonical Packet Identity Schema
-- Purpose: Establish the frozen identity contract for Parent Atlas
-- Authority: memory/parent-atlas-frozen-identity-contract.md
-- Date: 2026-06-14

-- Identity Chain (immutable per row):
--   directory_path → source_ref → file_path → function_symbol
--   → feature_id → feature_label → packet_key

CREATE TABLE IF NOT EXISTS atlas_packets (
  -- Primary Keys & Identity
  packet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL UNIQUE,
  source_ref text NOT NULL,
  directory_path text NOT NULL,
  file_path text,
  function_symbol text,

  -- Feature Classification (canonical)
  feature_id text NOT NULL,
  feature_label text NOT NULL,

  -- Context & Enrichment
  community_id integer,
  community_source text,
  community_confidence double precision DEFAULT 0,
  concept_ids text[] DEFAULT '{}',
  cluster_id integer,

  -- Vector & Embeddings
  embedding vector(768),

  -- Metadata (JSONB for extensibility)
  payload jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  summary text,

  -- Storage Coordinates
  byte_start bigint,
  byte_end bigint,
  sha256 text,
  source_kind text DEFAULT 'codebase',
  source_path text,
  source_ref_key text,

  -- Ranking & Scoring
  reward_prior double precision DEFAULT 0,

  -- Lifecycle
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  -- Constraints
  CONSTRAINT packet_identity_complete CHECK (
    packet_key IS NOT NULL
    AND source_ref IS NOT NULL
    AND feature_id IS NOT NULL
    AND feature_label IS NOT NULL
    AND directory_path IS NOT NULL
  ),
  CONSTRAINT packet_key_valid CHECK (packet_key ~ '^ace:packet:[a-z0-9._-]+:[0-9]+$'),
  CONSTRAINT feature_id_valid CHECK (feature_id ~ '^[a-z0-9._-]+$')
);

-- Canonical Identity Indexes (Hard Fail Detection)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity
  ON atlas_packets (packet_key, source_ref, feature_id, directory_path);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref
  ON atlas_packets (source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id
  ON atlas_packets (feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_directory_path
  ON atlas_packets (directory_path);

-- Duplicate Detection Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref_uniq
  ON atlas_packets (source_ref) WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_packet_key_uniq
  ON atlas_packets (packet_key) WHERE packet_key IS NOT NULL;

-- JSONB Payload Indexes (for enrichment fields)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_feature_label
  ON atlas_packets USING GIN ((payload -> 'feature_label'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_path
  ON atlas_packets ((payload->>'path'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_hash
  ON atlas_packets ((payload->>'hash'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_gin
  ON atlas_packets USING GIN (payload);

-- Metadata Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin
  ON atlas_packets USING GIN (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_path
  ON atlas_packets ((metadata->>'path'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_hash
  ON atlas_packets ((metadata->>'hash'));

-- Vector Search Index (HNSW for similarity)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_embedding_hnsw
  ON atlas_packets USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- FTS Index for summary search
CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_fts
  ON atlas_packets USING GIN (to_tsvector('english', coalesce(summary, '')));

-- Ranking Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_packets_reward_prior
  ON atlas_packets (reward_prior DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_confidence
  ON atlas_packets (community_confidence DESC);

-- Cluster Membership
CREATE INDEX IF NOT EXISTS idx_atlas_packets_cluster_id
  ON atlas_packets (cluster_id);

-- Concept Membership
CREATE INDEX IF NOT EXISTS idx_atlas_packets_concept_ids
  ON atlas_packets USING GIN (concept_ids);

-- Lifecycle Queries
CREATE INDEX IF NOT EXISTS idx_atlas_packets_created_at
  ON atlas_packets (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_updated_at
  ON atlas_packets (updated_at DESC);

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_feature
  ON atlas_packets (source_ref, feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_directory_feature
  ON atlas_packets (directory_path, feature_id);

-- ============================================================================
-- Validation Views (for P0 verification gates)
-- ============================================================================

-- P0 Hard Fail Gate: All packets must have complete identity
CREATE OR REPLACE VIEW v_atlas_packets_identity_validation AS
SELECT
  COUNT(*) FILTER (WHERE packet_key IS NULL) as missing_packet_key,
  COUNT(*) FILTER (WHERE source_ref IS NULL) as missing_source_ref,
  COUNT(*) FILTER (WHERE feature_id IS NULL) as missing_feature_id,
  COUNT(*) FILTER (WHERE feature_label IS NULL) as missing_feature_label,
  COUNT(*) FILTER (WHERE directory_path IS NULL) as missing_directory_path,
  COUNT(*) FILTER (WHERE packet_key ~ '^ace:packet:[a-z0-9._-]+:[0-9]+$' = false) as malformed_packet_key,
  COUNT(*) FILTER (WHERE feature_id ~ '^[a-z0-9._-]+$' = false) as malformed_feature_id,
  COUNT(DISTINCT packet_key) as unique_packet_keys,
  COUNT(DISTINCT source_ref) as unique_source_refs,
  COUNT(DISTINCT feature_id) as unique_feature_ids,
  COUNT(*) as total_packets
FROM atlas_packets;

-- Duplicate Detection View
CREATE OR REPLACE VIEW v_atlas_packets_duplicates AS
SELECT
  'source_ref' as duplicate_type,
  source_ref as key_value,
  COUNT(*) as count,
  ARRAY_AGG(packet_id) as packet_ids
FROM atlas_packets
WHERE source_ref IS NOT NULL
GROUP BY source_ref
HAVING COUNT(*) > 1

UNION ALL

SELECT
  'packet_key' as duplicate_type,
  packet_key as key_value,
  COUNT(*) as count,
  ARRAY_AGG(packet_id) as packet_ids
FROM atlas_packets
WHERE packet_key IS NOT NULL
GROUP BY packet_key
HAVING COUNT(*) > 1;

-- ============================================================================
-- P0 Verification Stored Procedure
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_p0_lineage_frozen()
RETURNS TABLE (
  gate text,
  status text,
  details jsonb
) LANGUAGE plpgsql AS $$
DECLARE
  v_identity_report jsonb;
  v_duplicate_report jsonb;
  v_pass boolean := true;
BEGIN
  -- Fetch identity validation results
  SELECT row_to_json(t)::jsonb INTO v_identity_report
  FROM v_atlas_packets_identity_validation t;

  -- Fetch duplicate report
  SELECT jsonb_agg(row_to_json(t))::jsonb INTO v_duplicate_report
  FROM v_atlas_packets_duplicates t;

  -- Check P0 Hard Fail Conditions
  IF (v_identity_report->>'missing_packet_key')::int > 0 THEN v_pass := false; END IF;
  IF (v_identity_report->>'missing_source_ref')::int > 0 THEN v_pass := false; END IF;
  IF (v_identity_report->>'missing_feature_id')::int > 0 THEN v_pass := false; END IF;
  IF (v_identity_report->>'missing_feature_label')::int > 0 THEN v_pass := false; END IF;
  IF (v_identity_report->>'missing_directory_path')::int > 0 THEN v_pass := false; END IF;
  IF (v_identity_report->>'malformed_packet_key')::int > 0 THEN v_pass := false; END IF;
  IF (v_duplicate_report IS NOT NULL AND jsonb_array_length(v_duplicate_report) > 0) THEN v_pass := false; END IF;

  RETURN QUERY
  SELECT
    'lineage_identity' as gate,
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END as status,
    jsonb_build_object(
      'identity_validation', v_identity_report,
      'duplicates', COALESCE(v_duplicate_report, '[]'::jsonb),
      'timestamp', now()::text
    ) as details;
END;
$$;

-- ============================================================================
-- Indexes for Cold Storage Mirror (P0B)
-- ============================================================================

CREATE TABLE IF NOT EXISTS atlas_cold_storage_manifest (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES atlas_packets(packet_id) ON DELETE CASCADE,
  source_ref text NOT NULL,
  seaweedfs_uri text NOT NULL,
  sha256 text NOT NULL,
  restore_verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (source_ref)
);

CREATE INDEX IF NOT EXISTS idx_atlas_cold_manifest_packet_id
  ON atlas_cold_storage_manifest (packet_id);

CREATE INDEX IF NOT EXISTS idx_atlas_cold_manifest_source_ref
  ON atlas_cold_storage_manifest (source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_cold_manifest_restore_verified
  ON atlas_cold_storage_manifest (restore_verified);
