-- Add missing evidence columns to match full Drizzle schema
-- DB currently has 14 cols; schema defines 30+. This closes the gap.
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- Run: psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f drizzle/manual/20260510_evidence_columns.sql

ALTER TABLE "evidence"
  ADD COLUMN IF NOT EXISTS "file_path"        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "file_size"        INTEGER,
  ADD COLUMN IF NOT EXISTS "hash"             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "source"           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "date_obtained"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "chain_of_custody" JSONB,
  ADD COLUMN IF NOT EXISTS "metadata"         JSONB,
  ADD COLUMN IF NOT EXISTS "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "user_id"          UUID,
  ADD COLUMN IF NOT EXISTS "evidence_number"  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "type"             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "summary"          TEXT,
  ADD COLUMN IF NOT EXISTS "pos_x"            INTEGER,
  ADD COLUMN IF NOT EXISTS "pos_y"            INTEGER,
  ADD COLUMN IF NOT EXISTS "collected_at"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "collected_by"     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "mime_type"        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "tags"             JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "ai_tags"          JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "ai_analysis"      JSONB,
  ADD COLUMN IF NOT EXISTS "ai_summary"       TEXT,
  ADD COLUMN IF NOT EXISTS "verified_at"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "verified"         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status"           VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "extracted_text"   TEXT,
  ADD COLUMN IF NOT EXISTS "entities"         JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "keywords"         JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "deleted_at"       TIMESTAMPTZ;

-- pgvector column requires the extension to be loaded
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "evidence"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768);

-- Indexes for commonly queried columns
CREATE INDEX IF NOT EXISTS "evidence_status_idx"     ON "evidence" ("status");
CREATE INDEX IF NOT EXISTS "evidence_verified_idx"   ON "evidence" ("verified");
CREATE INDEX IF NOT EXISTS "evidence_deleted_at_idx" ON "evidence" ("deleted_at");
CREATE INDEX IF NOT EXISTS "evidence_tags_gin_idx"   ON "evidence" USING gin("tags");
CREATE INDEX IF NOT EXISTS "evidence_entities_gin_idx" ON "evidence" USING gin("entities");
