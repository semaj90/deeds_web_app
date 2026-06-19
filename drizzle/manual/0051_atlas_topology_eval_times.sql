-- Migration 0051: atlas_topology_eval_times
-- Pointer-only provenance rows for AE encode, SOM train, centroid cache, and HyperRAG topology lanes.
-- Rule: no vectors, no full payloads — pointers + timings only.
-- One row per operation (encode batch, SOM training run, cache write, replay query).

CREATE TABLE IF NOT EXISTS atlas_topology_eval_times (
  id            bigserial PRIMARY KEY,

  -- Identity pointers (no payload data)
  query_hash    text,                              -- NULL for non-query lanes (encode/train)
  packet_key    text     NOT NULL DEFAULT '',      -- primary identity anchor
  feature_id    text,                              -- from feature index or fallback
  source_ref    text,                              -- file path / chunk ref

  -- Lane discriminator
  -- ae_encode | som_train | centroid_cache | hyperrag | replay
  lane          text     NOT NULL DEFAULT 'hyperrag',

  -- Dimension pointers (no actual vectors)
  input_dim     integer,                           -- 768 for full embedding
  latent_dim    integer,                           -- 64 for routing vector
  som_grid      text,                              -- '20x20', '10x10', etc.

  -- Per-lane timings (ms)
  encode_ms     real,
  som_ms        real,
  redis_ms      real,
  postgres_ms   real,
  total_ms      real,

  -- Outcome
  cache_hit     boolean  DEFAULT false,
  error         text,

  -- Pointer-only metadata (hits summary, counts — no packet bodies)
  -- Expected shape for hyperrag lane:
  --   { "hits": [{"packet_key","feature_id","source_ref","fusion_score","retrieval_strategy"}],
  --     "counts": {"packet_hits":N,"cache_hits":N,"neo4j_expansions":N} }
  metadata      jsonb    DEFAULT '{}'::jsonb,

  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topo_eval_lane
  ON atlas_topology_eval_times (lane);
CREATE INDEX IF NOT EXISTS idx_topo_eval_packet_key
  ON atlas_topology_eval_times (packet_key);
CREATE INDEX IF NOT EXISTS idx_topo_eval_feature_id
  ON atlas_topology_eval_times (feature_id);
CREATE INDEX IF NOT EXISTS idx_topo_eval_query_hash
  ON atlas_topology_eval_times (query_hash)
  WHERE query_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topo_eval_created_at
  ON atlas_topology_eval_times (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topo_eval_metadata_gin
  ON atlas_topology_eval_times USING gin (metadata jsonb_path_ops);

COMMENT ON TABLE  atlas_topology_eval_times                IS 'Pointer-only provenance rows for AE/SOM/centroid/HyperRAG topology lanes. No vectors stored.';
COMMENT ON COLUMN atlas_topology_eval_times.lane           IS 'ae_encode | som_train | centroid_cache | hyperrag | replay';
COMMENT ON COLUMN atlas_topology_eval_times.packet_key     IS 'Primary identity anchor — never NULL in production rows';
COMMENT ON COLUMN atlas_topology_eval_times.feature_id     IS 'Feature cluster label from Parent Atlas MapReduce';
COMMENT ON COLUMN atlas_topology_eval_times.source_ref     IS 'File path or chunk reference — stable cross-store pointer';
COMMENT ON COLUMN atlas_topology_eval_times.metadata       IS 'Hits summary and counts only — no packet bodies, no vectors';
