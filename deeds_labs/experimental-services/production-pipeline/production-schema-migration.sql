-- Production Pipeline Schema Migration
-- Based on schema-production-pipeline.ts - Safe migration approach

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Drop existing tables if they exist (use with caution!)
-- Only uncomment if you need to reset completely
-- DROP TABLE IF EXISTS cache_keys CASCADE;
-- DROP TABLE IF EXISTS system_metrics CASCADE; 
-- DROP TABLE IF EXISTS processing_jobs CASCADE;
-- DROP TABLE IF EXISTS document_chunks CASCADE;
-- DROP TABLE IF EXISTS search_index CASCADE;
-- DROP TABLE IF EXISTS documents CASCADE;
-- DROP TABLE IF EXISTS crawled_pages CASCADE;
-- DROP TABLE IF EXISTS crawl_jobs CASCADE;
-- DROP TABLE IF EXISTS legal_authorities CASCADE;

-- Create crawl_jobs table
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    domain VARCHAR(255),
    crawl_type VARCHAR(50) NOT NULL DEFAULT 'web_page',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    max_depth INTEGER DEFAULT 1,
    allowed_domains JSONB,
    blocked_paths JSONB,
    headers JSONB,
    metadata JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create crawled_pages table
CREATE TABLE IF NOT EXISTS crawled_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crawl_job_id UUID REFERENCES crawl_jobs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    parent_url TEXT,
    title TEXT,
    content_type VARCHAR(100),
    status_code INTEGER,
    content_length BIGINT,
    content_hash VARCHAR(64),
    headers JSONB,
    content TEXT,
    extracted_text TEXT,
    extracted_links JSONB,
    extracted_images JSONB,
    metadata JSONB,
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    content_type VARCHAR(100),
    file_path TEXT,
    file_size BIGINT,
    file_hash VARCHAR(64),
    source_url TEXT,
    crawl_job_id UUID REFERENCES crawl_jobs(id) ON DELETE SET NULL,
    document_type VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    confidence REAL,
    page_count INTEGER,
    word_count INTEGER,
    legal_metadata JSONB,
    processing_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    indexed_at TIMESTAMP
);

-- Create document_chunks table with vector support
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64),
    token_count INTEGER,
    start_char INTEGER,
    end_char INTEGER,
    embedding vector(384),
    chunk_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, chunk_index)
);

-- Create search_index table for full-text search
CREATE TABLE IF NOT EXISTS search_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_type VARCHAR(50),
    title TEXT,
    keywords TEXT[],
    entities JSONB,
    search_vector tsvector,
    boost_score REAL DEFAULT 1.0,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create processing_jobs table
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    priority INTEGER DEFAULT 5,
    input_data JSONB NOT NULL,
    output_data JSONB,
    error_message TEXT,
    progress INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    queue_name VARCHAR(100),
    worker_id VARCHAR(100),
    parent_job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    related_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create cache_keys table for Redis cache management
CREATE TABLE IF NOT EXISTS cache_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    cache_type VARCHAR(50) NOT NULL,
    ttl INTEGER,
    data_type VARCHAR(50),
    size_bytes BIGINT,
    hit_count BIGINT DEFAULT 0,
    miss_count BIGINT DEFAULT 0,
    last_accessed TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Create system_metrics table
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    value REAL NOT NULL,
    unit VARCHAR(50),
    tags JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create legal_authorities table for legal document classification
CREATE TABLE IF NOT EXISTS legal_authorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    abbreviation VARCHAR(50),
    jurisdiction VARCHAR(100),
    authority_type VARCHAR(50),
    website_url TEXT,
    api_endpoint TEXT,
    metadata JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance

-- Crawl jobs indexes
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_domain ON crawl_jobs(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_priority ON crawl_jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at);

