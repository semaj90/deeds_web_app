-- Basic Production Pipeline Schema Migration (without pgvector for now)
-- Can be run safely with PostgreSQL 17

-- Enable basic extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

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

-- Create document_chunks table (without vector for now)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64),
    token_count INTEGER,
    start_char INTEGER,
    end_char INTEGER,
    embedding_text TEXT, -- Will store embedding as text for now
    chunk_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, chunk_index)
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_domain ON crawl_jobs(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_crawled_pages_crawl_job ON crawled_pages(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_processed ON crawled_pages(processed);

CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_legal_metadata ON documents USING gin(legal_metadata);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash ON document_chunks(content_hash);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_type ON processing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

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

-- Test the schema
INSERT INTO crawl_jobs (url, domain, metadata) VALUES 
('https://example.com', 'example.com', '{"test": true}')
ON CONFLICT DO NOTHING;

-- Show created tables
SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;