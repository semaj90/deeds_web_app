-- drizzle/manual/20260604_add_lod_source_kind_columns.sql
-- Sidecar migration: Add LOD, source_kind, and lane columns to parent_atlas_documents
-- Reason: ROM-bank memory model requires LOD0/1/2 columns and source_kind classification
-- Applied via: node scripts/atlas/derive-lod-summaries.mjs --apply (after manual run)
-- Safe to run repeatedly (IF NOT EXISTS / DO NOTHING guards)

-- source_kind: 'source' | 'dependency' | 'config' | 'test' | 'generated' | 'doc'
ALTER TABLE parent_atlas_documents
  ADD COLUMN IF NOT EXISTS source_kind        TEXT    DEFAULT 'source',
  ADD COLUMN IF NOT EXISTS profile_card_visible BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS index_lane         TEXT    DEFAULT 'source',
  ADD COLUMN IF NOT EXISTS summary_lod0       TEXT,   -- tags only (auto-derived, no LLM)
  ADD COLUMN IF NOT EXISTS summary_lod1       TEXT,   -- 1-line rule-based (no LLM)
  ADD COLUMN IF NOT EXISTS summary_lod2       TEXT,   -- paragraph (Gemma4, = current summary)
  ADD COLUMN IF NOT EXISTS source_ref_id      INTEGER; -- compressed int for hot-cache packets

-- Copy existing summary → lod2
UPDATE parent_atlas_documents
  SET summary_lod2 = summary
  WHERE summary IS NOT NULL AND summary != ''
    AND summary_lod2 IS NULL;

-- Mark already-quarantined vendor rows
UPDATE parent_atlas_documents
  SET source_kind = 'dependency',
      profile_card_visible = FALSE,
      index_lane = 'dependency'
  WHERE 'vendor' = ANY(COALESCE(tags, '{}'))
    AND source_kind = 'source';

-- Index for fast LOD lookups
CREATE INDEX IF NOT EXISTS idx_pad_source_kind ON parent_atlas_documents(source_kind);
CREATE INDEX IF NOT EXISTS idx_pad_index_lane  ON parent_atlas_documents(index_lane);
CREATE INDEX IF NOT EXISTS idx_pad_source_ref_id ON parent_atlas_documents(source_ref_id);
CREATE INDEX IF NOT EXISTS idx_pad_lod1 ON parent_atlas_documents(summary_lod1) WHERE summary_lod1 IS NOT NULL;

COMMENT ON COLUMN parent_atlas_documents.source_kind IS 'source | dependency | config | test | generated | doc';
COMMENT ON COLUMN parent_atlas_documents.summary_lod0 IS 'LOD0: behavior tag string, auto-derived, no LLM. Hot cache.';
COMMENT ON COLUMN parent_atlas_documents.summary_lod1 IS 'LOD1: 1-line rule-based summary. Warm cache.';
COMMENT ON COLUMN parent_atlas_documents.summary_lod2 IS 'LOD2: Gemma4 paragraph summary. Postgres/Qdrant.';
COMMENT ON COLUMN parent_atlas_documents.source_ref_id IS 'Integer code for compressed NES-style packet encoding.';
COMMENT ON COLUMN parent_atlas_documents.index_lane IS 'source | dependency | config | test — for lane routing';
COMMENT ON COLUMN parent_atlas_documents.profile_card_visible IS 'false for vendor/generated rows';
