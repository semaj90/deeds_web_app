-- Route packet provenance store — Gemma4 NES/CHROM packet compiler
-- Applied 2026-06-06 via: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql
-- Safe to re-run (all IF NOT EXISTS / ALTER ... IF NOT EXISTS)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extend existing route_runtime_packets with NES packet columns
ALTER TABLE route_runtime_packets
  ADD COLUMN IF NOT EXISTS raw         jsonb,
  ADD COLUMN IF NOT EXISTS prompt_hash text,
  ADD COLUMN IF NOT EXISTS reward      numeric,
  ADD COLUMN IF NOT EXISTS packet_uuid uuid DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS rrp_packet_uuid_uidx ON route_runtime_packets (packet_uuid);

-- Generated columns (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'route_runtime_packets' AND column_name = 'route_state'
  ) THEN
    ALTER TABLE route_runtime_packets
      ADD COLUMN route_state text GENERATED ALWAYS AS (raw #>> '{route,state}') STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'route_runtime_packets' AND column_name = 'feature_id'
  ) THEN
    ALTER TABLE route_runtime_packets
      ADD COLUMN feature_id text GENERATED ALWAYS AS (raw #>> '{feature_id}') STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rrp_raw_gin     ON route_runtime_packets USING gin (raw jsonb_path_ops);
CREATE INDEX IF NOT EXISTS rrp_feature_idx ON route_runtime_packets (feature_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS rrp_state_idx   ON route_runtime_packets (route_state, captured_at DESC);

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
