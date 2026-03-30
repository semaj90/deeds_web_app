-- Diagnosis Embeddings: pgvector mirror + Qdrant collection setup
-- Run: psql -h 127.0.0.1 -U postgres -d legal_ai_db -f drizzle/manual/diagnosis_embeddings.sql

-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add query embedding column to diagnosis_events (768-dim, embeddinggemma)
ALTER TABLE diagnosis_events
  ADD COLUMN IF NOT EXISTS query_embedding vector(768);

-- HNSW index for cosine similarity search on diagnosis embeddings
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_embedding_hnsw
  ON diagnosis_events
  USING hnsw (query_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index on JSONB columns for fast containment queries
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_likely_files_gin
  ON diagnosis_events USING gin (likely_files);

CREATE INDEX IF NOT EXISTS idx_diagnosis_events_sources_gin
  ON diagnosis_events USING gin (sources);
