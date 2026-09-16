-- Additive canonical source-lineage bridge for atlas_packets.
--
-- atlas_packets.workspace_revision is a legacy integer and cannot represent
-- an admitted sha256 workspace identity. Preserve it for compatibility and
-- store the canonical revision in workspace_revision_key instead. Historical
-- rows remain nullable and are not backfilled by this migration.

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS workspace_revision_key text,
  ADD COLUMN IF NOT EXISTS lineage_binding_checksum text,
  ADD COLUMN IF NOT EXISTS lineage_producer_revision text;

COMMENT ON COLUMN atlas_packets.workspace_revision_key IS
  'Canonical admitted workspace revision key; nullable for historical rows. Never derive from legacy integer workspace_revision.';
COMMENT ON COLUMN atlas_packets.lineage_binding_checksum IS
  'Checksum of the exact workspace/source binding used to admit this packet row.';
COMMENT ON COLUMN atlas_packets.lineage_producer_revision IS
  'Revision of the producer that established packet source lineage.';

CREATE INDEX IF NOT EXISTS idx_atlas_packets_workspace_revision_key_source
  ON atlas_packets (workspace_revision_key, source_ref)
  WHERE workspace_revision_key IS NOT NULL AND source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_lineage_binding_checksum
  ON atlas_packets (lineage_binding_checksum)
  WHERE lineage_binding_checksum IS NOT NULL;
