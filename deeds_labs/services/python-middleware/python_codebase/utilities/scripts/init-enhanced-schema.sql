-- Enhanced Legal AI Database Schema with Advanced Features
-- Supports embeddings, user behavior, recommendations, and semantic analysis
-- Compatible with existing prosecutor_db schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "hstore";

-- Enhanced users table (extends existing if present)
DO $$ 
BEGIN
    -- Check if users table exists, if not create it
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            role VARCHAR(50) DEFAULT 'user',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP WITH TIME ZONE,
            is_active BOOLEAN DEFAULT TRUE
        );
    END IF;
    
    -- Add new columns if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_data') THEN
        ALTER TABLE users ADD COLUMN profile_data JSONB DEFAULT '{}';
        ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}';
        ALTER TABLE users ADD COLUMN ai_settings JSONB DEFAULT '{}';
        ALTER TABLE users ADD COLUMN avatar_url TEXT;
        ALTER TABLE users ADD COLUMN bio TEXT;
        ALTER TABLE users ADD COLUMN specializations TEXT[];
    END IF;
END $$;

-- Enhanced cases table with embeddings and metadata
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cases') THEN
        CREATE TABLE cases (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            content TEXT,
            case_number VARCHAR(100) UNIQUE,
            status VARCHAR(50) DEFAULT 'draft',
            priority VARCHAR(20) DEFAULT 'medium',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    END IF;
    
    -- Add enhanced columns if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'case_type') THEN
        ALTER TABLE cases ADD COLUMN case_type VARCHAR(100);
        ALTER TABLE cases ADD COLUMN jurisdiction VARCHAR(100);
        ALTER TABLE cases ADD COLUMN court VARCHAR(200);
        ALTER TABLE cases ADD COLUMN judge VARCHAR(200);
        ALTER TABLE cases ADD COLUMN opposing_counsel VARCHAR(200);
        ALTER TABLE cases ADD COLUMN client_info JSONB DEFAULT '{}';
        ALTER TABLE cases ADD COLUMN metadata JSONB DEFAULT '{}';
        ALTER TABLE cases ADD COLUMN tags TEXT[];
        ALTER TABLE cases ADD COLUMN deadlines JSONB DEFAULT '[]';
        ALTER TABLE cases ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
        -- Vector embeddings for semantic search
        ALTER TABLE cases ADD COLUMN title_embedding vector(384);
        ALTER TABLE cases ADD COLUMN content_embedding vector(384);
    END IF;
    
    -- Add full-text search column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'search_vector') THEN
        ALTER TABLE cases ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            to_tsvector('english', 
                COALESCE(title, '') || ' ' || 
                COALESCE(description, '') || ' ' || 
                COALESCE(content, '') || ' ' ||
                COALESCE(case_number, '') || ' ' ||
                COALESCE(case_type, '') || ' ' ||
                array_to_string(COALESCE(tags, ARRAY[]::TEXT[]), ' ')
            )
        ) STORED;
    END IF;
END $$;

-- Enhanced evidence table with metadata and embeddings
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evidence') THEN
        CREATE TABLE evidence (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id),
            filename VARCHAR(500) NOT NULL,
            original_filename VARCHAR(500),
            file_path TEXT NOT NULL,
            file_size BIGINT,
            mime_type VARCHAR(100),
            file_hash VARCHAR(64) UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    END IF;
    
    -- Add enhanced columns
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'evidence' AND column_name = 'upload_method') THEN
        ALTER TABLE evidence ADD COLUMN upload_method VARCHAR(50) DEFAULT 'manual';
        ALTER TABLE evidence ADD COLUMN extracted_text TEXT;
        ALTER TABLE evidence ADD COLUMN metadata JSONB DEFAULT '{}';
        ALTER TABLE evidence ADD COLUMN tags TEXT[];
        ALTER TABLE evidence ADD COLUMN annotations JSONB DEFAULT '[]';
        ALTER TABLE evidence ADD COLUMN ocr_data JSONB;
        ALTER TABLE evidence ADD COLUMN analysis_results JSONB DEFAULT '{}';
        ALTER TABLE evidence ADD COLUMN processed_at TIMESTAMP WITH TIME ZONE;
        -- Vector embeddings
        ALTER TABLE evidence ADD COLUMN content_embedding vector(384);
    END IF;
    
    -- Add full-text search column
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'evidence' AND column_name = 'search_vector') THEN
        ALTER TABLE evidence ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            to_tsvector('english', 
                COALESCE(filename, '') || ' ' || 
                COALESCE(original_filename, '') || ' ' || 
                COALESCE(extracted_text, '') || ' ' ||
                array_to_string(COALESCE(tags, ARRAY[]::TEXT[]), ' ')
            )
        ) STORED;
    END IF;
