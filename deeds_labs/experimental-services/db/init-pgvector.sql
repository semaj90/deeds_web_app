-- PostgreSQL + pgvector initialization script
-- Legal AI Platform - Vector Database Setup

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create legal documents table with vector embeddings
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding vector(768),  -- embeddinggemma dimension
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector similarity search (HNSW - faster than IVFFlat)
CREATE INDEX IF NOT EXISTS legal_documents_embedding_idx
ON legal_documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create index for metadata queries
CREATE INDEX IF NOT EXISTS legal_documents_metadata_idx
ON legal_documents
USING gin (metadata);

-- Create index for full-text search
CREATE INDEX IF NOT EXISTS legal_documents_content_idx
ON legal_documents
USING gin (to_tsvector('english', content));

-- Create document chunks table (for RAG)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (document_id, chunk_index)
);

-- Index for chunk embeddings
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create AI query history table
CREATE TABLE IF NOT EXISTS ai_query_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    query TEXT NOT NULL,
    query_embedding vector(768),
    response TEXT,
    provider VARCHAR(50),  -- 'tensorrt-triton', 'ollama', etc.
    latency_ms INTEGER,
    tokens_used INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for query history
CREATE INDEX IF NOT EXISTS ai_query_history_created_at_idx
ON ai_query_history (created_at DESC);

CREATE INDEX IF NOT EXISTS ai_query_history_user_id_idx
ON ai_query_history (user_id);

-- Create function for automatic updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for legal_documents
CREATE TRIGGER update_legal_documents_updated_at
BEFORE UPDATE ON legal_documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Helper function: Vector similarity search
CREATE OR REPLACE FUNCTION search_similar_documents(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    similarity float
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        id,
        content,
        metadata,
        1 - (embedding <=> query_embedding) as similarity
    FROM legal_documents
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Helper function: Hybrid search (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search_documents(
    query_text TEXT,
    query_embedding vector(768),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    vector_score float,
    text_score float,
    combined_score float
)
LANGUAGE SQL STABLE
AS $$
    WITH vector_search AS (
        SELECT
            id,
            content,
            metadata,
            1 - (embedding <=> query_embedding) as vector_score
        FROM legal_documents
        WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ),
    text_search AS (
        SELECT
            id,
            ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', query_text)) as text_score
        FROM legal_documents
        WHERE to_tsvector('english', content) @@ plainto_tsquery('english', query_text)
    )
    SELECT
        v.id,
        v.content,
        v.metadata,
        v.vector_score,
        COALESCE(t.text_score, 0) as text_score,
        (v.vector_score * 0.7 + COALESCE(t.text_score, 0) * 0.3) as combined_score
    FROM vector_search v
    LEFT JOIN text_search t ON v.id = t.id
    ORDER BY combined_score DESC
    LIMIT match_count;
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;

-- Insert sample data for testing (optional)
INSERT INTO legal_documents (content, metadata) VALUES
('A contract is a legally binding agreement between two or more parties.', '{"type": "definition", "category": "contract_law"}'),
('Employment contracts outline the terms and conditions of employment.', '{"type": "explanation", "category": "employment_law"}'),
('Breach of contract occurs when one party fails to fulfill their obligations.', '{"type": "violation", "category": "contract_law"}')
ON CONFLICT DO NOTHING;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'pgvector extension and legal_documents schema initialized successfully';
END $$;
