-- Migration: Promote JSONB metadata fields to proper indexed columns
-- Date: 2026-04-10
-- Purpose: Enable ON CONFLICT upsert + faster reads on ace_chunks
-- Safe: Uses ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS

-- 1. Promote JSONB metadata fields to proper indexed columns
ALTER TABLE ace_chunks ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE ace_chunks ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE ace_chunks ADD COLUMN IF NOT EXISTS pipeline_version TEXT;

-- 2. Backfill from JSONB metadata for existing rows
UPDATE ace_chunks SET content_hash = metadata->>'content_hash'
  WHERE content_hash IS NULL AND metadata->>'content_hash' IS NOT NULL;
UPDATE ace_chunks SET embedding_model = metadata->>'embedding_model'
  WHERE embedding_model IS NULL AND metadata->>'embedding_model' IS NOT NULL;
UPDATE ace_chunks SET pipeline_version = metadata->>'pipeline_version'
  WHERE pipeline_version IS NULL AND metadata->>'pipeline_version' IS NOT NULL;

-- 3. UNIQUE constraint for ON CONFLICT upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_ace_chunks_case_hash_type
  ON ace_chunks (case_id, content_hash, chunk_type);

-- 4. Indexes for read/invalidation queries
CREATE INDEX IF NOT EXISTS idx_ace_chunks_pipeline_version ON ace_chunks (pipeline_version);
CREATE INDEX IF NOT EXISTS idx_ace_chunks_created_at ON ace_chunks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ace_chunks_read_path
  ON ace_chunks (case_id, pipeline_version, quality_score, created_at DESC);

-- Verification
DO $$
DECLARE
  col_count INTEGER;
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'ace_chunks'
    AND column_name IN ('content_hash', 'embedding_model', 'pipeline_version');

  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE tablename = 'ace_chunks'
    AND indexname = 'uq_ace_chunks_case_hash_type';

  RAISE NOTICE 'ace_chunks: % promoted columns, % unique index', col_count, idx_count;
END $$;
