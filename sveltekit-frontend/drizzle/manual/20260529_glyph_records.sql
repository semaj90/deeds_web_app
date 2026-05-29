-- Phase 1: Glyph Records Durable Storage
-- Created 2026-05-29
-- Purpose: Provide Postgres home for GlyphRecord instances from ACE packet ingestion

CREATE TABLE IF NOT EXISTS glyph_records (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_ref      text NOT NULL,
  glyph_kind      text NOT NULL,
  section         text NOT NULL,
  record_json     jsonb NOT NULL,
  centroid_id     integer,
  grpo_reward_score real,
  som_cluster     integer,
  embedding_model text NOT NULL DEFAULT 'embeddinggemma:latest',
  batch_id        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS glyph_records_source_ref_idx ON glyph_records(source_ref);
CREATE INDEX IF NOT EXISTS glyph_records_glyph_kind_idx ON glyph_records(glyph_kind);
CREATE INDEX IF NOT EXISTS glyph_records_centroid_id_idx ON glyph_records(centroid_id);
CREATE INDEX IF NOT EXISTS glyph_records_batch_id_idx    ON glyph_records(batch_id);
CREATE INDEX IF NOT EXISTS glyph_records_record_json_gin ON glyph_records USING GIN(record_json);
