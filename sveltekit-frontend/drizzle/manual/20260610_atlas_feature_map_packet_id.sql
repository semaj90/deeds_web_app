-- Add packet_id column to atlas_feature_map
-- Links each source_ref to its canonical NES/CHR packet in nes_chrom_packets.

ALTER TABLE atlas_feature_map
  ADD COLUMN IF NOT EXISTS packet_id TEXT;

CREATE INDEX IF NOT EXISTS atlas_feature_map_packet_id_idx
  ON atlas_feature_map (packet_id)
  WHERE packet_id IS NOT NULL;
