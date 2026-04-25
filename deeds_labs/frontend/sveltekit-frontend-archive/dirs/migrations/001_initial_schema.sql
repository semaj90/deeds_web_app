-- Legal AI Database Schema CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "vector"; --
Users table CREATE TABLE users ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email VARCHAR(255) UNIQUE NOT NULL,
password_hash VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'lawyer', created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW() ); -- Cases table CREATE TABLE cases ( id UUID PRIMARY KEY DEFAULT
uuid_generate_v4(), title VARCHAR(500) NOT NULL, description TEXT, status VARCHAR(50) NOT NULL DEFAULT 'active',
priority VARCHAR(50) NOT NULL DEFAULT 'medium', user_id UUID REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW() ); -- Evidence table CREATE TABLE evidence ( id UUID PRIMARY KEY DEFAULT
uuid_generate_v4(), case_id UUID REFERENCES cases(id), title VARCHAR(500) NOT NULL, content TEXT, file_path
VARCHAR(1000), embedding vector(1536), created_at TIMESTAMP DEFAULT NOW() ); -- Context sessions table CREATE TABLE
context_sessions ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID REFERENCES users(id), session_id
VARCHAR(255) UNIQUE NOT NULL, context_data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP
DEFAULT NOW() ); -- Indexes for performance CREATE INDEX idx_cases_user_id ON cases(user_id); CREATE INDEX
idx_cases_status ON cases(status); CREATE INDEX idx_evidence_case_id ON evidence(case_id); CREATE INDEX
idx_context_sessions_user_id ON context_sessions(user_id); CREATE INDEX idx_evidence_embedding ON evidence USING ivfflat
(embedding vector_cosine_ops);
