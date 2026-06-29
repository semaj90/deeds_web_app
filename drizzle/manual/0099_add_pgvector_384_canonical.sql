-- MIGRATION: Add Postgres pgvector 384-dim canonical storage
-- Date: 2026-06-28
-- Purpose: Establish 384-dim embeddinggemma as canonical vector storage
-- Compliance: Dimension Policy (June 28, 2026)

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add 384-dim canonical embedding columns to codebase_chunk_index
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS content_embedding_384 vector(384),
  ADD COLUMN IF NOT EXISTS summary_embedding_384 vector(384),
  ADD COLUMN IF NOT EXISTS embedding_model text DEFAULT 'embeddinggemma:latest',
  ADD COLUMN IF NOT EXISTS embedding_dimension integer DEFAULT 384,
  ADD COLUMN IF NOT EXISTS embedding_normalized boolean DEFAULT true;

-- Create HNSW index on content embedding (primary search path)
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_content_embedding_384_hnsw
ON codebase_chunk_index
USING hnsw (content_embedding_384 vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create HNSW index on summary embedding (secondary path)
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_summary_embedding_384_hnsw
ON codebase_chunk_index
USING hnsw (summary_embedding_384 vector_cosine_ops)
WITH (m = 12, ef_construction = 48);

-- Create B-tree index on embedding metadata for filtering
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_embedding_model_normalized
ON codebase_chunk_index (embedding_model, embedding_normalized)
WHERE embedding_model IS NOT NULL AND embedding_normalized = true;

-- Add columns to atlas_packets for embedding tracking
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS content_embedding_384 vector(384),
  ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedding_timestamp timestamp with time zone;

-- Create index on embedding_status for backfill progress tracking
CREATE INDEX IF NOT EXISTS idx_atlas_packets_embedding_status
ON atlas_packets (embedding_status)
WHERE embedding_status = 'pending';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON codebase_chunk_index TO legal_admin;
GRANT SELECT, INSERT, UPDATE ON atlas_packets TO legal_admin;