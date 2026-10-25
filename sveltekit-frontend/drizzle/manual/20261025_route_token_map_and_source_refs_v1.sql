-- 2026-10-25: Add route_token_map and route_packet_source_refs for packet-reward-writer.ts
-- Safe: IF NOT EXISTS, no DROP, no ALTER

CREATE TABLE IF NOT EXISTS route_token_map (
  id              serial  PRIMARY KEY,
  source_ref      text    NOT NULL UNIQUE,
  source_ref_id   integer,
  feature_id      text,
  concept_id      text    GENERATED ALWAYS AS (
    COALESCE(feature_id, regexp_replace(source_ref, '[^a-z0-9]+', '_', 'g'))
  ) STORED,
  token_hint      text    NOT NULL,
  token_budget    integer DEFAULT 64,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  hit_count       integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_map_feature    ON route_token_map(feature_id);
CREATE INDEX IF NOT EXISTS idx_token_map_concept    ON route_token_map(concept_id);
CREATE INDEX IF NOT EXISTS idx_token_map_source_ref ON route_token_map(source_ref);

CREATE TABLE IF NOT EXISTS route_packet_source_refs (
  id          bigserial PRIMARY KEY,
  packet_uuid uuid      NOT NULL,
  source_ref  text      NOT NULL,
  feature_id  text,
  ref_index   smallint  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpsr_packet_uuid ON route_packet_source_refs(packet_uuid);
CREATE INDEX IF NOT EXISTS idx_rpsr_source_ref  ON route_packet_source_refs(source_ref);
CREATE INDEX IF NOT EXISTS idx_rpsr_feature_id  ON route_packet_source_refs(feature_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpsr_uniq ON route_packet_source_refs(packet_uuid, source_ref);
