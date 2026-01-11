-- Enhanced Legal AI Platform Schema with pgvector and Qdrant Integration
-- Migration: 002_enhanced_schema_with_qdrant.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Set vector search parameters for better performance
SET ivfflat.probes = 10;
SET hnsw.ef_search = 40;

-- ============================================================================
-- DROP EXISTING TABLES IF THEY EXIST (for clean migration)
-- ============================================================================

DROP TABLE IF EXISTS vector_operations CASCADE;
DROP TABLE IF EXISTS qdrant_collections CASCADE;
DROP TABLE IF EXISTS legal_documents CASCADE;
DROP TABLE IF EXISTS cases CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- USERS TABLE WITH VECTOR EMBEDDINGS
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255),
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    department VARCHAR(100),
    jurisdiction VARCHAR(100),
    permissions JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    avatar_url VARCHAR(500),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Legal AI specific fields
    practice_areas JSONB DEFAULT '[]',
    bar_number VARCHAR(50),
    firm_name VARCHAR(200),
    
    -- Vector embeddings for AI recommendations (384 dimensions for nomic-embed-text)
    profile_embedding vector(384),
    
    -- Metadata and timestamps
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for users table
CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_username_idx ON users(username);
CREATE INDEX users_role_idx ON users(role);
CREATE INDEX users_active_idx ON users(is_active);
CREATE INDEX users_profile_embedding_hnsw_idx ON users USING hnsw (profile_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- SESSIONS TABLE
-- ============================================================================

CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for sessions table
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

-- ============================================================================
-- CASES TABLE WITH VECTOR EMBEDDINGS
-- ============================================================================

CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    case_number VARCHAR(100) UNIQUE,
    
    -- Case details
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    practice_area VARCHAR(100),
    jurisdiction VARCHAR(100),
    court VARCHAR(200),
    
    -- Parties and representatives
    client_name VARCHAR(200),
    opposing_party VARCHAR(200),
    assigned_attorney UUID REFERENCES users(id),
    
    -- Dates
    filing_date TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    closed_date TIMESTAMP WITH TIME ZONE,
    
    -- Vector embedding for case similarity
    case_embedding vector(384),
    
    -- Qdrant integration
    qdrant_id UUID,
    qdrant_collection VARCHAR(100) DEFAULT 'cases',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for cases table
CREATE UNIQUE INDEX cases_case_number_idx ON cases(case_number);
CREATE INDEX cases_status_idx ON cases(status);
CREATE INDEX cases_practice_area_idx ON cases(practice_area);
CREATE INDEX cases_assigned_attorney_idx ON cases(assigned_attorney);
CREATE INDEX cases_case_embedding_hnsw_idx ON cases USING hnsw (case_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- LEGAL DOCUMENTS TABLE WITH COMPREHENSIVE VECTOR SUPPORT
-- ============================================================================

CREATE TABLE legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    
    -- Document classification
    document_type VARCHAR(50) NOT NULL DEFAULT 'document',
    practice_area VARCHAR(100),
    jurisdiction VARCHAR(100),
    case_number VARCHAR(100),
    
    -- File information
    file_path VARCHAR(1000),
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Vector embeddings for semantic search (384 dimensions)
    title_embedding vector(384),
    content_embedding vector(384),
    summary_embedding vector(384),
    
    -- Qdrant integration
    qdrant_id UUID,
    qdrant_collection VARCHAR(100) DEFAULT 'legal_documents',
    last_synced_to_qdrant TIMESTAMP WITH TIME ZONE,
    
    -- Metadata and relationships
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Status and visibility
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    visibility VARCHAR(20) NOT NULL DEFAULT 'private',
    
    -- AI processing fields
    ai_processed BOOLEAN NOT NULL DEFAULT false,
    confidence_score REAL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for legal_documents table
CREATE INDEX legal_documents_title_idx ON legal_documents(title);
CREATE INDEX legal_documents_type_idx ON legal_documents(document_type);
CREATE INDEX legal_documents_practice_area_idx ON legal_documents(practice_area);
CREATE INDEX legal_documents_user_id_idx ON legal_documents(user_id);
CREATE INDEX legal_documents_case_id_idx ON legal_documents(case_id);
CREATE INDEX legal_documents_status_idx ON legal_documents(status);
CREATE UNIQUE INDEX legal_documents_qdrant_id_idx ON legal_documents(qdrant_id);

-- High-performance vector indexes with optimized parameters
CREATE INDEX legal_documents_title_embedding_hnsw_idx 
    ON legal_documents USING hnsw (title_embedding vector_cosine_ops) 
    WITH (m = 16, ef_construction = 64);

CREATE INDEX legal_documents_content_embedding_hnsw_idx 
    ON legal_documents USING hnsw (content_embedding vector_cosine_ops) 
    WITH (m = 16, ef_construction = 64);

CREATE INDEX legal_documents_summary_embedding_hnsw_idx 
    ON legal_documents USING hnsw (summary_embedding vector_cosine_ops) 
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- VECTOR OPERATIONS TRACKING TABLE
-- ============================================================================

CREATE TABLE vector_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type VARCHAR(50) NOT NULL, -- 'embed', 'search', 'sync'
    entity_type VARCHAR(50) NOT NULL, -- 'document', 'case', 'user'
    entity_id UUID NOT NULL,
    
    -- Vector operation details
    model_name VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',
    dimensions INTEGER NOT NULL DEFAULT 384,
    similarity VARCHAR(20) DEFAULT 'cosine',
    
    -- Performance metrics
    processing_time_ms INTEGER,
    similarity_score REAL,
    
    -- Qdrant sync status
    qdrant_synced BOOLEAN NOT NULL DEFAULT false,
    qdrant_synced_at TIMESTAMP WITH TIME ZONE,
    qdrant_error TEXT,
    
    -- Status and metadata
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    metadata JSONB DEFAULT '{}',
    error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for vector_operations table
CREATE INDEX vector_operations_operation_type_idx ON vector_operations(operation_type);
CREATE INDEX vector_operations_entity_type_idx ON vector_operations(entity_type);
CREATE INDEX vector_operations_entity_id_idx ON vector_operations(entity_id);
CREATE INDEX vector_operations_status_idx ON vector_operations(status);
CREATE INDEX vector_operations_qdrant_synced_idx ON vector_operations(qdrant_synced);

-- ============================================================================
-- QDRANT COLLECTIONS MANAGEMENT TABLE
-- ============================================================================

CREATE TABLE qdrant_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    
    -- Vector configuration
    vector_size INTEGER NOT NULL DEFAULT 384,
    distance VARCHAR(20) NOT NULL DEFAULT 'Cosine',
    
    -- Collection status
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_optimized BOOLEAN NOT NULL DEFAULT false,
    
    -- Statistics
    points_count INTEGER NOT NULL DEFAULT 0,
    last_synced TIMESTAMP WITH TIME ZONE,
    
    -- Configuration
    config JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for qdrant_collections table
CREATE UNIQUE INDEX qdrant_collections_name_idx ON qdrant_collections(name);
CREATE INDEX qdrant_collections_status_idx ON qdrant_collections(status);

-- ============================================================================
-- HELPFUL FUNCTIONS FOR VECTOR OPERATIONS
-- ============================================================================

-- Function to calculate cosine similarity between vectors
CREATE OR REPLACE FUNCTION cosine_similarity(vec1 vector, vec2 vector)
RETURNS REAL AS $$
BEGIN
    RETURN 1 - (vec1 <=> vec2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get similar documents using vector similarity
CREATE OR REPLACE FUNCTION get_similar_documents(
    query_embedding vector(384),
    similarity_threshold REAL DEFAULT 0.7,
    result_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(500),
    similarity REAL,
    document_type VARCHAR(50),
    practice_area VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.title,
        cosine_similarity(d.content_embedding, query_embedding) as similarity,
        d.document_type,
        d.practice_area
    FROM legal_documents d
    WHERE d.content_embedding IS NOT NULL
        AND d.deleted_at IS NULL
        AND d.status = 'active'
        AND cosine_similarity(d.content_embedding, query_embedding) >= similarity_threshold
    ORDER BY d.content_embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for timestamp updates
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_legal_documents_updated_at
    BEFORE UPDATE ON legal_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qdrant_collections_updated_at
    BEFORE UPDATE ON qdrant_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA SETUP
-- ============================================================================

-- Insert default Qdrant collections
INSERT INTO qdrant_collections (name, description, vector_size, distance) VALUES
    ('legal_documents', 'Legal documents collection for semantic search', 384, 'Cosine'),
    ('cases', 'Legal cases collection for case similarity', 384, 'Cosine'),
    ('users', 'User profiles for recommendation system', 384, 'Cosine')
ON CONFLICT (name) DO NOTHING;

-- Create initial admin user (password should be changed in production)
INSERT INTO users (
    email, 
    hashed_password, 
    username, 
    first_name, 
    last_name, 
    role,
    is_active,
    email_verified
) VALUES (
    'admin@legal-ai.local',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewHHj.TKXsVvbE5m', -- password: admin123
    'admin',
    'System',
    'Administrator',
    'admin',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to legal_admin user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;

-- Grant vector extension usage
GRANT USAGE ON SCHEMA public TO legal_admin;

-- Success message
SELECT 'Enhanced Legal AI database schema with pgvector and Qdrant integration created successfully!' as result;