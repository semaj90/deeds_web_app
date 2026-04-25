-- PostgreSQL schema for LLM streaming with pgvector
-- Optimized for chunked embeddings and semantic search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For text similarity
CREATE EXTENSION IF NOT EXISTS btree_gin; -- For compound indexes

-- Main table for document embeddings
CREATE TABLE IF NOT EXISTS document_embeddings (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(content::bytea), 'hex')) STORED,
    embedding vector(768) NOT NULL, -- 768-dim embeddings (can be 384, 512, 1536 etc)
    embedding_model VARCHAR(100) DEFAULT 'gemma-embeddings',
    
    -- Metadata as JSONB for flexibility
    metadata JSONB DEFAULT '{}',
    
    -- Chunking information
    chunk_id INTEGER DEFAULT 0,
    chunk_size INTEGER DEFAULT 512,
    parent_document_id BIGINT REFERENCES document_embeddings(id) ON DELETE CASCADE,
    
    -- Performance metrics
    generation_time_ms INTEGER,
    token_count INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    
    -- Unique constraint on content hash to prevent duplicates
    CONSTRAINT unique_content_hash UNIQUE (content_hash)
);

-- LLM generation cache table
CREATE TABLE IF NOT EXISTS llm_generation_cache (
    id BIGSERIAL PRIMARY KEY,
    prompt_hash VARCHAR(64) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    
    -- Generation parameters
    temperature FLOAT DEFAULT 0.7,
    top_p FLOAT DEFAULT 0.9,
    max_tokens INTEGER DEFAULT 2048,
    
    -- Performance metrics
    generation_time_ms INTEGER,
    total_tokens INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    
    -- Embedding reference
    embedding_id BIGINT REFERENCES document_embeddings(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour',
    
    CONSTRAINT unique_prompt_model UNIQUE (prompt_hash, model)
);

-- SOM (Self-Organizing Map) clusters for embeddings
CREATE TABLE IF NOT EXISTS som_clusters (
    id SERIAL PRIMARY KEY,
    cluster_center vector(768) NOT NULL,
    cluster_size INTEGER DEFAULT 0,
    cluster_radius FLOAT DEFAULT 0.1,
    
    -- Cluster metadata
    label VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document to cluster mapping
CREATE TABLE IF NOT EXISTS document_clusters (
    document_id BIGINT REFERENCES document_embeddings(id) ON DELETE CASCADE,
    cluster_id INTEGER REFERENCES som_clusters(id) ON DELETE CASCADE,
    distance FLOAT NOT NULL,
    confidence FLOAT DEFAULT 0.0,
    
    PRIMARY KEY (document_id, cluster_id)
);

-- Semantic search queries log (for analytics and optimization)
CREATE TABLE IF NOT EXISTS search_queries (
    id BIGSERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    query_embedding vector(768),
    result_count INTEGER,
    execution_time_ms INTEGER,
    
    -- Search parameters
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    
    -- User tracking (optional)
    session_id VARCHAR(255),
    user_id BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance

-- HNSW index for fast similarity search (best for accuracy)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw 
ON document_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat index for faster but less accurate search (good for large datasets)
-- CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat 
-- ON document_embeddings 
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS idx_embeddings_created_at ON document_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON document_embeddings(embedding_model);
CREATE INDEX IF NOT EXISTS idx_embeddings_parent ON document_embeddings(parent_document_id);

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_embeddings_metadata ON document_embeddings USING gin(metadata);

-- Text search indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_content_trgm ON document_embeddings USING gin(content gin_trgm_ops);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_cache_prompt_hash ON llm_generation_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON llm_generation_cache(expires_at);

-- Functions for semantic operations

-- Function to find similar documents
CREATE OR REPLACE FUNCTION find_similar_documents(
    query_embedding vector(768),
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.id,
        de.content,
        1 - (de.embedding <=> query_embedding) as similarity,
        de.metadata
    FROM document_embeddings de
    WHERE 1 - (de.embedding <=> query_embedding) > similarity_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT max_results;
    
    -- Update access stats
    UPDATE document_embeddings
    SET accessed_at = NOW(), access_count = access_count + 1
    WHERE id IN (
        SELECT de.id
        FROM document_embeddings de
        WHERE 1 - (de.embedding <=> query_embedding) > similarity_threshold
        ORDER BY de.embedding <=> query_embedding
        LIMIT max_results
    );
END;
$$;

-- Function to compute centroid of embeddings
CREATE OR REPLACE FUNCTION compute_centroid(embedding_ids BIGINT[])
RETURNS vector(768)
LANGUAGE plpgsql
AS $$
DECLARE
    centroid FLOAT[];
    dim INTEGER;
    count INTEGER;
BEGIN
    -- Initialize centroid array
    centroid := array_fill(0.0, ARRAY[768]);
    count := array_length(embedding_ids, 1);
    
    IF count IS NULL OR count = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Sum all embeddings
    FOR dim IN 1..768 LOOP
        SELECT SUM((embedding::float[])[dim]) / count INTO centroid[dim]
        FROM document_embeddings
        WHERE id = ANY(embedding_ids);
    END LOOP;
    
    RETURN centroid::vector(768);
END;
$$;

-- Function to cluster documents using SOM
CREATE OR REPLACE FUNCTION cluster_with_som(
    num_clusters INTEGER DEFAULT 10,
    iterations INTEGER DEFAULT 100
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    learning_rate FLOAT := 0.5;
    radius FLOAT := 2.0;
    doc RECORD;
    cluster RECORD;
    best_cluster_id INTEGER;
    min_distance FLOAT;
    current_distance FLOAT;
BEGIN
    -- Initialize clusters with random documents
    INSERT INTO som_clusters (cluster_center)
    SELECT embedding
    FROM document_embeddings
    ORDER BY RANDOM()
    LIMIT num_clusters;
    
    -- Training iterations
    FOR iter IN 1..iterations LOOP
        -- Decrease learning rate and radius
        learning_rate := 0.5 * (1 - iter::FLOAT / iterations);
        radius := 2.0 * (1 - iter::FLOAT / iterations);
        
        -- Process each document
        FOR doc IN SELECT id, embedding FROM document_embeddings LOOP
            -- Find best matching unit (BMU)
            min_distance := 999999;
            best_cluster_id := NULL;
            
            FOR cluster IN SELECT id, cluster_center FROM som_clusters LOOP
                current_distance := doc.embedding <=> cluster.cluster_center;
                IF current_distance < min_distance THEN
                    min_distance := current_distance;
                    best_cluster_id := cluster.id;
                END IF;
            END LOOP;
            
            -- Update BMU and neighbors
            UPDATE som_clusters
            SET cluster_center = cluster_center + 
                (learning_rate * (doc.embedding - cluster_center))::vector(768)
            WHERE id = best_cluster_id;
            
            -- Store document-cluster mapping
            INSERT INTO document_clusters (document_id, cluster_id, distance, confidence)
            VALUES (doc.id, best_cluster_id, min_distance, 1.0 - min_distance)
            ON CONFLICT (document_id, cluster_id) 
            DO UPDATE SET distance = EXCLUDED.distance, confidence = EXCLUDED.confidence;
        END LOOP;
    END LOOP;
    
    -- Update cluster sizes
    UPDATE som_clusters sc
    SET cluster_size = (
        SELECT COUNT(*) 
        FROM document_clusters dc 
        WHERE dc.cluster_id = sc.id
    );
END;
$$;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_embeddings_updated_at
BEFORE UPDATE ON document_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_clusters_updated_at
BEFORE UPDATE ON som_clusters
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Materialized view for frequently accessed embeddings
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_embeddings AS
SELECT 
    id,
    content,
    embedding,
    metadata,
    access_count
FROM document_embeddings
WHERE access_count > 10
ORDER BY access_count DESC;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_popular_embeddings_vector 
ON popular_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Vacuum and analyze for optimal performance
VACUUM ANALYZE document_embeddings;
VACUUM ANALYZE som_clusters;

-- Grant permissions (adjust as needed)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_admin;