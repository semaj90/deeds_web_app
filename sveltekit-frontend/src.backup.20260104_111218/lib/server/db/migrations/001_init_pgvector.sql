-- PostgreSQL + pgvector initialization script
-- Run this to set up your database with optimal configuration for Legal AI

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For compound indexes

-- Set optimal pgvector parameters
ALTER SYSTEM SET shared_preload_libraries = 'vector';
ALTER SYSTEM SET vector.max_index_build_memory = '2GB';

-- Create custom function for cosine similarity search
CREATE OR REPLACE FUNCTION cosine_similarity(
  a vector,
  b vector
) RETURNS float
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN 1 - (a <=> b);
END;
$$;

-- Create indexes with optimal settings for 768-dimension vectors (nomic-embed-text)
-- Using IVFFlat with appropriate lists parameter (sqrt of expected rows)

-- For document chunks (expecting ~100k chunks)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 316); -- sqrt(100000) ≈ 316

-- For legal documents (expecting ~10k documents)
CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding 
ON legal_documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); -- sqrt(10000) = 100

-- For user AI queries (expecting ~50k queries)
CREATE INDEX IF NOT EXISTS idx_user_ai_queries_embedding 
ON user_ai_queries 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 224); -- sqrt(50000) ≈ 224

-- Create compound indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_compound 
ON document_chunks USING gin(document_type, metadata);

CREATE INDEX IF NOT EXISTS idx_legal_documents_compound 
ON legal_documents USING gin(document_type, jurisdiction, keywords);

-- Create text search indexes
CREATE INDEX IF NOT EXISTS idx_legal_documents_content_search 
ON legal_documents USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_evidence_summary_search 
ON evidence USING gin(to_tsvector('english', summary));

-- Performance optimization settings
ALTER DATABASE legal_ai_db SET maintenance_work_mem = '256MB';
ALTER DATABASE legal_ai_db SET work_mem = '16MB';
ALTER DATABASE legal_ai_db SET effective_cache_size = '4GB';

-- Vector search functions for the application
CREATE OR REPLACE FUNCTION search_similar_documents(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  threshold float DEFAULT 0.7,
  doc_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.metadata
  FROM document_chunks dc
  WHERE 
    1 - (dc.embedding <=> query_embedding) > threshold
    AND (doc_type IS NULL OR dc.document_type = doc_type)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function for hybrid search (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(768),
  search_text text,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  vector_similarity float,
  text_rank float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT 
      dc.id,
      dc.content,
      1 - (dc.embedding <=> query_embedding) as similarity
    FROM document_chunks dc
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  text_results AS (
    SELECT 
      dc.id,
      dc.content,
      ts_rank(to_tsvector('english', dc.content), 
              plainto_tsquery('english', search_text)) as rank
    FROM document_chunks dc
    WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', search_text)
    LIMIT match_count * 2
  )
  SELECT 
    COALESCE(v.id, t.id) as id,
    COALESCE(v.content, t.content) as content,
    COALESCE(v.similarity, 0) as vector_similarity,
    COALESCE(t.rank, 0) as text_rank,
    (COALESCE(v.similarity, 0) * 0.7 + COALESCE(t.rank, 0) * 0.3) as combined_score
  FROM vector_results v
  FULL OUTER JOIN text_results t ON v.id = t.id
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- Monitoring view for vector operations
CREATE OR REPLACE VIEW vector_stats AS
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE indexname LIKE '%embedding%'
ORDER BY idx_scan DESC;

-- Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;

COMMENT ON DATABASE legal_ai_db IS 'Legal AI Platform with pgvector for semantic search and RAG';
