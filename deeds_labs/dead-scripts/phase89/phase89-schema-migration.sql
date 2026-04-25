-- Phase 89: Schema Migration for Agentic Self-Learning System
-- Adds version tracking, fix history, and learned patterns

-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add new columns to existing raw_error_embeddings table
ALTER TABLE raw_error_embeddings
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update content_hash for existing rows
UPDATE raw_error_embeddings
SET content_hash = md5(file_path || ':' || COALESCE(line::TEXT, '0') || ':' || message)
WHERE content_hash IS NULL;

-- Make content_hash NOT NULL after populating
ALTER TABLE raw_error_embeddings
  ALTER COLUMN content_hash SET NOT NULL;

-- Create unique constraint (drop first if exists from old schema)
DO $$
BEGIN
  ALTER TABLE raw_error_embeddings
    DROP CONSTRAINT IF EXISTS raw_error_embeddings_source_file_path_line_content_hash_key;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Add unique constraint
ALTER TABLE raw_error_embeddings
  ADD CONSTRAINT raw_error_embeddings_source_file_path_line_content_hash_key
  UNIQUE(source, file_path, line, content_hash);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON raw_error_embeddings(source);
CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON raw_error_embeddings(content_hash);
CREATE INDEX IF NOT EXISTS idx_embeddings_version ON raw_error_embeddings(version);

-- Create version history table
CREATE TABLE IF NOT EXISTS error_embedding_history (
  id SERIAL PRIMARY KEY,
  error_id INTEGER REFERENCES raw_error_embeddings(id),
  version INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  embedding vector(768),
  tags TEXT[],
  content_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_type TEXT NOT NULL -- 'created', 'updated', 'reembedded'
);

CREATE INDEX IF NOT EXISTS idx_history_error_id ON error_embedding_history(error_id);

-- Create fix history table
CREATE TABLE IF NOT EXISTS error_fix_history (
  id SERIAL PRIMARY KEY,
  error_id INTEGER REFERENCES raw_error_embeddings(id),
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_number INTEGER,

  -- Fix details
  fix_strategy TEXT NOT NULL,
  fix_content TEXT NOT NULL,
  fix_diff TEXT,

  -- Context
  surrounding_code TEXT,
  file_type TEXT,
  tags TEXT[],

  -- Validation
  validated BOOLEAN DEFAULT false,
  validation_method TEXT,
  success_score FLOAT DEFAULT 0.0,

  -- Metadata
  fixed_at TIMESTAMPTZ DEFAULT NOW(),
  fixed_by TEXT DEFAULT 'autonomous',
  llm_provider TEXT,
  llm_model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS idx_fix_error_code ON error_fix_history(error_code);
CREATE INDEX IF NOT EXISTS idx_fix_validated ON error_fix_history(validated);
CREATE INDEX IF NOT EXISTS idx_fix_score ON error_fix_history(success_score);

-- Create learned patterns table
CREATE TABLE IF NOT EXISTS learned_fix_patterns (
  id SERIAL PRIMARY KEY,
  pattern_name TEXT UNIQUE NOT NULL,
  error_code TEXT NOT NULL,

  -- Pattern details
  description TEXT,
  trigger_conditions JSONB,
  solution_template TEXT NOT NULL,

  -- Confidence
  times_applied INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  confidence_score FLOAT DEFAULT 0.0,

  -- Context
  applicable_file_types TEXT[],
  required_tags TEXT[],

  -- Embedding for similarity search
  pattern_embedding vector(768),

  -- Metadata
  learned_at TIMESTAMPTZ DEFAULT NOW(),
  last_applied TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_error_code ON learned_fix_patterns(error_code);
CREATE INDEX IF NOT EXISTS idx_pattern_confidence ON learned_fix_patterns(confidence_score);

-- Create knowledge base update log
CREATE TABLE IF NOT EXISTS kb_update_log (
  id SERIAL PRIMARY KEY,
  update_type TEXT NOT NULL, -- 'pattern_added', 'pattern_updated', 'playbook_created'
  entity_id INTEGER,
  entity_type TEXT,
  description TEXT,
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Summary
SELECT
  'raw_error_embeddings' as table_name,
  COUNT(*) as row_count
FROM raw_error_embeddings
UNION ALL
SELECT
  'error_embedding_history' as table_name,
  COUNT(*) as row_count
FROM error_embedding_history
UNION ALL
SELECT
  'error_fix_history' as table_name,
  COUNT(*) as row_count
FROM error_fix_history
UNION ALL
SELECT
  'learned_fix_patterns' as table_name,
  COUNT(*) as row_count
FROM learned_fix_patterns
ORDER BY table_name;