END $$;

-- User behavior tracking for AI recommendations
CREATE TABLE IF NOT EXISTS user_behavior (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100),
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE
);

-- AI recommendations based on user behavior and content similarity
CREATE TABLE IF NOT EXISTS ai_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recommendation_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    score FLOAT NOT NULL DEFAULT 0.0,
    reasoning TEXT,
    context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    viewed_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Document embeddings for semantic search
CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- 'case', 'evidence', 'note', etc.
    entity_id UUID NOT NULL,
    embedding_type VARCHAR(50) NOT NULL, -- 'title', 'content', 'summary'
    embedding vector(384) NOT NULL,
    model_name VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',
    chunk_index INTEGER DEFAULT 0,
    chunk_text TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge graph entities for Neo4j integration
CREATE TABLE IF NOT EXISTS knowledge_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    neo4j_id BIGINT,
    entity_type VARCHAR(50) NOT NULL,
    entity_name VARCHAR(500) NOT NULL,
    properties JSONB DEFAULT '{}',
    source_type VARCHAR(50),
    source_id UUID,
    confidence_score FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE
);

-- Semantic relationships between entities
CREATE TABLE IF NOT EXISTS semantic_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_entity_id UUID NOT NULL REFERENCES knowledge_entities(id),
    to_entity_id UUID NOT NULL REFERENCES knowledge_entities(id),
    relationship_type VARCHAR(100) NOT NULL,
    strength FLOAT DEFAULT 1.0,
    properties JSONB DEFAULT '{}',
    source VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Detective mode investigations
CREATE TABLE IF NOT EXISTS investigations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    investigation_type VARCHAR(50) DEFAULT 'general',
    status VARCHAR(50) DEFAULT 'active',
    findings JSONB DEFAULT '[]',
    timeline JSONB DEFAULT '[]',
    connections JSONB DEFAULT '[]',
    evidence_links UUID[],
    ai_insights JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Canvas data for interactive visual analysis
CREATE TABLE IF NOT EXISTS canvas_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    investigation_id UUID REFERENCES investigations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    canvas_type VARCHAR(50) DEFAULT 'investigation',
    canvas_data JSONB NOT NULL DEFAULT '{}',
    version INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    auto_save_data JSONB DEFAULT '{}'
);

-- AI chat conversations and context
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    conversation_type VARCHAR(50) DEFAULT 'general',
    title VARCHAR(500),
    messages JSONB NOT NULL DEFAULT '[]',
    context JSONB DEFAULT '{}',
    model_used VARCHAR(100),
    total_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- Hash verification table (for existing system compatibility)
CREATE TABLE IF NOT EXISTS hash_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID,
    file_hash VARCHAR(64) NOT NULL,
    verification_status VARCHAR(50) DEFAULT 'pending',
    verification_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    blockchain_hash VARCHAR(128),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);
