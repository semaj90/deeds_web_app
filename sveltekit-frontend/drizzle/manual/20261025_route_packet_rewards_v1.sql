-- APPLIED 2026-10-25. Creates route_packet_rewards for packet-reward-writer.ts.
--
-- Live readback after application: the table is empty and has a valid unique index on
-- packet_uuid. It deliberately has no foreign key to the partial-unique runtime UUID index.
-- The writer verifies the source packet exists before writing its per-packet reward snapshot.
--
-- Read-only verification:
--   SELECT indisunique FROM pg_index WHERE indexrelid = 'route_packet_rewards_packet_uuid_uq'::regclass;

CREATE TABLE IF NOT EXISTS route_packet_rewards (
  id                  bigserial        PRIMARY KEY,
  packet_uuid         uuid             NOT NULL,
  accepted            boolean,
  rejected            boolean,
  edited              boolean,
  cited               boolean,
  latency_ms          double precision,
  token_cost          double precision,
  cache_age_ms        double precision,
  source_ref_overlap  double precision,
  qdrant_score_avg    double precision,
  neo4j_depth         double precision,
  som_cluster_match   double precision,
  feature_id_match    double precision,
  prior_reward        double precision,
  created_at          timestamptz      NOT NULL DEFAULT now()
);

-- One reward row per packet. The writer's ON CONFLICT target is packet_uuid only.
CREATE UNIQUE INDEX IF NOT EXISTS route_packet_rewards_packet_uuid_uq
  ON route_packet_rewards (packet_uuid);
