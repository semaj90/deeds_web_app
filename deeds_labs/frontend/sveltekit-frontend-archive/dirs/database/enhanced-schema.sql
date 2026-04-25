-- Enhanced PostgreSQL schema with pgvector for legal AI system
-- Run with: psql -d legal_ai_db -f enhanced-schema.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User embeddings for personalized context
CREATE TABLE user_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'query', 'case_note', 'evidence_summary', etc.
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI ada-002 / Ollama compatible
    metadata JSONB DEFAULT '{}',
    case_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case vector summaries
CREATE TABLE case_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL,
    summary_type VARCHAR(50) NOT NULL, -- 'full_summary', 'evidence_summary', 'timeline', etc.
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evidence metadata with vector search
CREATE TABLE evidence_vectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_id UUID NOT NULL,
    case_id UUID NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'description', 'ocr_text', 'analysis', etc.
    content TEXT NOT NULL,
    embedding vector(1536),
    qdrant_point_id UUID, -- Reference to Qdrant for detailed metadata
    confidence FLOAT DEFAULT 0.0,
    tags TEXT[], -- Array of extracted tags
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat conversation embeddings
CREATE TABLE chat_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL,
    message_id UUID NOT NULL,
    user_id UUID NOT NULL,
    case_id UUID,
    content TEXT NOT NULL,
    embedding vector(1536),
    message_type VARCHAR(20) NOT NULL, -- 'user', 'assistant'
    context_used JSONB DEFAULT '{}', -- What context was used for this response
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Legal precedent vectors
CREATE TABLE precedent_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    precedent_id UUID NOT NULL,
    citation VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    full_text TEXT,
    embedding vector(1536),
    jurisdiction VARCHAR(100),
    court_level VARCHAR(50),
    decision_date DATE,
    relevance_score FLOAT DEFAULT 0.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes for vector similarity search
CREATE INDEX user_embeddings_vector_idx ON user_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX case_embeddings_vector_idx ON case_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX evidence_vectors_vector_idx ON evidence_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX chat_embeddings_vector_idx ON chat_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX precedent_embeddings_vector_idx ON precedent_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Traditional indexes for filtering
CREATE INDEX user_embeddings_user_id_idx ON user_embeddings (user_id);
CREATE INDEX user_embeddings_case_id_idx ON user_embeddings (case_id);
CREATE INDEX user_embeddings_content_type_idx ON user_embeddings (content_type);

CREATE INDEX case_embeddings_case_id_idx ON case_embeddings (case_id);
CREATE INDEX case_embeddings_summary_type_idx ON case_embeddings (summary_type);

CREATE INDEX evidence_vectors_case_id_idx ON evidence_vectors (case_id);
CREATE INDEX evidence_vectors_evidence_id_idx ON evidence_vectors (evidence_id);
CREATE INDEX evidence_vectors_content_type_idx ON evidence_vectors (content_type);

CREATE INDEX chat_embeddings_conversation_id_idx ON chat_embeddings (conversation_id);
CREATE INDEX chat_embeddings_user_id_idx ON chat_embeddings (user_id);
CREATE INDEX chat_embeddings_case_id_idx ON chat_embeddings (case_id);

CREATE INDEX precedent_embeddings_jurisdiction_idx ON precedent_embeddings (jurisdiction);
CREATE INDEX precedent_embeddings_court_level_idx ON precedent_embeddings (court_level);

-- Functions for similarity search
CREATE OR REPLACE FUNCTION find_similar_user_content(
    query_embedding vector(1536),
    user_id_param UUID,
    content_type_param VARCHAR(50) DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity FLOAT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ue.id,
        ue.content,
        1 - (ue.embedding <=> query_embedding) as similarity,
        ue.metadata,
        ue.created_at
    FROM user_embeddings ue
    WHERE ue.user_id = user_id_param
        AND (content_type_param IS NULL OR ue.content_type = content_type_param)
        AND (1 - (ue.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY ue.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_evidence(
    query_embedding vector(1536),
    case_id_param UUID DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    evidence_id UUID,
    content TEXT,
    similarity FLOAT,
    tags TEXT[],
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ev.id,
        ev.evidence_id,
        ev.content,
        1 - (ev.embedding <=> query_embedding) as similarity,
        ev.tags,
        ev.metadata
    FROM evidence_vectors ev
    WHERE (case_id_param IS NULL OR ev.case_id = case_id_param)
        AND (1 - (ev.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY ev.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_relevant_precedents(
    query_embedding vector(1536),
    jurisdiction_param VARCHAR(100) DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.6,
    max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    citation VARCHAR(255),
    summary TEXT,
    similarity FLOAT,
    jurisdiction VARCHAR(100),
    decision_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pe.id,
        pe.citation,
        pe.summary,
        1 - (pe.embedding <=> query_embedding) as similarity,
        pe.jurisdiction,
        pe.decision_date
    FROM precedent_embeddings pe
    WHERE (jurisdiction_param IS NULL OR pe.jurisdiction = jurisdiction_param)
        AND (1 - (pe.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY pe.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
