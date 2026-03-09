-- Phase 4: Legal RAG Database Initialization
-- PostgreSQL with pgvector for legal document embeddings

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Legal documents table with vector embeddings
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    document_type VARCHAR(100) NOT NULL,
    case_id VARCHAR(255),
    file_path VARCHAR(1000),
    file_hash VARCHAR(64) UNIQUE,
    metadata JSONB,
    embedding vector(384),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    indexed_at TIMESTAMP
);

-- Vector similarity index
CREATE INDEX IF NOT EXISTS legal_documents_embedding_idx 
ON legal_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search index
CREATE INDEX IF NOT EXISTS legal_documents_content_idx 
ON legal_documents USING GIN (to_tsvector('english', content));

-- Legal cases with RAG support
CREATE TABLE IF NOT EXISTS legal_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    priority VARCHAR(50) DEFAULT 'medium',
    jurisdiction VARCHAR(200),
    court_name VARCHAR(300),
    assigned_attorney VARCHAR(255),
    client_name VARCHAR(255),
    case_summary_embedding vector(384),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legal entities extracted by AI
CREATE TABLE IF NOT EXISTS legal_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,
    entity_value VARCHAR(500) NOT NULL,
    confidence DECIMAL(3,2),
    start_position INTEGER,
    end_position INTEGER,
    context TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAG query history
CREATE TABLE IF NOT EXISTS rag_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255),
    query_text TEXT NOT NULL,
    query_embedding vector(384),
    response_text TEXT,
    documents_used JSONB,
    confidence_score DECIMAL(3,2),
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document processing jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    document_id UUID REFERENCES legal_documents(id),
    parameters JSONB,
    result JSONB,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail for legal compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample legal cases
INSERT INTO legal_cases (case_number, title, description, status, priority) VALUES
('RAG-2024-001', 'Contract Dispute - AI Technology Licensing', 'Complex AI technology licensing dispute involving patent rights', 'active', 'high'),
('RAG-2024-002', 'Employment Law - Remote Work Compliance', 'Multi-state remote work compliance and labor law issues', 'active', 'medium'),
('RAG-2024-003', 'Data Privacy - GDPR Compliance Audit', 'Comprehensive GDPR compliance review and remediation', 'pending', 'high')
ON CONFLICT (case_number) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_legal_documents_case_id ON legal_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_entities_document_id ON legal_entities(document_id);
CREATE INDEX IF NOT EXISTS idx_legal_entities_type ON legal_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_rag_queries_user_id ON rag_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
