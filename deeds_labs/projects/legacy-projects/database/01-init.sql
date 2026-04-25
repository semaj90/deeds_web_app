-- PHASE 3+4 LEGAL AI DATABASE SCHEMA
-- Advanced RAG + Data Management + Event Streaming

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Legal documents with embeddings for RAG (Phase 3)
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    document_type VARCHAR(100) CHECK (document_type IN ('contract', 'motion', 'brief', 'evidence', 'correspondence', 'statute', 'case_law')),
    case_id VARCHAR(255),
    file_path VARCHAR(1000),
    file_hash VARCHAR(64),
    -- Vector embedding for similarity search
    embedding vector(384),
    -- Metadata for enhanced search
    metadata JSONB DEFAULT '{}',
    -- RAG-specific fields
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,
    rag_indexed BOOLEAN DEFAULT FALSE,
    rag_last_updated TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Legal cases with comprehensive tracking (Phase 4)
CREATE TABLE IF NOT EXISTS legal_cases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    case_number VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(100) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'pending', 'dismissed', 'on_hold')),
    priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    prosecutor VARCHAR(255),
    defendant VARCHAR(255),
    judge VARCHAR(255),
    court VARCHAR(255),
    charges JSONB DEFAULT '[]',
    date_filed DATE,
    date_closed DATE,
    estimated_completion DATE,
    -- Phase 4: Event tracking
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activity_count INTEGER DEFAULT 0,
    -- Metadata and tags
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Event logs for real-time streaming (Phase 4)
CREATE TABLE IF NOT EXISTS event_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    -- Event data payload
    event_data JSONB DEFAULT '{}',
    -- User and session tracking
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    -- Timestamp partitioning
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User memory for AI assistant context
CREATE TABLE IF NOT EXISTS user_memory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    interaction_type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    -- Vector embedding for semantic search
    embedding vector(384),
    -- 4D context dimensions
    temporal_context JSONB DEFAULT '{}',
    spatial_context JSONB DEFAULT '{}',
    semantic_context JSONB DEFAULT '{}',
    social_context JSONB DEFAULT '{}',
    -- Memory management
    relevance_score REAL DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_documents_embedding 
    ON legal_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_documents_content_fts 
    ON legal_documents USING GIN (to_tsvector('english', content));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_cases_number ON legal_cases (case_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_cases_status ON legal_cases (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_type ON event_logs (event_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_memory_user_id ON user_memory (user_id);

-- Insert sample data
INSERT INTO legal_cases (case_number, title, description, status, priority) VALUES
('PHASE34-2024-001', 'Advanced RAG Software License Dispute', 'Complex contract dispute involving AI software licensing terms and intellectual property rights', 'active', 'high'),
('PHASE34-2024-002', 'Event-Driven Employment Law Compliance', 'Comprehensive review of remote work policies and real-time labor law compliance', 'active', 'medium'),
('PHASE34-2024-003', 'Data Management Privacy Audit', 'GDPR and CCPA compliance audit for AI-powered legal document processing system', 'pending', 'urgent')
ON CONFLICT (case_number) DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Phase 3+4 Legal AI Database Schema initialized successfully!';
    RAISE NOTICE '📊 Tables: legal_documents, legal_cases, event_logs, user_memory';
    RAISE NOTICE '🔍 Indexes: Vector search, full-text search, performance optimization';
    RAISE NOTICE '⚡ Features: RAG embeddings, event streaming, 4D memory';
END $$;
