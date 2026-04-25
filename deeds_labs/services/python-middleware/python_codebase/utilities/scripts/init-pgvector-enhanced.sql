-- Enhanced PostgreSQL + pgvector Setup for RAG System
-- This script sets up the database with optimal indexing strategies

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create optimized indexes for vector search
-- HNSW index for production-grade vector similarity search
-- More memory intensive but significantly faster queries

-- First, let's create the embeddings table if it doesn't exist
-- (This should come from your Drizzle migration, but including for completeness)

-- HNSW index for embedding vectors (production-recommended)
-- Parameters: m=16 (connectivity), ef_construction=64 (quality vs speed tradeoff)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_hnsw 
ON embeddings USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Alternative IVFFlat index (faster to build, good for development)
-- Uncomment this for development/testing scenarios:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_ivfflat 
-- ON embeddings USING ivfflat (embedding_vector vector_cosine_ops) 
-- WITH (lists = 100);

-- Composite indexes for filtered vector search
-- These enable efficient filtering before vector similarity computation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_entity_vector 
ON embeddings (entity_type, entity_id) 
WHERE searchable = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_case_searchable 
ON embeddings (case_id, searchable, created_at DESC) 
WHERE searchable = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_content_type_lang 
ON embeddings (content_type, language) 
WHERE searchable = true;

-- Optimize vector search cache queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vector_cache_hash_valid 
ON vector_search_cache (query_hash, expires_at) 
WHERE expires_at > NOW();

-- GIN index for metadata search (JSONB)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_metadata_gin 
ON embeddings USING gin(metadata);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_analyses_result_gin 
ON ai_analyses USING gin(result);

-- Optimize RAG session queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rag_sessions_active_user 
ON rag_sessions (user_id, is_active, last_message_at DESC) 
WHERE is_active = true;

-- Optimize message retrieval for conversations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rag_messages_session_order 
ON rag_messages (session_id, message_index);

