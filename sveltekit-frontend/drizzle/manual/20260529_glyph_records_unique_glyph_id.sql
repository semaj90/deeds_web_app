-- Migration: add unique index on glyph_records.glyph_id (preview safe)
-- Created: 2026-05-29 by automation

CREATE UNIQUE INDEX IF NOT EXISTS glyph_records_glyph_id_uidx
ON glyph_records (glyph_id)
WHERE glyph_id IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS glyph_records_glyph_id_uidx;
