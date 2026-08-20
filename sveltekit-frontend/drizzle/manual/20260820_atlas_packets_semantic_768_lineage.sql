-- EMB3B1 — canonical semantic_768 lineage for atlas_packets.
--
-- atlas_packets remains the canonical packet/vector owner. This migration does
-- NOT create another embedding table and does NOT touch Qdrant/Valkey.
-- Existing rows remain nullable because historical packets predate canonical
-- source-version receipts. New semantic_768 writes must require these fields at
-- the application boundary before EMB3C permits canonical mutation.

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS source_version_receipt_id text;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_revision
  ON atlas_packets (source_revision);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_version_receipt_id
  ON atlas_packets (source_version_receipt_id);
