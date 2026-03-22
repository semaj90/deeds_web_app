-- APPLIED -- DO NOT RE-RUN: contains DROP TRIGGER IF EXISTS on line 53, migration already applied to legal_ai_db
-- Drizzle-compatible raw SQL migration: 0001_create_reports_table.sql
-- Creates `reports` table with pgvector column and recommended indexes

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(64) NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  tags jsonb DEFAULT '[]'::jsonb,
  auto_keywords jsonb DEFAULT '[]'::jsonb,
  -- NOTE: embedding dimension should match your embedding model. embeddinggemma:latest uses 384 dims.
  embedding vector(384),
  source_uri text,
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at);

-- IVFFLAT index (pgvector) - optional
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE tablename = 'reports' AND indexname = 'reports_embedding_ivfflat_idx'
    ) THEN
        EXECUTE 'CREATE INDEX reports_embedding_ivfflat_idx ON reports USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);';
    END IF;
EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'pgvector ivfflat operator not available; skipping ivfflat index creation.';
END$$;

-- JSONB GIN indexes
CREATE INDEX IF NOT EXISTS idx_reports_tags_gin ON reports USING gin (tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_reports_auto_keywords_gin ON reports USING gin (auto_keywords jsonb_path_ops);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp ON reports;
CREATE TRIGGER set_timestamp BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
