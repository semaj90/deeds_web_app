-- Card 1B: Three-Table Decomposition Schema Creation
-- Purpose: Complete the schema decomposition for Envelope Extraction
-- atlas_packets (identity) → atlas_packet_features (features) → atlas_packet_metrics (metrics)

-- === TABLE 1: atlas_packet_features (used_concepts per packet) ===
CREATE TABLE IF NOT EXISTS atlas_packet_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL UNIQUE,
  used_concepts text[] DEFAULT ARRAY[]::text[],
  concept_coverage real DEFAULT 0.0,
  lexical_features text[] DEFAULT ARRAY[]::text[],
  ast_symbols text[] DEFAULT ARRAY[]::text[],
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_features_packet_key
  ON atlas_packet_features (packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_packet_features_concepts_gin
  ON atlas_packet_features USING gin (used_concepts);

-- === TABLE 2: atlas_packet_metrics (metrics per packet) ===
CREATE TABLE IF NOT EXISTS atlas_packet_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL UNIQUE,
  feature_density real DEFAULT 0.0,
  complexity_score real DEFAULT 0.0,
  semantic_entropy real DEFAULT 0.0,
  retrieval_relevance real DEFAULT 0.0,
  authority_score real DEFAULT 0.0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_packet_key
  ON atlas_packet_metrics (packet_key);

-- === BACKFILL: Add missing columns to atlas_packets ===
-- These columns were referenced by Card 1B but missing from the table

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS source_ref_key text;

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS title_id uuid;

-- Create indexes for backfill columns
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref_key
  ON atlas_packets (source_ref_key);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_title_id
  ON atlas_packets (title_id);

-- === VALIDATION GATES (Idempotent) ===
-- Verify schemas exist without causing errors
DO $$
BEGIN
  -- Verify atlas_packet_features has required columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atlas_packet_features' AND column_name = 'used_concepts'
  ) THEN
    RAISE EXCEPTION 'atlas_packet_features.used_concepts column missing after creation';
  END IF;

  -- Verify atlas_packets has source_ref_key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atlas_packets' AND column_name = 'source_ref_key'
  ) THEN
    RAISE EXCEPTION 'atlas_packets.source_ref_key column missing after backfill';
  END IF;

  -- Verify atlas_packets has title_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atlas_packets' AND column_name = 'title_id'
  ) THEN
    RAISE EXCEPTION 'atlas_packets.title_id column missing after backfill';
  END IF;

END $$;

-- === GRANT PERMISSIONS (legal_admin user) ===
-- Ensure legal_admin has full access to new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON atlas_packet_features TO legal_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON atlas_packet_metrics TO legal_admin;
GRANT USAGE, SELECT ON SEQUENCE atlas_packet_features_id_seq TO legal_admin;
GRANT USAGE, SELECT ON SEQUENCE atlas_packet_metrics_id_seq TO legal_admin;