-- Crawled pages indexes
CREATE INDEX IF NOT EXISTS idx_crawled_pages_crawl_job ON crawled_pages(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_url ON crawled_pages(url);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_processed ON crawled_pages(processed);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_content_hash ON crawled_pages(content_hash);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_language ON documents(language);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_crawl_job ON documents(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_documents_legal_metadata ON documents USING gin(legal_metadata);

-- Document chunks indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash ON document_chunks(content_hash);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Search index indexes
CREATE INDEX IF NOT EXISTS idx_search_index_document ON search_index(document_id);
CREATE INDEX IF NOT EXISTS idx_search_index_chunk ON search_index(chunk_id);
CREATE INDEX IF NOT EXISTS idx_search_index_content_type ON search_index(content_type);
CREATE INDEX IF NOT EXISTS idx_search_index_vector ON search_index USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_search_index_keywords ON search_index USING gin(keywords);
CREATE INDEX IF NOT EXISTS idx_search_index_entities ON search_index USING gin(entities);

-- Processing jobs indexes
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_type ON processing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_priority ON processing_jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue ON processing_jobs(queue_name);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_worker ON processing_jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_parent ON processing_jobs(parent_job_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_document ON processing_jobs(related_document_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Cache keys indexes
CREATE INDEX IF NOT EXISTS idx_cache_keys_type ON cache_keys(cache_type);
CREATE INDEX IF NOT EXISTS idx_cache_keys_expires_at ON cache_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_keys_last_accessed ON cache_keys(last_accessed);

-- System metrics indexes
CREATE INDEX IF NOT EXISTS idx_system_metrics_type ON system_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_tags ON system_metrics USING gin(tags);

-- Legal authorities indexes
CREATE INDEX IF NOT EXISTS idx_legal_authorities_jurisdiction ON legal_authorities(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_legal_authorities_type ON legal_authorities(authority_type);
CREATE INDEX IF NOT EXISTS idx_legal_authorities_active ON legal_authorities(is_active);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crawl_jobs_updated_at BEFORE UPDATE ON crawl_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vector similarity search functions
CREATE OR REPLACE FUNCTION vector_similarity_search(
    query_embedding vector(384),
    similarity_threshold float DEFAULT 0.7,
    max_results int DEFAULT 10
)
RETURNS TABLE(
    chunk_id uuid,
    document_id uuid,
    content text,
    similarity float
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id as chunk_id,
        dc.document_id,
        dc.content,
        (1 - (dc.embedding <=> query_embedding)) as similarity
    FROM document_chunks dc
    WHERE (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Hybrid search function (vector + full text)
CREATE OR REPLACE FUNCTION hybrid_search(
    query_text text,
    query_embedding vector(384) DEFAULT NULL,
    vector_weight float DEFAULT 0.6,
    text_weight float DEFAULT 0.4,
    max_results int DEFAULT 10
)
RETURNS TABLE(
    document_id uuid,
    chunk_id uuid,
    content text,
    title text,
    combined_score float,
    vector_score float,
    text_score float
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        si.document_id,
        si.chunk_id,
        si.content,
        si.title,
        CASE 
            WHEN query_embedding IS NOT NULL THEN 
                (vector_weight * (1 - (dc.embedding <=> query_embedding))) + 
                (text_weight * ts_rank(si.search_vector, plainto_tsquery(query_text)))
            ELSE 
                ts_rank(si.search_vector, plainto_tsquery(query_text))
        END as combined_score,
        CASE 
            WHEN query_embedding IS NOT NULL THEN (1 - (dc.embedding <=> query_embedding))
            ELSE 0
        END as vector_score,
        ts_rank(si.search_vector, plainto_tsquery(query_text)) as text_score
    FROM search_index si
    LEFT JOIN document_chunks dc ON si.chunk_id = dc.id
    WHERE 
        si.search_vector @@ plainto_tsquery(query_text)
        OR (query_embedding IS NOT NULL AND (1 - (dc.embedding <=> query_embedding)) >= 0.5)
    ORDER BY combined_score DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Insert some initial data
INSERT INTO legal_authorities (name, abbreviation, jurisdiction, authority_type, website_url, is_active) 
VALUES 
    ('Supreme Court of the United States', 'SCOTUS', 'Federal', 'Supreme Court', 'https://supremecourt.gov', true),
    ('United States Court of Appeals', 'Circuit Courts', 'Federal', 'Appellate Court', 'https://uscourts.gov', true),
    ('United States District Courts', 'District Courts', 'Federal', 'District Court', 'https://uscourts.gov', true)
ON CONFLICT DO NOTHING;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_ai_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_ai_user;

COMMIT;