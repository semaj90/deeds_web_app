-- Migration: 2026-06-07 — route_packet_rewards + route_token_map
-- Safe: IF NOT EXISTS, no DROP, no ALTER

-- ── RL reward outcomes per packet ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_packet_rewards (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  packet_uuid     uuid    NOT NULL REFERENCES route_runtime_packets(packet_uuid) ON DELETE CASCADE,
  -- Outcome signal
  accepted        boolean,              -- user accepted / cited the answer
  rejected        boolean,              -- user regenerated or dismissed
  edited          boolean,              -- user edited the answer before use
  cited           boolean,              -- answer was referenced in a document
  -- Latency quality
  latency_ms      integer,
  token_cost      integer,              -- response_tokens charged
  -- XGBoost feature snapshot at decision time
  cache_age_ms    integer,              -- ms since this prompt_hash was last cached
  source_ref_overlap real,             -- fraction of source_refs matching prior successful packet
  qdrant_score_avg   real,
  neo4j_depth        integer,
  som_cluster_match  boolean,
  feature_id_match   boolean,
  prior_reward       real,             -- reward from most-recent same feature_id packet
  -- Derived routing label
  route_success   boolean GENERATED ALWAYS AS (
    COALESCE(accepted, false) OR COALESCE(cited, false)
  ) STORED,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_rewards_packet  ON route_packet_rewards(packet_uuid);
CREATE INDEX IF NOT EXISTS idx_route_rewards_success ON route_packet_rewards(route_success);
CREATE INDEX IF NOT EXISTS idx_route_rewards_feature ON route_packet_rewards(packet_uuid) WHERE route_success = true;

-- ── Symbolic token remapping ─────────────────────────────────────────────────
-- Maps source_ref → concept_id → feature_id → compressed token hint
-- Lets us swap 3,000 token JSON blobs for compact symbolic state hints
CREATE TABLE IF NOT EXISTS route_token_map (
  id              serial  PRIMARY KEY,
  source_ref      text    NOT NULL UNIQUE,
  source_ref_id   integer,              -- FK to parent_atlas_documents.source_ref_id when available
  feature_id      text,
  concept_id      text    GENERATED ALWAYS AS (
    COALESCE(feature_id, regexp_replace(source_ref, '[^a-z0-9]+', '_', 'g'))
  ) STORED,
  token_hint      text    NOT NULL,     -- e.g. <ACE_CONTEXT>, <EVIDENCE_LANE>, etc.
  token_budget    integer DEFAULT 64,   -- max tokens this hint expands to
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  hit_count       integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_map_feature    ON route_token_map(feature_id);
CREATE INDEX IF NOT EXISTS idx_token_map_concept    ON route_token_map(concept_id);
CREATE INDEX IF NOT EXISTS idx_token_map_source_ref ON route_token_map(source_ref);

-- ── route_packet_source_refs: normalized source_ref join table ────────────────
CREATE TABLE IF NOT EXISTS route_packet_source_refs (
  id          bigserial PRIMARY KEY,
  packet_uuid uuid      NOT NULL REFERENCES route_runtime_packets(packet_uuid) ON DELETE CASCADE,
  source_ref  text      NOT NULL,
  feature_id  text,
  ref_index   smallint  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpsr_packet_uuid ON route_packet_source_refs(packet_uuid);
CREATE INDEX IF NOT EXISTS idx_rpsr_source_ref  ON route_packet_source_refs(source_ref);
CREATE INDEX IF NOT EXISTS idx_rpsr_feature_id  ON route_packet_source_refs(feature_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpsr_uniq ON route_packet_source_refs(packet_uuid, source_ref);

-- Backfill from existing packets
INSERT INTO route_packet_source_refs (packet_uuid, source_ref, feature_id, ref_index)
SELECT
  p.packet_uuid,
  ref.source_ref,
  p.feature_id,
  ref.ordinality::smallint - 1
FROM route_runtime_packets p
CROSS JOIN LATERAL (
  SELECT value::text AS source_ref, ordinality
  FROM jsonb_array_elements_text(
    CASE jsonb_typeof(p.source_refs)
      WHEN 'array' THEN p.source_refs
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY
) ref
WHERE ref.source_ref IS NOT NULL AND ref.source_ref <> ''
ON CONFLICT (packet_uuid, source_ref) DO NOTHING;

-- ── route_supervision_graph: materialized provenance view ─────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS route_supervision_graph AS
SELECT
  p.packet_uuid,
  p.feature_id,
  p.query_hash,
  p.som_cluster,
  p.latency_ms,
  p.cache_hit,
  p.cache_tier,
  p.captured_at,
  s.source_ref,
  s.ref_index,
  c.dst                   AS called_function,
  c.edge_type             AS call_edge_type,
  c.weight                AS call_weight,
  d.table_name,
  d.operation             AS db_operation,
  d.call_type             AS db_call_type,
  r.route_success,
  r.prior_reward,
  r.source_ref_overlap,
  r.qdrant_score_avg,
  r.som_cluster_match,
  r.feature_id_match,
  r.cache_age_ms
FROM route_runtime_packets p
JOIN route_packet_source_refs s
  ON s.packet_uuid = p.packet_uuid
LEFT JOIN calls_edges c
  ON c.src = s.source_ref AND c.edge_type = 'CALLS'
LEFT JOIN db_usage_calls d
  ON d.source_file = s.source_ref
LEFT JOIN route_packet_rewards r
  ON r.packet_uuid = p.packet_uuid
WITH DATA;

CREATE INDEX IF NOT EXISTS idx_rsg_feature_id      ON route_supervision_graph(feature_id);
CREATE INDEX IF NOT EXISTS idx_rsg_source_ref       ON route_supervision_graph(source_ref);
CREATE INDEX IF NOT EXISTS idx_rsg_called_function  ON route_supervision_graph(called_function);
CREATE INDEX IF NOT EXISTS idx_rsg_table_name       ON route_supervision_graph(table_name);
CREATE INDEX IF NOT EXISTS idx_rsg_route_success    ON route_supervision_graph(route_success);
