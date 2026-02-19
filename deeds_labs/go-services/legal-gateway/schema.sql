-- Legal Document Processing Database Schema
-- PostgreSQL with pgvector extension

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Messages table: raw document content + metadata
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL DEFAULT 1,
    sender TEXT NOT NULL DEFAULT 'system',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_messages_case_id (case_id),
    INDEX idx_messages_created_at (created_at DESC),
    INDEX idx_messages_sender (sender)
);

-- Message embeddings table with pgvector support
CREATE TABLE IF NOT EXISTS message_embeddings (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    model TEXT NOT NULL DEFAULT 'nomic-embed-text',
    embedding vector(768) NULL, -- Default to 768D for nomic-embed-text/Gemma
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate embeddings
    UNIQUE(message_id, model)
);

-- HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_message_embeddings_hnsw_768
    ON message_embeddings 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- IVFFlat index as alternative (good for datasets >1000 documents)
-- CREATE INDEX IF NOT EXISTS idx_message_embeddings_ivf_768
--     ON message_embeddings 
--     USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);

-- Additional embedding table for 1536D embeddings (OpenAI/Claude compatibility)
CREATE TABLE IF NOT EXISTS message_embeddings_1536 (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    model TEXT NOT NULL DEFAULT 'text-embedding-ada-002',
    embedding vector(1536) NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(message_id, model)
);

-- HNSW index for 1536D embeddings
CREATE INDEX IF NOT EXISTS idx_message_embeddings_1536_hnsw
    ON message_embeddings_1536 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Cases table for organizing documents by legal case
CREATE TABLE IF NOT EXISTS cases (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_cases_status (status),
    INDEX idx_cases_created_at (created_at DESC)
);

-- Insert default case if not exists
INSERT INTO cases (id, name, description) 
VALUES (1, 'Default Case', 'Default case for document processing')
ON CONFLICT (id) DO NOTHING;

-- Document metadata table for structured legal document info
CREATE TABLE IF NOT EXISTS document_metadata (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    title TEXT,
    document_type TEXT DEFAULT 'document',
    case_number TEXT,
    court TEXT,
    date_filed DATE,
    parties TEXT[], -- PostgreSQL array for multiple parties
    citations TEXT[], -- Array of citations
    entities TEXT[], -- Named entities
    keywords TEXT[], -- Extracted keywords
    summary TEXT,
    confidence_score REAL DEFAULT 0.0,
    processing_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for search
    INDEX idx_document_metadata_message_id (message_id),
    INDEX idx_document_metadata_document_type (document_type),
    INDEX idx_document_metadata_case_number (case_number),
    INDEX idx_document_metadata_court (court)
);

-- GIN indexes for array and JSONB columns
CREATE INDEX IF NOT EXISTS idx_document_metadata_parties 
    ON document_metadata USING gin (parties);
CREATE INDEX IF NOT EXISTS idx_document_metadata_citations 
    ON document_metadata USING gin (citations);
CREATE INDEX IF NOT EXISTS idx_document_metadata_keywords 
    ON document_metadata USING gin (keywords);
CREATE INDEX IF NOT EXISTS idx_document_metadata_processing 
    ON document_metadata USING gin (processing_metadata);

-- Jobs tracking table for monitoring processing pipeline
CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    case_id INTEGER REFERENCES cases(id),
    status TEXT DEFAULT 'queued',
    progress REAL DEFAULT 0.0,
    message_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_processing_jobs_status (status),
    INDEX idx_processing_jobs_case_id (case_id),
    INDEX idx_processing_jobs_created_at (created_at DESC)
);

-- Vector similarity search functions
CREATE OR REPLACE FUNCTION search_similar_documents(
    query_embedding vector(768),
    similarity_threshold REAL DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    target_case_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    message_id BIGINT,
    content TEXT,
    similarity REAL,
    document_type TEXT,
    title TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.content,
        1 - (me.embedding <=> query_embedding) as similarity,
        dm.document_type,
        dm.title,
        m.created_at
    FROM message_embeddings me
    JOIN messages m ON me.message_id = m.id
    LEFT JOIN document_metadata dm ON m.id = dm.message_id
    WHERE 
        me.embedding IS NOT NULL
        AND 1 - (me.embedding <=> query_embedding) >= similarity_threshold
        AND (target_case_id IS NULL OR m.case_id = target_case_id)
    ORDER BY me.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function to get document statistics
CREATE OR REPLACE FUNCTION get_document_stats()
RETURNS TABLE (
    total_messages BIGINT,
    total_embeddings BIGINT,
    total_cases BIGINT,
    avg_content_length REAL,
    most_recent_message TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_messages,
        COUNT(me.id)::BIGINT as total_embeddings,
        COUNT(DISTINCT m.case_id)::BIGINT as total_cases,
        AVG(LENGTH(m.content))::REAL as avg_content_length,
        MAX(m.created_at) as most_recent_message
    FROM messages m
    LEFT JOIN message_embeddings me ON m.id = me.message_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_message_embeddings_updated_at 
    BEFORE UPDATE ON message_embeddings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cases_updated_at 
    BEFORE UPDATE ON cases 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_metadata_updated_at 
    BEFORE UPDATE ON document_metadata 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing
INSERT INTO messages (case_id, sender, content) VALUES 
    (1, 'test-client', 'This is a sample legal document for testing the embedding pipeline.'),
    (1, 'test-client', 'Contract agreement between parties for legal services and consultation.')
ON CONFLICT DO NOTHING;

-- Useful queries for monitoring:

-- Get embedding coverage
-- SELECT 
--     COUNT(*) as total_messages,
--     COUNT(me.id) as with_embeddings,
--     ROUND(COUNT(me.id) * 100.0 / COUNT(*), 2) as coverage_percent
-- FROM messages m 
-- LEFT JOIN message_embeddings me ON m.id = me.message_id;

-- Find similar documents
-- SELECT * FROM search_similar_documents(
--     (SELECT embedding FROM message_embeddings WHERE message_id = 1 LIMIT 1),
--     0.7,
--     5
-- );

-- Get document statistics  
-- SELECT * FROM get_document_stats();

COMMIT;