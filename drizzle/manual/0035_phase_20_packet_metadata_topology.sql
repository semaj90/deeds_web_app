-- Phase 20: Packet Metadata + Topology Schema Pass
-- Adds structured permissions, topology, vectors envelopes to atlas_packets

-- ── Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Ensure columns exist ──────────────────────────────────────────────────
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{"visibility":"internal","can_write":false,"can_execute":false,"can_export":false,"source":"repo_index"}'::jsonb,
  ADD COLUMN IF NOT EXISTS topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vectors jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS pagerank real,
  ADD COLUMN IF NOT EXISTS betweenness real,
  ADD COLUMN IF NOT EXISTS eigenvector real,
  ADD COLUMN IF NOT EXISTS neo4j_node_id text,
  ADD COLUMN IF NOT EXISTS redis_centroid_key text;

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS latent_64 bytea;

-- ── Standardize column constraints and fill nulls ────────────────────────
ALTER TABLE atlas_packets ALTER COLUMN permissions SET DEFAULT '{"visibility":"internal","can_write":false,"can_execute":false,"can_export":false,"source":"repo_index"}'::jsonb;
UPDATE atlas_packets SET permissions = '{"visibility":"internal","can_write":false,"can_execute":false,"can_export":false,"source":"repo_index"}'::jsonb WHERE permissions IS NULL OR permissions = '{}'::jsonb;
ALTER TABLE atlas_packets ALTER COLUMN permissions SET NOT NULL;

ALTER TABLE atlas_packets ALTER COLUMN topology SET DEFAULT '{}'::jsonb;
UPDATE atlas_packets SET topology = '{}'::jsonb WHERE topology IS NULL;
ALTER TABLE atlas_packets ALTER COLUMN topology SET NOT NULL;

ALTER TABLE atlas_packets ALTER COLUMN vectors SET DEFAULT '{}'::jsonb;
UPDATE atlas_packets SET vectors = '{}'::jsonb WHERE vectors IS NULL;
ALTER TABLE atlas_packets ALTER COLUMN vectors SET NOT NULL;

-- ── Indexes ──────────────────────────────────────────────────────────────
-- Trigram for file_path fuzzy search
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_path_trgm
  ON atlas_packets USING gin (file_path gin_trgm_ops);

-- JSONB GIN indexes for path/envelope searches
CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin_pathops
  ON atlas_packets USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_permissions_gin_pathops
  ON atlas_packets USING gin (permissions jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_topology_gin_pathops
  ON atlas_packets USING gin (topology jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_vectors_gin_pathops
  ON atlas_packets USING gin (vectors jsonb_path_ops);

-- Scalar topology indexes
CREATE INDEX IF NOT EXISTS idx_atlas_packets_pagerank_desc
  ON atlas_packets (pagerank DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_neo4j_node_id
  ON atlas_packets (neo4j_node_id) WHERE neo4j_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_redis_centroid_key
  ON atlas_packets (redis_centroid_key) WHERE redis_centroid_key IS NOT NULL;
