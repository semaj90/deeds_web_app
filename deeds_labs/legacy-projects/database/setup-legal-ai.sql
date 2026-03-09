-- PostgreSQL + pgvector Setup for Legal AI System
-- Run this script as PostgreSQL superuser

-- Create database if not exists (run as superuser first)
-- CREATE DATABASE legal_ai_db;

-- Connect to the database
\c legal_ai_db;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create main legal documents table with vector support
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id VARCHAR(255),
    document_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    entities JSONB DEFAULT '[]'::jsonb,
    risk_score FLOAT DEFAULT 0,
    risk_assessment JSONB DEFAULT '{}'::jsonb,
    embedding vector(768),  -- For gemma3-legal embeddings
    metadata JSONB DEFAULT '{}'::jsonb,
    processing_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_case_id ON legal_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_document_type ON legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_created_at ON legal_documents(created_at DESC);

-- Create vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_documents_embedding 
ON legal_documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create full-text search indexes
CREATE INDEX IF NOT EXISTS idx_documents_content_fts 
ON legal_documents 
USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_documents_summary_fts 
ON legal_documents 
USING gin(to_tsvector('english', summary));

-- Create table for processing jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES legal_documents(id),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    payload JSONB DEFAULT '{}'::jsonb,
    result JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for jobs
CREATE INDEX IF NOT EXISTS idx_job_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_priority ON processing_jobs(priority DESC, created_at ASC);

-- Create helper function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_legal_documents_updated_at ON legal_documents;
CREATE TRIGGER trigger_legal_documents_updated_at
BEFORE UPDATE ON legal_documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Function to search similar documents by embedding
CREATE OR REPLACE FUNCTION search_similar_documents(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    document_id UUID,
    title VARCHAR(500),
    document_type VARCHAR(50),
    similarity FLOAT,
    summary TEXT
)
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ld.id as document_id,
        ld.title,
        ld.document_type,
        1 - (ld.embedding <=> query_embedding) as similarity,
        ld.summary
    FROM legal_documents ld
    WHERE ld.embedding IS NOT NULL
    AND 1 - (ld.embedding <=> query_embedding) > match_threshold
    ORDER BY ld.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing
INSERT INTO legal_documents (
    case_id, 
    document_type, 
    title, 
    content, 
    summary,
    risk_score
) VALUES 
(
    'CASE-2024-001',
    'contract',
    'Sample Legal Contract',
    'This is a sample legal contract for testing purposes. It contains standard terms and conditions for software licensing.',
    'Test contract for system validation',
    25.0
),
(
    'CASE-2024-001',
    'evidence',
    'Evidence Document #1',
    'This document contains evidence related to case CASE-2024-001. Key findings include digital forensics data.',
    'Key evidence for the case',
    75.0
)
ON CONFLICT DO NOTHING;

-- Show summary
SELECT 
    'Database Setup Complete' as status,
    COUNT(*) as documents_count
FROM legal_documents;
