-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create new 512-dimension embedding tables for optimized performance
-- 512 dimensions: round, warp-aligned, plays nice with ANN engines
-- This migration creates new optimized tables alongside existing ones

-- Case embeddings with 512 dimensions (warp-aligned for optimal performance)
CREATE TABLE IF NOT EXISTS case_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,
    page_no INTEGER NOT NULL DEFAULT 0,
    chunk_no INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    embedding vector(512) NOT NULL,
    text_hash TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Evidence embeddings with 512 dimensions
CREATE TABLE IF NOT EXISTS evidence_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,
    page_no INTEGER NOT NULL DEFAULT 0,
    chunk_no INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    embedding vector(512) NOT NULL,
    text_hash TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Legal document chunks for RAG pipeline
CREATE TABLE IF NOT EXISTS legal_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id TEXT NOT NULL,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    text_content TEXT NOT NULL,
    embedding vector(512) NOT NULL,
    text_hash TEXT UNIQUE NOT NULL,
    token_count INTEGER,

    -- Legal metadata
    document_type TEXT CHECK (document_type IN ('contract', 'evidence', 'brief', 'citation', 'statute', 'case_law')),
    practice_area TEXT[],
    jurisdiction TEXT,
    confidence_level REAL CHECK (confidence_level >= 0 AND confidence_level <= 1),
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

    -- Processing metadata
    extracted_entities JSONB DEFAULT '[]',
    key_terms TEXT[],
    sentiment_score REAL,
    complexity_score REAL,

    -- Cache and deduplication
    model TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Optimized embedding cache for 512 dimensions
CREATE TABLE IF NOT EXISTS embedding_cache_512 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text_hash TEXT UNIQUE NOT NULL,
    embedding vector(512) NOT NULL,
    model TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
    token_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP DEFAULT NOW(),
    access_count INTEGER DEFAULT 0
);

-- High-performance indexes for vector similarity search
-- HNSW indexes for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS case_embeddings_hnsw_idx
ON case_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS evidence_embeddings_hnsw_idx
ON evidence_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS legal_document_chunks_hnsw_idx
ON legal_document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS embedding_cache_512_hnsw_idx
ON embedding_cache_512
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat indexes for smaller datasets (faster build time)
CREATE INDEX IF NOT EXISTS case_embeddings_ivfflat_idx
ON case_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS evidence_embeddings_ivfflat_idx
ON evidence_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Standard B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS case_embeddings_case_id_idx ON case_embeddings(case_id);
CREATE INDEX IF NOT EXISTS case_embeddings_text_hash_idx ON case_embeddings(text_hash);
CREATE INDEX IF NOT EXISTS case_embeddings_model_idx ON case_embeddings(model);

CREATE INDEX IF NOT EXISTS evidence_embeddings_evidence_id_idx ON evidence_embeddings(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_embeddings_text_hash_idx ON evidence_embeddings(text_hash);
CREATE INDEX IF NOT EXISTS evidence_embeddings_model_idx ON evidence_embeddings(model);

CREATE INDEX IF NOT EXISTS legal_document_chunks_document_id_idx ON legal_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS legal_document_chunks_case_id_idx ON legal_document_chunks(case_id);
CREATE INDEX IF NOT EXISTS legal_document_chunks_evidence_id_idx ON legal_document_chunks(evidence_id);
CREATE INDEX IF NOT EXISTS legal_document_chunks_text_hash_idx ON legal_document_chunks(text_hash);
CREATE INDEX IF NOT EXISTS legal_document_chunks_document_type_idx ON legal_document_chunks(document_type);
CREATE INDEX IF NOT EXISTS legal_document_chunks_practice_area_idx ON legal_document_chunks USING GIN(practice_area);
CREATE INDEX IF NOT EXISTS legal_document_chunks_risk_level_idx ON legal_document_chunks(risk_level);

CREATE INDEX IF NOT EXISTS embedding_cache_512_text_hash_idx ON embedding_cache_512(text_hash);
CREATE INDEX IF NOT EXISTS embedding_cache_512_model_idx ON embedding_cache_512(model);
CREATE INDEX IF NOT EXISTS embedding_cache_512_accessed_idx ON embedding_cache_512(last_accessed);

-- JSONB indexes for metadata queries
CREATE INDEX IF NOT EXISTS legal_document_chunks_entities_idx ON legal_document_chunks USING GIN(extracted_entities);
CREATE INDEX IF NOT EXISTS legal_document_chunks_key_terms_idx ON legal_document_chunks USING GIN(to_tsvector('english', array_to_string(key_terms, ' ')));

-- Function to update last_accessed timestamp in cache
CREATE OR REPLACE FUNCTION update_embedding_cache_access()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE embedding_cache_512
    SET last_accessed = NOW(), access_count = access_count + 1
    WHERE text_hash = NEW.text_hash;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for cache access tracking
DROP TRIGGER IF EXISTS embedding_cache_access_trigger ON embedding_cache_512;
CREATE TRIGGER embedding_cache_access_trigger
    AFTER SELECT ON embedding_cache_512
    FOR EACH ROW EXECUTE FUNCTION update_embedding_cache_access();

-- Views for easy querying
CREATE OR REPLACE VIEW case_similarity_search AS
SELECT
    c.id as case_id,
    c.title,
    c.case_number,
    c.category,
    c.priority,
    ce.text,
    ce.embedding,
    ce.chunk_no,
    ce.page_no
FROM cases c
JOIN case_embeddings ce ON c.id = ce.case_id;

CREATE OR REPLACE VIEW evidence_similarity_search AS
SELECT
    e.id as evidence_id,
    e.title,
    e.evidence_type,
    e.case_id,
    ee.text,
    ee.embedding,
    ee.chunk_no,
    ee.page_no
FROM evidence e
JOIN evidence_embeddings ee ON e.id = ee.evidence_id;

-- Performance monitoring view
CREATE OR REPLACE VIEW embedding_performance_stats AS
SELECT
    model,
    COUNT(*) as total_embeddings,
    AVG(access_count) as avg_access_count,
    MAX(last_accessed) as most_recent_access,
    COUNT(*) FILTER (WHERE last_accessed > NOW() - INTERVAL '24 hours') as accessed_last_24h
FROM embedding_cache_512
GROUP BY model;

-- Cleanup function for old cache entries
CREATE OR REPLACE FUNCTION cleanup_embedding_cache(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM embedding_cache_512
    WHERE last_accessed < NOW() - INTERVAL '1 day' * days_old
    AND access_count < 5;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE case_embeddings IS 'Optimized 384-dimension embeddings for case content chunks';
COMMENT ON TABLE evidence_embeddings IS 'Optimized 384-dimension embeddings for evidence content chunks';
COMMENT ON TABLE legal_document_chunks IS 'Chunked legal documents with embeddings for RAG pipeline';
COMMENT ON TABLE embedding_cache_512 IS 'High-performance cache for 384-dimension embeddings with deduplication';

COMMENT ON INDEX case_embeddings_hnsw_idx IS 'HNSW index for fast approximate nearest neighbor search on case embeddings';
COMMENT ON INDEX evidence_embeddings_hnsw_idx IS 'HNSW index for fast approximate nearest neighbor search on evidence embeddings';
COMMENT ON INDEX legal_document_chunks_hnsw_idx IS 'HNSW index for fast approximate nearest neighbor search on legal document chunks';

-- Grant permissions (adjust as needed for your user setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON case_embeddings TO legal_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON evidence_embeddings TO legal_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON legal_document_chunks TO legal_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON embedding_cache_512 TO legal_app_user;