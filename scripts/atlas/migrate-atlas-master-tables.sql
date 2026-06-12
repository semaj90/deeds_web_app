-- migrate-atlas-master-tables.sql
-- Creates parent_atlas_index, atlas_toc_entries, atlas_paths
-- Extends atlas_feature_map with offline compiler columns
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ── parent_atlas_index ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_atlas_index (
  atlas_id      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title         text NOT NULL,
  version       text NOT NULL DEFAULT '1.0',
  generated_at  timestamptz NOT NULL DEFAULT now(),
  section_count integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived'))
);

-- ── atlas_toc_entries ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_toc_entries (
  entry_id      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  atlas_id      text NOT NULL REFERENCES parent_atlas_index(atlas_id) ON DELETE CASCADE,
  section_path  text NOT NULL,        -- e.g. '3.2.1'
  parent_path   text,                 -- e.g. '3.2'
  title         text NOT NULL,
  source_ref    text,
  feature_id    text,
  community_id  integer,
  summary       text,
  rank_score    real NOT NULL DEFAULT 0,
  depth         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_toc_atlas_id_idx    ON atlas_toc_entries(atlas_id);
CREATE INDEX IF NOT EXISTS atlas_toc_section_idx     ON atlas_toc_entries(section_path);
CREATE INDEX IF NOT EXISTS atlas_toc_feature_id_idx  ON atlas_toc_entries(feature_id);
CREATE INDEX IF NOT EXISTS atlas_toc_community_idx   ON atlas_toc_entries(community_id);

-- ── atlas_paths ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_paths (
  path_id     text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  start_key   text NOT NULL,  -- packet_key or feature_id
  end_key     text NOT NULL,
  path_nodes  jsonb NOT NULL DEFAULT '[]',   -- ordered list of packet_keys
  path_edges  jsonb NOT NULL DEFAULT '[]',   -- ordered list of {from,to,type,weight}
  score       real NOT NULL DEFAULT 0,
  reason      text,
  hop_count   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_paths_start_key_idx ON atlas_paths(start_key);
CREATE INDEX IF NOT EXISTS atlas_paths_end_key_idx   ON atlas_paths(end_key);
CREATE INDEX IF NOT EXISTS atlas_paths_score_idx     ON atlas_paths(score DESC);

-- ── atlas_feature_map extensions ────────────────────────────────────────────
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS canonical_name   text;
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS source_refs      jsonb  DEFAULT '[]';
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS packet_keys      jsonb  DEFAULT '[]';
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS qdrant_point_ids jsonb  DEFAULT '[]';
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS neo4j_node_ids   jsonb  DEFAULT '[]';
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS pagerank         real   DEFAULT 0;
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS centrality       real   DEFAULT 0;
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS summary          text;
ALTER TABLE atlas_feature_map ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS afm_feature_id_idx    ON atlas_feature_map(feature_id);
CREATE INDEX IF NOT EXISTS afm_community_id_idx  ON atlas_feature_map(cluster_id);
CREATE INDEX IF NOT EXISTS afm_pagerank_idx      ON atlas_feature_map(pagerank DESC);
