-- Glyph Records table — durable storage for GlyphRecord schema
-- Mirrors glyph-mappers.ts GlyphRecordDbRow + Drizzle schema-postgres.ts glyphRecords table
-- Run: psql $DATABASE_URL -f drizzle/manual/20260416_glyph_records.sql

CREATE TABLE IF NOT EXISTS glyph_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  glyph_id         VARCHAR(64)  NOT NULL UNIQUE,
  source_id        VARCHAR(255) NOT NULL,
  type             VARCHAR(32)  NOT NULL DEFAULT 'chunk',
  section          VARCHAR(32),                          -- GlyphSection: FACTS|LEGAL_AUTHORITY|CLAIMS|PRAYER_HOLDING
  summary          TEXT         NOT NULL DEFAULT '',
  tags             JSONB        NOT NULL DEFAULT '[]',
  jsonb_key_hints  JSONB        NOT NULL DEFAULT '[]',
  topo4d           JSONB        NOT NULL DEFAULT '[0,0,0,0]', -- [f32,f32,f32,f32] SOM/UMAP 4d projection
  som_cluster      INTEGER,
  centroid_id      INTEGER,
  kag_neighbors    JSONB        NOT NULL DEFAULT '[]',   -- glyphId or sourceId string array
  dag_prev         JSONB        NOT NULL DEFAULT '[]',   -- upstream DAG node IDs
  grpo_reward_score REAL,
  source_name      VARCHAR(512),
  entities         JSONB        NOT NULL DEFAULT '[]',
  record_json      JSONB        NOT NULL DEFAULT '{}',   -- full GlyphRecord sans embedding768
  schema_version   INTEGER      NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS glyph_records_glyph_id_idx   ON glyph_records (glyph_id);
CREATE INDEX IF NOT EXISTS glyph_records_source_idx      ON glyph_records (source_id);
CREATE INDEX IF NOT EXISTS glyph_records_section_idx     ON glyph_records (section);
CREATE INDEX IF NOT EXISTS glyph_records_cluster_idx     ON glyph_records (som_cluster);
CREATE INDEX IF NOT EXISTS glyph_records_centroid_idx    ON glyph_records (centroid_id);
CREATE INDEX IF NOT EXISTS glyph_records_reward_idx      ON glyph_records (grpo_reward_score DESC NULLS LAST);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION _glyph_records_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS glyph_records_updated_at ON glyph_records;
CREATE TRIGGER glyph_records_updated_at
  BEFORE UPDATE ON glyph_records
  FOR EACH ROW EXECUTE FUNCTION _glyph_records_set_updated_at();
