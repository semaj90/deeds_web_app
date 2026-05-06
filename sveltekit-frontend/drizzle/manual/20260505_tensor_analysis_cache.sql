-- 20260505_tensor_analysis_cache.sql
--
-- Adds:
--   1. tensor_analysis_cache   — per-stableKey GPU projection + topo byte cache
--   2. topology_positions cols — topo_byte, source_kind, source_hash (additive)
--
-- Safe to re-run (all CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── 1. tensor_analysis_cache ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tensor_analysis_cache (
  stable_key             TEXT PRIMARY KEY,
  content_hash           TEXT NOT NULL,

  topo_byte              SMALLINT NOT NULL DEFAULT 0,
  topo_hex               TEXT     NOT NULL DEFAULT '0x00',
  topo_class             TEXT     NOT NULL DEFAULT 'unclassified',

  manifold4_x            REAL     NOT NULL DEFAULT 0,
  manifold4_y            REAL     NOT NULL DEFAULT 0,
  manifold4_z            REAL     NOT NULL DEFAULT 0,
  manifold4_w            REAL     NOT NULL DEFAULT 0,

  centroid_key           TEXT,
  som_cluster            SMALLINT,

  graph_authority_score  REAL     NOT NULL DEFAULT 0,
  tensor_affinity_score  REAL     NOT NULL DEFAULT 0,

  tensor_json            JSONB    NOT NULL DEFAULT '{}',
  qdrant_payload         JSONB    NOT NULL DEFAULT '{}',
  output_meta            JSONB    NOT NULL DEFAULT '{}',

  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tensor_analysis_cache_topo_byte_idx
  ON tensor_analysis_cache(topo_byte);

CREATE INDEX IF NOT EXISTS tensor_analysis_cache_centroid_idx
  ON tensor_analysis_cache(centroid_key);

CREATE INDEX IF NOT EXISTS tensor_analysis_cache_json_gin
  ON tensor_analysis_cache USING GIN(tensor_json);

CREATE INDEX IF NOT EXISTS tensor_analysis_cache_authority_idx
  ON tensor_analysis_cache(graph_authority_score DESC);

-- ── 2. topology_positions — additive columns ──────────────────────────────────

ALTER TABLE topology_positions
  ADD COLUMN IF NOT EXISTS topo_byte    SMALLINT,
  ADD COLUMN IF NOT EXISTS source_kind  TEXT,
  ADD COLUMN IF NOT EXISTS source_hash  TEXT;

CREATE INDEX IF NOT EXISTS topology_positions_topo_byte_idx
  ON topology_positions(topo_byte);

-- ── 3. Trigger: auto-update updated_at ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_tensor_analysis_cache_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tensor_analysis_cache_updated_at_trig
  ON tensor_analysis_cache;

CREATE TRIGGER tensor_analysis_cache_updated_at_trig
  BEFORE UPDATE ON tensor_analysis_cache
  FOR EACH ROW EXECUTE FUNCTION update_tensor_analysis_cache_updated_at();