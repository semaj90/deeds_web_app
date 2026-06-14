-- Route packet provenance store — Gemma4 NES/CHROM packet compiler
-- Applied 2026-06-06 via: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql
-- Safe to re-run (all IF NOT EXISTS / ALTER ... IF NOT EXISTS)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extend existing route_runtime_packets with NES packet columns
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS raw jsonb;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS prompt_hash text;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS reward numeric;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS packet_uuid uuid DEFAULT gen_random_uuid();
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS route_state text GENERATED ALWAYS AS (raw #>> '{route,state}') STORED;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS feature_id text GENERATED ALWAYS AS (raw #>> '{feature_id}') STORED;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS packet_version integer;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS supersedes_packet_uuid uuid;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS superseded_by uuid;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS git_sha text;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS git_diff_rank numeric;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS source_ref_quality numeric;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS repair_reason text;
ALTER TABLE route_runtime_packets ADD COLUMN IF NOT EXISTS repair_method text;

CREATE UNIQUE INDEX IF NOT EXISTS rrp_packet_uuid_uidx ON route_runtime_packets (packet_uuid);

CREATE INDEX IF NOT EXISTS rrp_raw_gin     ON route_runtime_packets USING gin (raw jsonb_path_ops);
CREATE INDEX IF NOT EXISTS rrp_feature_idx ON route_runtime_packets (feature_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS rrp_state_idx   ON route_runtime_packets (route_state, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_feature_id ON route_runtime_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_feature_ids_gin ON route_runtime_packets USING gin (feature_ids);
CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_source_refs_gin ON route_runtime_packets USING gin (source_refs);
CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_raw_gin ON route_runtime_packets USING gin (raw jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_rrp_git_sha ON route_runtime_packets (git_sha);
CREATE INDEX IF NOT EXISTS idx_rrp_packet_version ON route_runtime_packets (packet_version);
CREATE INDEX IF NOT EXISTS idx_rrp_source_ref_quality ON route_runtime_packets (source_ref_quality);
CREATE INDEX IF NOT EXISTS idx_rrp_superseded_by ON route_runtime_packets (superseded_by);

-- Facts table
CREATE TABLE IF NOT EXISTS route_packet_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_uuid uuid NOT NULL,
  fact_type   text NOT NULL,
  fact_key    text NOT NULL,
  fact_value  text,
  score       numeric,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpf_lookup_idx   ON route_packet_facts (fact_type, fact_key, fact_value);
CREATE INDEX IF NOT EXISTS rpf_metadata_gin ON route_packet_facts USING gin (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS rpf_packet_uuid  ON route_packet_facts (packet_uuid);

-- Edges table
CREATE TABLE IF NOT EXISTS route_packet_edges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_uuid uuid NOT NULL,
  src         text NOT NULL,
  dst         text NOT NULL,
  edge_type   text NOT NULL,
  weight      numeric DEFAULT 1,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpe_graph_idx   ON route_packet_edges (src, edge_type, dst);
CREATE INDEX IF NOT EXISTS rpe_packet_uuid ON route_packet_edges (packet_uuid);

-- State snapshots table
CREATE TABLE IF NOT EXISTS route_state_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_uuid      uuid NOT NULL,
  state_key        text NOT NULL,
  compressed_state jsonb NOT NULL,
  token_map        jsonb DEFAULT '{}'::jsonb,
  embedding        vector(768),
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rss_packet_uuid ON route_state_snapshots (packet_uuid);
