-- APPLIED 2026-10-25. Adds a nullable packet_uuid column to route_runtime_packets so the
-- reward writer can key on the same UUID the ACE route issues.
--
-- Pre-image (read-only, 2026-10-25):
--   * route_runtime_packets: 11 rows, id bigint PK, packet_key entirely NULL, no packet_uuid column.
--   * Existing rows stay NULL, so this is additive and backfills nothing.
--   * The partial unique index allows any number of NULLs.
--
-- Live readback after application: packet_uuid exists, its partial unique index is valid and
-- ready, and all 11 historical rows remain NULL. The ACE route now persists and returns its
-- generated UUID; the reward writer reads only route_runtime_packets-owned columns.
--
-- Rehearsal (ends in ROLLBACK):
--   BEGIN; \i <this file>; UPDATE route_runtime_packets SET packet_uuid = '22222222-2222-4222-8222-222222222222' WHERE id = (SELECT min(id) FROM route_runtime_packets); ROLLBACK;
-- Read-only verification:
--   SELECT count(*) FILTER (WHERE packet_uuid IS NOT NULL) AS with_uuid, count(*) AS total FROM route_runtime_packets;

ALTER TABLE route_runtime_packets
  ADD COLUMN IF NOT EXISTS packet_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS route_runtime_packets_packet_uuid_uq
  ON route_runtime_packets (packet_uuid)
  WHERE packet_uuid IS NOT NULL;