-- Function for efficient vector similarity search with filtering
CREATE OR REPLACE FUNCTION search_embeddings_filtered(
    query_vector vector(1536),
    similarity_threshold float8 DEFAULT 0.7,
    entity_type_filter text DEFAULT NULL,
    case_id_filter uuid DEFAULT NULL,
    content_type_filter text DEFAULT NULL,
    language_filter text DEFAULT 'en',
    result_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    entity_type text,
    entity_id uuid,
    content_type text,
    text_content text,
    similarity float8,
    confidence numeric,
    metadata jsonb,
    case_id uuid,
    created_at timestamp
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.entity_type,
        e.entity_id,
        e.content_type,
        e.text_content,
        1 - (e.embedding_vector <=> query_vector) as similarity,
        e.confidence,
        e.metadata,
        e.case_id,
        e.created_at
    FROM embeddings e
    WHERE 
        e.searchable = true
        AND e.language = language_filter
        AND (entity_type_filter IS NULL OR e.entity_type = entity_type_filter)
        AND (case_id_filter IS NULL OR e.case_id = case_id_filter)
        AND (content_type_filter IS NULL OR e.content_type = content_type_filter)
        AND (1 - (e.embedding_vector <=> query_vector)) >= similarity_threshold
    ORDER BY e.embedding_vector <=> query_vector
    LIMIT result_limit;
END;
$$;

-- Function for hybrid search (combines vector similarity with text search)
CREATE OR REPLACE FUNCTION hybrid_search_embeddings(
    query_vector vector(1536),
    query_text text,
    similarity_threshold float8 DEFAULT 0.7,
    text_weight float8 DEFAULT 0.3,
    vector_weight float8 DEFAULT 0.7,
    case_id_filter uuid DEFAULT NULL,
    result_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    entity_type text,
    entity_id uuid,
    content_type text,
    text_content text,
    combined_score float8,
    vector_similarity float8,
    text_similarity float8,
    metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.entity_type,
        e.entity_id,
        e.content_type,
        e.text_content,
        (vector_weight * (1 - (e.embedding_vector <=> query_vector))) + 
        (text_weight * ts_rank_cd(to_tsvector('english', e.text_content), plainto_tsquery('english', query_text))) as combined_score,
        1 - (e.embedding_vector <=> query_vector) as vector_similarity,
        ts_rank_cd(to_tsvector('english', e.text_content), plainto_tsquery('english', query_text)) as text_similarity,
        e.metadata
    FROM embeddings e
    WHERE 
        e.searchable = true
        AND (case_id_filter IS NULL OR e.case_id = case_id_filter)
        AND (
            (1 - (e.embedding_vector <=> query_vector)) >= similarity_threshold
            OR to_tsvector('english', e.text_content) @@ plainto_tsquery('english', query_text)
        )
    ORDER BY combined_score DESC
    LIMIT result_limit;
END;
$$;

-- Function to batch insert embeddings efficiently
CREATE OR REPLACE FUNCTION batch_insert_embeddings(
    entity_data jsonb
)
RETURNS TABLE (inserted_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
    record_data jsonb;
    inserted_count integer := 0;
BEGIN
    FOR record_data IN SELECT jsonb_array_elements(entity_data)
    LOOP
        INSERT INTO embeddings (
            entity_type,
            entity_id,
            content_type,
            text_content,
            embedding_vector,
            embedding_model,
            metadata,
            case_id,
            created_by
        ) VALUES (
            record_data->>'entity_type',
            (record_data->>'entity_id')::uuid,
            record_data->>'content_type',
            record_data->>'text_content',
            (record_data->>'embedding_vector')::vector(1536),
            COALESCE(record_data->>'embedding_model', 'text-embedding-ada-002'),
            COALESCE(record_data->'metadata', '{}'::jsonb),
            (record_data->>'case_id')::uuid,
            (record_data->>'created_by')::uuid
        );
        inserted_count := inserted_count + 1;
    END LOOP;
    
    RETURN QUERY SELECT inserted_count;
END;
$$;

-- Function for cache management (auto-cleanup expired entries)
CREATE OR REPLACE FUNCTION cleanup_vector_cache()
RETURNS TABLE (deleted_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM vector_search_cache 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT deleted_count;
END;
$$;

-- Set up automatic cache cleanup (run every hour)
-- This requires pg_cron extension for production use
-- SELECT cron.schedule('cleanup-vector-cache', '0 * * * *', 'SELECT cleanup_vector_cache();');

-- Performance monitoring views
CREATE OR REPLACE VIEW embedding_stats AS
SELECT 
    entity_type,
    COUNT(*) as total_embeddings,
    COUNT(*) FILTER (WHERE searchable = true) as searchable_embeddings,
    AVG(ARRAY_LENGTH(string_to_array(embedding_vector::text, ','), 1)) as avg_dimensions,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM embeddings
GROUP BY entity_type;

CREATE OR REPLACE VIEW vector_search_performance AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as queries,
    AVG(processing_time) as avg_processing_time,
    AVG(result_count) as avg_result_count,
    COUNT(*) FILTER (WHERE hit_count > 1) as cache_hits
FROM vector_search_cache
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Permissions and security
-- Create a read-only role for analytics
CREATE ROLE embedding_reader;
GRANT SELECT ON embedding_stats TO embedding_reader;
GRANT SELECT ON vector_search_performance TO embedding_reader;
GRANT SELECT ON embeddings TO embedding_reader;

-- Create a service role for the application
CREATE ROLE embedding_service;
GRANT SELECT, INSERT, UPDATE ON embeddings TO embedding_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON vector_search_cache TO embedding_service;
GRANT EXECUTE ON FUNCTION search_embeddings_filtered TO embedding_service;
GRANT EXECUTE ON FUNCTION hybrid_search_embeddings TO embedding_service;
GRANT EXECUTE ON FUNCTION batch_insert_embeddings TO embedding_service;

-- Optimize PostgreSQL settings for vector operations
-- Add these to postgresql.conf:
/*
# Memory and performance settings for vector operations
shared_preload_libraries = 'pg_stat_statements,auto_explain,pgvector'
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 64MB

# Vector-specific settings
pgvector.vector_size_limit = 2000

# Index build settings
max_parallel_maintenance_workers = 4
max_parallel_workers = 8

# Logging for performance monitoring
log_min_duration_statement = 1000
auto_explain.log_min_duration = 1000
auto_explain.log_analyze = on
auto_explain.log_buffers = on
*/

-- Analyze tables for optimal query planning
ANALYZE embeddings;
ANALYZE vector_search_cache;
ANALYZE ai_analyses;
ANALYZE rag_sessions;
ANALYZE rag_messages;

-- Display completion message
DO $$
BEGIN
    RAISE NOTICE 'PostgreSQL + pgvector setup completed successfully!';
    RAISE NOTICE 'HNSW indexes created for optimal vector search performance';
    RAISE NOTICE 'Utility functions and views are ready for use';
    RAISE NOTICE 'Remember to configure postgresql.conf settings for best performance';
END $$;
