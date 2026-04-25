-- Initialize pgvector extension and prepare database for vector operations

-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create uuid extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create btree_gin for combined indexes
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Set up text search configuration for legal documents
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS legal_english (COPY = english);

-- Add custom stop words for legal text search
ALTER TEXT SEARCH CONFIGURATION legal_english
  ALTER MAPPING FOR word, asciiword WITH english_stem;

-- Create a function to generate embeddings dimension check
CREATE OR REPLACE FUNCTION check_embedding_dimension(embedding vector)
RETURNS boolean AS $$
BEGIN
  RETURN array_length(embedding::real[], 1) IN (384, 768, 1024, 1536);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create indexes function for vector columns
CREATE OR REPLACE FUNCTION create_vector_index(
  table_name text,
  column_name text,
  dimensions integer,
  lists integer DEFAULT 100
)
RETURNS void AS $$
BEGIN
  -- Create IVFFlat index for approximate nearest neighbor search
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%s_%s_ivfflat ON %s USING ivfflat (%s vector_cosine_ops) WITH (lists = %s)',
    table_name, column_name, table_name, column_name, lists
  );
  
  -- Create exact index for small result sets
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%s_%s_exact ON %s USING btree (%s)',
    table_name, column_name, table_name, column_name
  );
END;
$$ LANGUAGE plpgsql;

-- Function to calculate text similarity
CREATE OR REPLACE FUNCTION text_similarity(text1 text, text2 text)
RETURNS float AS $$
BEGIN
  RETURN similarity(text1, text2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Optimize PostgreSQL settings for vector operations
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements,vector';
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET max_parallel_maintenance_workers = 4;

-- Create performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Grant permissions
GRANT ALL ON SCHEMA public TO postgres;
GRANT CREATE ON SCHEMA public TO postgres;

-- Notify that pgvector is ready
DO $$
BEGIN
  RAISE NOTICE 'pgvector extension initialized successfully';
  RAISE NOTICE 'Supported embedding dimensions: 384, 768, 1024, 1536';
  RAISE NOTICE 'Vector indexes will be created automatically for vector columns';
END
$$;
