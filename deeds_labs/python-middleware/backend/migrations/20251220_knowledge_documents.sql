-- Knowledge Documents Migration
-- Phase 76 - Task 5.1: PostgreSQL + pgvector integration
--
-- Creates the knowledge_documents table for hybrid search with SQL filters.
-- Uses pgvector extension for 768-dimensional embeddings.
--
-- Requirements: 4.1, 4.2, 4.3

-- Enable pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledge_documents table
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id SERIAL PRIMARY KEY,
  qdrant_id BIGINT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  entities JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'crawler',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  content_length INTEGER DEFAULT 0,
  minio_key TEXT,
  -- 768-dimensional embedding vector (embeddinggemma)
  embedding vector(768),
  -- TF-IDF vector stored as JSONB for flexibility
  tfidf_vector JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create IVFFlat index for cosine similarity search
-- Requirements: 4.3 - Create IVFFlat index for cosine similarity
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create GIN index for tag filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_tags
  ON knowledge_documents
  USING GIN (tags);

-- Create index for URL hash lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_url_hash
  ON knowledge_documents (url_hash);

-- Create index for source filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_source
  ON knowledge_documents (source);

-- Create index for date range queries
CREATE INDEX IF NOT EXISTS idx_knowledge_scraped_at
  ON knowledge_documents (scraped_at);

-- Create index for Qdrant ID lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_qdrant_id
  ON knowledge_documents (qdrant_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER trigger_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_documents_updated_at();

-- Add comments for documentation
COMMENT ON TABLE knowledge_documents IS 'Knowledge base documents with vector embeddings for semantic search';
COMMENT ON COLUMN knowledge_documents.embedding IS '768-dimensional embedding from embeddinggemma:latest';
COMMENT ON COLUMN knowledge_documents.tfidf_vector IS 'TF-IDF vector for hybrid ranking (term -> weight)';
COMMENT ON COLUMN knowledge_documents.qdrant_id IS 'Corresponding point ID in Qdrant collection';
COMMENT ON COLUMN knowledge_documents.minio_key IS 'Object key for full content in MinIO';

-- Grant permissions (adjust role name as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_documents TO legal_admin;
-- GRANT USAGE, SELECT ON SEQUENCE knowledge_documents_id_seq TO legal_admin;
