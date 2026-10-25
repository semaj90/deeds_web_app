-- STUB tables for the route packet endpoints (ace/packets/+server.ts). Creates only the four tables
-- that are MISSING live (checked 2026-10-25). route_packet_source_refs and route_token_map already
-- exist and are NOT touched here.
-- Columns are limited to what the endpoints read or insert. Nothing is backfilled.
-- Key: packet_uuid (uuid), matching the endpoints. route_runtime_packets remains the runtime store.
--
-- Rehearsal (ends in ROLLBACK): BEGIN; \i <this file>; ROLLBACK;
-- Post-check: SELECT count(*) FROM information_schema.tables WHERE table_name IN
--   ('route_packets','route_state_snapshots','route_packet_facts','route_packet_edges');   -- expect 4

CREATE TABLE IF NOT EXISTS route_packets (
  id           bigserial        PRIMARY KEY,
  packet_uuid  uuid             NOT NULL UNIQUE,
  feature_id   text,
  som_cluster  text,
  captured_at  timestamptz      NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_state_snapshots (
  id                bigserial    PRIMARY KEY,
  packet_uuid       uuid         NOT NULL REFERENCES route_packets(packet_uuid) ON DELETE CASCADE,
  state_key         text         NOT NULL,
  compressed_state  text,
  token_map         jsonb,
  UNIQUE (packet_uuid, state_key)
);

CREATE TABLE IF NOT EXISTS route_packet_facts (
  id           bigserial        PRIMARY KEY,
  packet_uuid  uuid             NOT NULL REFERENCES route_packets(packet_uuid) ON DELETE CASCADE,
  fact_type    text             NOT NULL,
  fact_key     text             NOT NULL,
  fact_value   text,
  score        double precision,
  metadata     jsonb,
  UNIQUE (packet_uuid, fact_type, fact_key)
);

CREATE TABLE IF NOT EXISTS route_packet_edges (
  id           bigserial        PRIMARY KEY,
  packet_uuid  uuid             NOT NULL REFERENCES route_packets(packet_uuid) ON DELETE CASCADE,
  src          text             NOT NULL,
  dst          text             NOT NULL,
  edge_type    text             NOT NULL,
  weight       double precision,
  metadata     jsonb,
  UNIQUE (packet_uuid, src, dst, edge_type)
);
