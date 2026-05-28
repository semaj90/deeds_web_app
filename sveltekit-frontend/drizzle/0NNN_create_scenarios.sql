-- Migration: create scenarios table
-- NOTE: This migration creates the core table and a uniqueness index.
-- If your deployment requires a manual HNSW index, review and apply separately.
CREATE EXTENSION IF NOT EXISTS pgvector;

CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  source_ref varchar(255) NOT NULL,
  content_hash varchar(128) NOT NULL,
  name text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  embedding vector(768),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS scenarios_source_content_hash_key
  ON scenarios (source_ref, content_hash);

-- Optional HNSW index for vector similarity (uncomment if pgvector hnsw extension is available)
-- CREATE INDEX IF NOT EXISTS scenarios_embedding_hnsw_idx
--   ON scenarios USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