CREATE INDEX IF NOT EXISTS idx_cases_search_vector ON cases USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_cases_tags ON cases USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_user_id ON evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_file_hash ON evidence(file_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_search_vector ON evidence USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_evidence_tags ON evidence USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_user_behavior_user_id ON user_behavior(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_action_type ON user_behavior(action_type);
CREATE INDEX IF NOT EXISTS idx_user_behavior_timestamp ON user_behavior(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_behavior_entity ON user_behavior(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_user_id ON ai_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_type ON ai_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_entity ON ai_recommendations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_score ON ai_recommendations(score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_active ON ai_recommendations(is_active, created_at);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_entity ON document_embeddings(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_type ON document_embeddings(embedding_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type ON knowledge_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON knowledge_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_source ON knowledge_entities(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_semantic_relationships_from ON semantic_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_to ON semantic_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_type ON semantic_relationships(relationship_type);

CREATE INDEX IF NOT EXISTS idx_investigations_case_id ON investigations(case_id);
CREATE INDEX IF NOT EXISTS idx_investigations_user_id ON investigations(user_id);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);

CREATE INDEX IF NOT EXISTS idx_canvas_data_case_id ON canvas_data(case_id);
CREATE INDEX IF NOT EXISTS idx_canvas_data_investigation_id ON canvas_data(investigation_id);
CREATE INDEX IF NOT EXISTS idx_canvas_data_user_id ON canvas_data(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_case_id ON ai_conversations(case_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_type ON ai_conversations(conversation_type);

CREATE INDEX IF NOT EXISTS idx_hash_verifications_file_hash ON hash_verifications(file_hash);
CREATE INDEX IF NOT EXISTS idx_hash_verifications_status ON hash_verifications(verification_status);

-- Vector similarity search indexes (using HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_cases_title_embedding ON cases USING hnsw (title_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_cases_content_embedding ON cases USING hnsw (content_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_evidence_content_embedding ON evidence USING hnsw (content_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create or replace function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_cases_updated_at') THEN
        CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_evidence_updated_at') THEN
        CREATE TRIGGER update_evidence_updated_at BEFORE UPDATE ON evidence FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_document_embeddings_updated_at') THEN
        CREATE TRIGGER update_document_embeddings_updated_at BEFORE UPDATE ON document_embeddings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_knowledge_entities_updated_at') THEN
        CREATE TRIGGER update_knowledge_entities_updated_at BEFORE UPDATE ON knowledge_entities FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_semantic_relationships_updated_at') THEN
        CREATE TRIGGER update_semantic_relationships_updated_at BEFORE UPDATE ON semantic_relationships FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_investigations_updated_at') THEN
        CREATE TRIGGER update_investigations_updated_at BEFORE UPDATE ON investigations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_canvas_data_updated_at') THEN
        CREATE TRIGGER update_canvas_data_updated_at BEFORE UPDATE ON canvas_data FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_conversations_updated_at') THEN
        CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- Function for semantic similarity search
CREATE OR REPLACE FUNCTION find_similar_content(
    query_embedding vector(384),
    entity_type_filter text DEFAULT NULL,
    similarity_threshold float DEFAULT 0.7,
    max_results int DEFAULT 10
)
RETURNS TABLE(
    entity_id uuid,
    entity_type text,
    similarity float,
    chunk_text text,
    metadata jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.entity_id,
        de.entity_type,
        1 - (de.embedding <=> query_embedding) as similarity,
        de.chunk_text,
        de.metadata
    FROM document_embeddings de
    WHERE 
        (entity_type_filter IS NULL OR de.entity_type = entity_type_filter)
        AND (1 - (de.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function for AI recommendation scoring
CREATE OR REPLACE FUNCTION calculate_recommendation_score(
    user_id_param uuid,
    entity_id_param uuid,
    entity_type_param text
) RETURNS FLOAT AS $$
DECLARE
    behavior_score FLOAT := 0;
    similarity_score FLOAT := 0;
    time_decay_factor FLOAT := 1;
    final_score FLOAT := 0;
BEGIN
    -- Calculate behavior-based score
    SELECT COALESCE(AVG(
        CASE action_type
            WHEN 'view' THEN 0.1
            WHEN 'edit' THEN 0.3
            WHEN 'share' THEN 0.2
            WHEN 'bookmark' THEN 0.4
            ELSE 0.05
        END
    ), 0) INTO behavior_score
    FROM user_behavior 
    WHERE user_id = user_id_param 
    AND entity_type = entity_type_param
    AND timestamp > NOW() - INTERVAL '30 days';
    
    -- Add time decay factor
    time_decay_factor := EXTRACT(EPOCH FROM (NOW() - (
        SELECT MAX(timestamp) FROM user_behavior 
        WHERE user_id = user_id_param 
        AND entity_id = entity_id_param
    ))) / 86400 / 30; -- 30-day decay
    
    time_decay_factor := GREATEST(0.1, 1 - time_decay_factor);
    
    final_score := (behavior_score * 0.7 + similarity_score * 0.3) * time_decay_factor;
    
    RETURN LEAST(1.0, final_score);
END;
$$ LANGUAGE plpgsql;

-- Insert initial demo data if tables are empty
DO $$
BEGIN
    -- Create demo admin user if no users exist
    IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
        INSERT INTO users (id, email, username, password_hash, first_name, last_name, role, profile_data, ai_settings) VALUES 
        (
            uuid_generate_v4(),
            'admin@prosecutor.demo',
            'admin',
            '$2b$12$demo.hash.for.development.only',
            'Demo',
            'Admin',
            'admin',
            '{"department": "Legal", "bar_number": "DEMO123"}',
            '{"detective_mode": true, "auto_recommendations": true, "embedding_model": "nomic-embed-text"}'
        );
    END IF;
END $$;

-- Log successful completion
DO $$
BEGIN
    RAISE NOTICE 'Enhanced Legal AI database schema initialized successfully!';
    RAISE NOTICE 'Features enabled: Vector embeddings, Knowledge graphs, Detective mode, AI recommendations';
END $$;
