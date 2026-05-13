-- 20260513_repair_tensor_cache.sql
-- Adds missing columns to tensor_analysis_cache

ALTER TABLE tensor_analysis_cache
  ADD COLUMN IF NOT EXISTS topo_hex               TEXT     NOT NULL DEFAULT '0x00',
  ADD COLUMN IF NOT EXISTS topo_class             TEXT     NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS manifold4_x            REAL     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manifold4_y            REAL     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manifold4_z            REAL     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manifold4_w            REAL     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS centroid_key           TEXT,
  ADD COLUMN IF NOT EXISTS som_cluster            SMALLINT,
  ADD COLUMN IF NOT EXISTS graph_authority_score  REAL     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tensor_affinity_score  REAL     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qdrant_payload         JSONB    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS output_meta            JSONB    NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS tensor_analysis_cache_centroid_idx
  ON tensor_analysis_cache(centroid_key);

CREATE INDEX IF NOT EXISTS tensor_analysis_cache_authority_idx
  ON tensor_analysis_cache(graph_authority_score DESC);
