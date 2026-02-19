-- PostgreSQL initialization script for pgvector extension
-- This file is automatically executed when the container starts

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the main database if not exists
\c prosecutor_db;

-- Ensure pgvector is available in the main database
CREATE EXTENSION IF NOT EXISTS vector;

-- Show available extensions (for debugging)
SELECT * FROM pg_available_extensions WHERE name = 'vector';

-- Create optimized indexes for vector operations (will be created by migrations)
-- These are commented out as they'll be handled by Drizzle migrations

/*
-- pgvector indexes for optimal similarity search performance
-- Using ivfflat for balance between speed and accuracy
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_title_embedding ON cases USING ivfflat (title_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_description_embedding ON cases USING ivfflat (description_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_full_text_embedding ON cases USING ivfflat (full_text_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_title_embedding ON evidence USING ivfflat (title_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_description_embedding ON evidence USING ivfflat (description_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_content_embedding ON evidence USING ivfflat (content_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_criminals_profile_embedding ON criminals USING ivfflat (profile_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_embedding ON case_activities USING ivfflat (activity_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_history_embedding ON user_query_history USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_cache_embedding ON vector_search_cache USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);
*/

-- Performance optimization settings
ALTER SYSTEM SET shared_preload_libraries = 'vector';
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '128MB';
ALTER SYSTEM SET effective_cache_size = '256MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';

-- Reload configuration
SELECT pg_reload_conf();

-- Create a function to calculate cosine similarity for debugging
CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
RETURNS float AS $$
BEGIN
    RETURN 1 - (a <=> b);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Create a function to find similar vectors with threshold
CREATE OR REPLACE FUNCTION find_similar_vectors(
    query_vector vector,
    similarity_threshold float DEFAULT 0.7,
    result_limit int DEFAULT 10
)
RETURNS TABLE(distance float) AS $$
BEGIN
    -- This is a template function - actual implementation will be in application code
    RETURN QUERY SELECT (1.0 - similarity_threshold)::float;
END;
$$ LANGUAGE plpgsql;
