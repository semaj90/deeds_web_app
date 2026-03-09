-- Migration: Enable pgvector and create pattern analysis tables
-- Run with: psql -d your_database -f 0001_create_pgvector_and_tables.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Stores user documents / artifacts (text extracted from files, notes, etc.)
CREATE TABLE IF NOT EXISTS user_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT,                 -- e.g. "minio://bucket/key" or "note", etc.
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(1536)       -- Gemma embedding dimension (adjust as needed)
);

-- Optional cache of computed "patterns" or pattern summaries
CREATE TABLE IF NOT EXISTS user_patterns (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  pattern_label TEXT,
  pattern_summary TEXT,
  pattern_type TEXT DEFAULT 'document',  -- 'document', 'cluster', 'trend'
  confidence FLOAT DEFAULT 0.0,
  representative_doc_id BIGINT REFERENCES user_documents(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(1536)
);

-- Pattern analysis sessions for tracking user interactions
CREATE TABLE IF NOT EXISTS pattern_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_type TEXT DEFAULT 'analysis', -- 'analysis', 'clustering', 'trend'
  query_text TEXT,
  results_count INTEGER DEFAULT 0,
  avg_confidence FLOAT DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes to accelerate similarity searches
-- Using ivfflat for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_user_documents_embedding
  ON user_documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 128);

CREATE INDEX IF NOT EXISTS idx_user_patterns_embedding
  ON user_patterns USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 64);

-- Additional indexes for query performance
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id
  ON user_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_user_documents_created_at
  ON user_documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_patterns_user_id
  ON user_patterns(user_id);

CREATE INDEX IF NOT EXISTS idx_pattern_sessions_user_id
  ON pattern_sessions(user_id);

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_user_documents_updated_at
  BEFORE UPDATE ON user_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_patterns_updated_at
  BEFORE UPDATE ON user_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for pattern analysis results
CREATE OR REPLACE VIEW pattern_analysis_summary AS
SELECT
  ud.user_id,
  COUNT(*) as total_documents,
  COUNT(CASE WHEN ud.embedding IS NOT NULL THEN 1 END) as embedded_documents,
  AVG(CASE WHEN up.confidence IS NOT NULL THEN up.confidence END) as avg_pattern_confidence,
  MAX(ud.created_at) as last_document_date,
  COUNT(DISTINCT up.pattern_type) as pattern_types_count
FROM user_documents ud
LEFT JOIN user_patterns up ON ud.user_id = up.user_id
GROUP BY ud.user_id;

-- Insert sample data for testing (optional)
-- INSERT INTO user_documents (user_id, content, source) VALUES
-- ('test_user', 'Sample legal document content for pattern analysis testing', 'test_source'),
-- ('test_user', 'Another document with different legal concepts and terminology', 'test_source_2');

COMMENT ON TABLE user_documents IS 'Stores user documents with vector embeddings for pattern analysis';
COMMENT ON TABLE user_patterns IS 'Cached computed patterns and clusters derived from user documents';
COMMENT ON TABLE pattern_sessions IS 'Tracks pattern analysis sessions and user interaction history';
COMMENT ON COLUMN user_documents.embedding IS 'Vector embedding from Gemma model (1536 dimensions)';
COMMENT ON COLUMN user_patterns.embedding IS 'Representative vector for pattern clusters';