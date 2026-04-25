-- Legal AI Platform - Initial Setup Migration
-- Creates database extensions, users table, and core legal document structure
-- Generated: 2025-09-06

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable pgvector for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable JSONB operators
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ============================================================================
-- CORE USER MANAGEMENT
-- ============================================================================

-- Users table for authentication and access control
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'lawyer', 'user', 'readonly')),
    
    -- User preferences
    preferences JSONB DEFAULT '{}',
    
    -- Account status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- LEGAL DOCUMENT CORE STRUCTURE
-- ============================================================================

-- Cases - Top level legal cases
CREATE TABLE IF NOT EXISTS legal_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number VARCHAR(255) UNIQUE NOT NULL,
    case_title TEXT NOT NULL,
    case_type VARCHAR(100), -- 'civil', 'criminal', 'appellate', 'administrative'
    
    -- Case metadata
    jurisdiction VARCHAR(255),
    court_name VARCHAR(255),
    judge_name VARCHAR(255),
    filing_date DATE,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'closed', 'settled', 'dismissed'
    
    -- Case participants
    parties JSONB DEFAULT '[]', -- Array of {name, role, type} objects
    attorneys JSONB DEFAULT '[]', -- Array of attorney information
    
    -- Case summary and notes
    case_summary TEXT,
    tags VARCHAR(255)[] DEFAULT '{}',
    
    -- Assignment and access control
    assigned_to UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Legal documents - Main documents table
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES legal_cases(id) ON DELETE CASCADE,
    
    -- Document identification
    document_title TEXT NOT NULL,
    document_type VARCHAR(100), -- 'brief', 'motion', 'evidence', 'contract', 'statute', 'case_law'
    document_number VARCHAR(255),
    
    -- File information
    file_name VARCHAR(255),
    file_path TEXT, -- MinIO object path
    file_size BIGINT,
    file_type VARCHAR(50), -- 'pdf', 'docx', 'txt', 'image'
    file_hash VARCHAR(64), -- SHA-256 hash for integrity
    
    -- Document content and processing
    raw_text TEXT, -- Extracted raw text
    processed_text TEXT, -- Cleaned and processed text
    ocr_confidence REAL, -- OCR confidence score 0-1
    
    -- Document metadata
    document_date DATE,
    author VARCHAR(255),
    source VARCHAR(255), -- Where document came from
    page_count INTEGER,
    
    -- Legal classification
    practice_areas VARCHAR(100)[] DEFAULT '{}', -- ['corporate', 'litigation', 'family']
    legal_topics VARCHAR(100)[] DEFAULT '{}', -- ['contract', 'tort', 'evidence']
    importance_score REAL DEFAULT 0.5, -- 0-1 importance rating
    confidence_level VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'verified'
    
    -- AI processing results
    summary TEXT,
    key_points JSONB DEFAULT '[]', -- Extracted key points
    entities JSONB DEFAULT '{}', -- Named entities: {"people": [], "places": [], "organizations": []}
    sentiment_score REAL, -- -1 to 1 sentiment
    complexity_score REAL, -- 0-1 document complexity
    
    -- Vector embedding for semantic search (384 dimensions for nomic-embed-text)
    embedding VECTOR(384),
    
    -- Document status and workflow
    processing_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    review_status VARCHAR(50) DEFAULT 'unreviewed', -- 'unreviewed', 'in_review', 'approved', 'rejected'
    
    -- Access control and privacy
    confidentiality_level VARCHAR(20) DEFAULT 'internal', -- 'public', 'internal', 'confidential', 'restricted'
    access_restrictions JSONB DEFAULT '{}',
    
    -- User interaction
    uploaded_by UUID REFERENCES users(id),
    reviewed_by UUID REFERENCES users(id),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks for detailed vector search and RAG
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    
    -- Chunk information
    chunk_index INTEGER NOT NULL, -- Order within document
    chunk_text TEXT NOT NULL,
    chunk_size INTEGER NOT NULL, -- Character count
    
    -- Chunk location
    page_number INTEGER,
    paragraph_index INTEGER,
    start_char INTEGER,
    end_char INTEGER,
    
    -- Chunk metadata
    chunk_type VARCHAR(50), -- 'paragraph', 'heading', 'table', 'footnote', 'citation'
    context_summary TEXT, -- Brief summary of surrounding context
    
    -- Vector embedding for chunk-level search
    embedding VECTOR(384),
    
    -- Chunk processing
    key_phrases VARCHAR(255)[] DEFAULT '{}',
    entities JSONB DEFAULT '{}',
    legal_concepts VARCHAR(100)[] DEFAULT '{}',
    
    -- Quality metrics
    coherence_score REAL, -- 0-1 how coherent the chunk is
    relevance_score REAL DEFAULT 0.5, -- 0-1 relevance to case
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR CORE TABLES
-- ============================================================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Case indexes
CREATE INDEX IF NOT EXISTS idx_legal_cases_number ON legal_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_legal_cases_type ON legal_cases(case_type);
CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_assigned ON legal_cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_legal_cases_created_by ON legal_cases(created_by);
CREATE INDEX IF NOT EXISTS idx_legal_cases_filing_date ON legal_cases(filing_date);

