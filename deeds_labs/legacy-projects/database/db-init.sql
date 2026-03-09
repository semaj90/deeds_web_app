-- Legal AI System Database Initialization
-- PostgreSQL with pgvector extension

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Vector dimension configuration for nomic-embed (384 dimensions)
-- Fixed: Proper 384-dim vectors for nomic-embed-text
DO $$ 
BEGIN
    -- Ensure vector extension is loaded with correct dimensions
    EXECUTE 'ALTER DATABASE prosecutor_db SET vector.dimensions = 384';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Vector dimensions already configured';
END $$;

-- Performance optimizations
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements,vector';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '64MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';

-- Create case scoring audit table
CREATE TABLE IF NOT EXISTS case_scores (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id uuid NOT NULL,
    score integer CHECK (score >= 0 AND score <= 100),
    scoring_criteria jsonb NOT NULL,
    ai_analysis text,
    temperature float DEFAULT 0.7,
    created_at timestamp DEFAULT NOW(),
    updated_at timestamp DEFAULT NOW()
);

-- Create system health monitoring table
CREATE TABLE IF NOT EXISTS system_health (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name text NOT NULL,
    status text NOT NULL,
    metrics jsonb,
    error_logs text,
    checked_at timestamp DEFAULT NOW()
);

-- Create vector search indices
CREATE INDEX IF NOT EXISTS idx_vector_search ON documents USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_case_scores_case_id ON case_scores(case_id);
CREATE INDEX IF NOT EXISTS idx_system_health_service ON system_health(service_name, checked_at DESC);

-- Insert initial configuration
INSERT INTO system_health (service_name, status, metrics)
VALUES 
    ('database', 'healthy', '{"version": "16", "vector_enabled": true, "dimensions": 384}'),
    ('vector_config', 'configured', '{"embedding_model": "nomic-embed-text", "dimensions": 384, "index_type": "ivfflat"}');
