-- DRAFT, NOT APPLIED. Adds a nullable packet_uuid column to route_runtime_packets so the
-- reward writer can key on the same UUID the ACE route issues.
--
-- Pre-image (read-only, 2026-10-25):
--   * route_runtime_packets: 11 rows, id bigint PK, packet_key entirely NULL, no packet_uuid column.
--   * Existing rows stay NULL, so this is additive and backfills nothing.
--   * The partial unique index allows any number of NULLs.
--
-- Code that must change in the same release (NOT in this file):
--   * the ACE route must write packet_uuid (randomUUID) when it creates a route packet;
--   * packet-reward-writer.ts must read route_runtime_packets.packet_uuid (not packet_uuid
--     from a missing table) and must stop reading the nonexistent prompt_hash and reward columns.
--
-- Rehearsal (ends in ROLLBACK):
--   BEGIN; \i <this file>; UPDATE route_runtime_packets SET packet_uuid = '22222222-2222-4222-8222-222222222222' WHERE id = (SELECT min(id) FROM route_runtime_packets); ROLLBACK;
-- Post-check after an approved apply:
--   SELECT count(*) FILTER (WHERE packet_uuid IS NOT NULL) AS with_uuid, count(*) AS total FROM route_runtime_packets;

ALTER TABLE route_runtime_packets
  ADD COLUMN IF NOT EXISTS packet_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS route_runtime_packets_packet_uuid_uq
  ON route_runtime_packets (packet_uuid)
  WHERE packet_uuid IS NOT NULL;