-- Document indexes
CREATE INDEX IF NOT EXISTS idx_legal_documents_case_id ON legal_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_documents_status ON legal_documents(processing_status, review_status);
CREATE INDEX IF NOT EXISTS idx_legal_documents_date ON legal_documents(document_date);
CREATE INDEX IF NOT EXISTS idx_legal_documents_uploaded_by ON legal_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_legal_documents_file_hash ON legal_documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_legal_documents_importance ON legal_documents(importance_score);

-- Full text search indexes
CREATE INDEX IF NOT EXISTS idx_legal_documents_text_search ON legal_documents 
    USING gin(to_tsvector('english', coalesce(document_title, '') || ' ' || coalesce(processed_text, '')));

-- JSONB indexes for metadata search
CREATE INDEX IF NOT EXISTS idx_legal_documents_entities ON legal_documents USING gin(entities);
CREATE INDEX IF NOT EXISTS idx_legal_documents_key_points ON legal_documents USING gin(key_points);
CREATE INDEX IF NOT EXISTS idx_legal_cases_parties ON legal_cases USING gin(parties);
CREATE INDEX IF NOT EXISTS idx_legal_cases_attorneys ON legal_cases USING gin(attorneys);

-- Array indexes for tags and categories
CREATE INDEX IF NOT EXISTS idx_legal_documents_practice_areas ON legal_documents USING gin(practice_areas);
CREATE INDEX IF NOT EXISTS idx_legal_documents_legal_topics ON legal_documents USING gin(legal_topics);
CREATE INDEX IF NOT EXISTS idx_legal_cases_tags ON legal_cases USING gin(tags);

-- Chunk indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_index ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_type ON document_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page ON document_chunks(page_number);
CREATE INDEX IF NOT EXISTS idx_document_chunks_phrases ON document_chunks USING gin(key_phrases);
CREATE INDEX IF NOT EXISTS idx_document_chunks_concepts ON document_chunks USING gin(legal_concepts);
CREATE INDEX IF NOT EXISTS idx_document_chunks_entities ON document_chunks USING gin(entities);

-- Vector similarity search indexes (HNSW for fast similarity search)
CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding_hnsw 
    ON legal_documents USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- FUNCTIONS AND VIEWS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_legal_cases_updated_at BEFORE UPDATE ON legal_cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_legal_documents_updated_at BEFORE UPDATE ON legal_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for document search with case information
CREATE OR REPLACE VIEW document_search_view AS
SELECT 
    d.id,
    d.document_title,
    d.document_type,
    d.summary,
    d.importance_score,
    d.embedding,
    c.case_number,
    c.case_title,
    c.case_type,
    d.created_at,
    d.processing_status,
    d.review_status
FROM legal_documents d
LEFT JOIN legal_cases c ON d.case_id = c.id
WHERE d.processing_status = 'completed';

-- Function for similarity search
CREATE OR REPLACE FUNCTION find_similar_documents(
    query_embedding vector(384),
    similarity_threshold real DEFAULT 0.7,
    max_results integer DEFAULT 10
)
RETURNS TABLE (
    document_id uuid,
    document_title text,
    similarity real,
    case_number varchar,
    case_title text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.document_title,
        1 - (d.embedding <=> query_embedding) AS similarity,
        c.case_number,
        c.case_title
    FROM legal_documents d
    LEFT JOIN legal_cases c ON d.case_id = c.id
    WHERE d.embedding IS NOT NULL
        AND 1 - (d.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA (Optional - remove in production)
-- ============================================================================

-- Insert a sample admin user (password: 'admin123' - change in production!)
INSERT INTO users (email, username, password_hash, full_name, role, is_verified) VALUES
('admin@legalai.local', 'admin', '$2b$10$YourHashedPasswordHere', 'System Administrator', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Migration completed
SELECT 'Migration 001_initial_setup.sql completed successfully' AS status;