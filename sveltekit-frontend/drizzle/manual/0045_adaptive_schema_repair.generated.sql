-- Generated adaptive schema repair migration
-- Date: 2026-06-15T08:24:09.880Z
-- This file contains additive-only operations: CREATE TABLE/INDEX, ALTER ADD COLUMN
-- No DROP, RENAME, or destructive operations

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_packets (packet_key);

CREATE  INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_packets (source_ref);

COMMIT;
