-- Generated adaptive schema repair migration
-- Date: 2026-06-15T04:38:09.761Z
-- This file contains additive-only operations: CREATE TABLE/INDEX, ALTER ADD COLUMN
-- No DROP, RENAME, or destructive operations

BEGIN;

ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_text text;

ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_embedding vector;

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_packets (packet_key);

CREATE  INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_packets (source_ref);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_topology_packet_key ON atlas_topology_index (packet_key);

CREATE  INDEX IF NOT EXISTS idx_atlas_topology_authority ON atlas_topology_index (w_authority);

COMMIT;
