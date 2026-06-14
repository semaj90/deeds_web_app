/**
 * 0026_feature_metadata_lineage_complete.sql
 *
 * Adds canonical feature_id + source_ref + metadata columns to all searchable packet tables.
 * Makes PostgreSQL the source of truth for feature lineage.
 *
 * Tier 1 (Critical for search):
 * - atlas_packets: add file_path (feature_id, source_ref, metadata already present)
 * - nes_chrom_packets: add feature_id, source_ref, metadata
 * - glyph_records: add feature_id, source_ref, file_path, metadata
 * - codebase_chunk_index: add feature_id, source_ref, feature_label, metadata
 *
 * Tier 2 (Feature infrastructure):
 * - atlas_feature_map: add source_ref, file_path, feature_label, metadata
 * - atlas_source_ref_dict: add feature_id, feature_label, metadata
 *
 * All columns added with IF NOT EXISTS for idempotence.
 */

-- ══════════════════════════════════════════════════════════════════════════════
-- TIER 1: CRITICAL SEARCHABLE PACKET TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- atlas_packets: add file_path (others already present from prior migrations)
ALTER TABLE IF EXISTS atlas_packets
  ADD COLUMN IF NOT EXISTS file_path TEXT;

-- nes_chrom_packets: complete lineage
ALTER TABLE IF EXISTS nes_chrom_packets
  ADD COLUMN IF NOT EXISTS feature_id TEXT;

ALTER TABLE IF EXISTS nes_chrom_packets
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

ALTER TABLE IF EXISTS nes_chrom_packets
  ADD COLUMN IF NOT EXISTS file_path TEXT;

ALTER TABLE IF EXISTS nes_chrom_packets
  ADD COLUMN IF NOT EXISTS feature_label TEXT;

ALTER TABLE IF EXISTS nes_chrom_packets
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- glyph_records: complete lineage
ALTER TABLE IF EXISTS glyph_records
  ADD COLUMN IF NOT EXISTS feature_id TEXT;

ALTER TABLE IF EXISTS glyph_records
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

ALTER TABLE IF EXISTS glyph_records
  ADD COLUMN IF NOT EXISTS file_path TEXT;

ALTER TABLE IF EXISTS glyph_records
  ADD COLUMN IF NOT EXISTS feature_label TEXT;

ALTER TABLE IF EXISTS glyph_records
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- codebase_chunk_index: complete lineage
ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS feature_id TEXT;

ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS feature_label TEXT;

ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ══════════════════════════════════════════════════════════════════════════════
-- TIER 2: FEATURE INFRASTRUCTURE TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- atlas_feature_map: add lineage fields
ALTER TABLE IF EXISTS atlas_feature_map
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

ALTER TABLE IF EXISTS atlas_feature_map
  ADD COLUMN IF NOT EXISTS file_path TEXT;

ALTER TABLE IF EXISTS atlas_feature_map
  ADD COLUMN IF NOT EXISTS feature_label TEXT;

ALTER TABLE IF EXISTS atlas_feature_map
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- atlas_source_ref_dict: add feature fields
ALTER TABLE IF EXISTS atlas_source_ref_dict
  ADD COLUMN IF NOT EXISTS feature_id TEXT;

ALTER TABLE IF EXISTS atlas_source_ref_dict
  ADD COLUMN IF NOT EXISTS feature_label TEXT;

ALTER TABLE IF EXISTS atlas_source_ref_dict
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES: Enable fast joins on feature_id + source_ref
-- ══════════════════════════════════════════════════════════════════════════════

-- Tier 1 indexes
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_path
  ON atlas_packets(file_path)
  WHERE file_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_id
  ON nes_chrom_packets(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_source_ref
  ON nes_chrom_packets(source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_source
  ON nes_chrom_packets(feature_id, source_ref)
  WHERE feature_id IS NOT NULL AND source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_metadata_gin
  ON nes_chrom_packets USING GIN(metadata);

CREATE INDEX IF NOT EXISTS idx_glyph_records_feature_id
  ON glyph_records(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_glyph_records_source_ref
  ON glyph_records(source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_glyph_records_metadata_gin
  ON glyph_records USING GIN(metadata);

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_feature_id
  ON codebase_chunk_index(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_source_ref
  ON codebase_chunk_index(source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_metadata_gin
  ON codebase_chunk_index USING GIN(metadata);

-- Tier 2 indexes
CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_source_ref
  ON atlas_feature_map(source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_metadata_gin
  ON atlas_feature_map USING GIN(metadata);

CREATE INDEX IF NOT EXISTS idx_atlas_source_ref_dict_feature_id
  ON atlas_source_ref_dict(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_source_ref_dict_metadata_gin
  ON atlas_source_ref_dict USING GIN(metadata);
