-- PostgreSQL Init Script for Legal AI Platform
-- This script runs when the Docker container first boots
-- Creates core legal workflow tables + AI assistant tables with seed data

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ====================
-- Core User Management
-- ====================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  jurisdiction TEXT,
  practice_areas TEXT[],
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User activities
CREATE TABLE IF NOT EXISTS user_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ====================
-- Core Legal Workflow
-- ====================

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  external_ref TEXT UNIQUE,
  case_number TEXT UNIQUE,
  client_name TEXT,
  assigned_attorney TEXT,
  court_jurisdiction TEXT,
  case_type TEXT,
  priority TEXT DEFAULT 'normal',
  metadata JSONB DEFAULT '{}'
);

-- Evidence files table
CREATE TABLE IF NOT EXISTS evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT,
  mime_type TEXT,
  file_size INTEGER,
  embeddings vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES users(id),
  file_hash TEXT,
  processing_status TEXT DEFAULT 'pending'
);

-- Legal documents
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  document_type TEXT,
  file_path TEXT,
  embeddings vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft'
);

-- Case activities
CREATE TABLE IF NOT EXISTS case_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ====================
-- AI Assistant Tables
-- ====================

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Chat Session',
  context JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Chat embeddings (for semantic search)
CREATE TABLE IF NOT EXISTS chat_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI analysis results
CREATE TABLE IF NOT EXISTS ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID,
  case_id UUID REFERENCES cases(id),
  analysis_type TEXT NOT NULL,
  input_text TEXT NOT NULL,
  analysis_result JSONB NOT NULL,
  confidence_score DECIMAL(5,4),
  processing_time_ms INTEGER,
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- AI recommendations
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence_score DECIMAL(5,4),
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- GPU inference messages (for performance monitoring)
CREATE TABLE IF NOT EXISTS gpu_inference_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  inference_time_ms INTEGER,
  gpu_utilization DECIMAL(5,2),
  memory_usage_mb INTEGER,
  status TEXT DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- AI engine status
CREATE TABLE IF NOT EXISTS ai_engine_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_name TEXT NOT NULL UNIQUE,
  is_online BOOLEAN DEFAULT false,
  last_health_check TIMESTAMPTZ DEFAULT now(),
  response_time INTEGER,
  version TEXT,
  capabilities JSONB DEFAULT '{}',
  configuration JSONB DEFAULT '{}'
);

-- ====================
-- Vector Search Indexes
-- ====================

-- Create vector indexes for semantic search
CREATE INDEX IF NOT EXISTS idx_evidence_embeddings_hnsw
ON evidence_files USING hnsw (embeddings vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_documents_embeddings_hnsw
ON legal_documents USING hnsw (embeddings vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_chat_embeddings_hnsw
ON chat_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ====================
-- Additional Indexes
-- ====================

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence_files(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_case_activities_case_id ON case_activities(case_id);

-- Text search indexes
CREATE INDEX IF NOT EXISTS idx_cases_title_gin ON cases USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_legal_documents_content_gin ON legal_documents USING gin(to_tsvector('english', content));

-- ====================
-- Seed Data
-- ====================

-- Insert test user (prevents authentication 401s)
INSERT INTO users (id, email, hashed_password, created_at)
VALUES (
  'ba2c97bb-2f5a-4887-9e1c-324f7f011747'::uuid,
  'test@example.com',
  '$2b$12$dummy.hash.for.testing.only.placeholder.value',
  now()
) ON CONFLICT (email) DO NOTHING;

-- Insert user profile for test user
INSERT INTO user_profiles (user_id, first_name, last_name, jurisdiction, practice_areas)
VALUES (
  'ba2c97bb-2f5a-4887-9e1c-324f7f011747'::uuid,
  'Test',
  'User',
  'California',
  ARRAY['Corporate Law', 'Contract Law']
) ON CONFLICT DO NOTHING;

-- Insert test case (prevents case API 500s)
INSERT INTO cases (id, title, description, status, case_number, client_name, assigned_attorney)
VALUES (
  'c1e2d3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a'::uuid,
  'Sample Contract Dispute',
  'Contract dispute regarding software licensing terms',
  'active',
  'CASE-001-TEST',
  'Tech Corp Inc.',
  'Test Attorney'
) ON CONFLICT (case_number) DO NOTHING;

-- Insert test evidence file
INSERT INTO evidence_files (case_id, filename, mime_type, file_size, processing_status, uploaded_by)
VALUES (
  'c1e2d3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a'::uuid,
  'contract_draft_v1.pdf',
  'application/pdf',
  245760,
  'completed',
  'ba2c97bb-2f5a-4887-9e1c-324f7f011747'::uuid
) ON CONFLICT DO NOTHING;

-- Insert test legal document
INSERT INTO legal_documents (case_id, title, content, document_type, status)
VALUES (
  'c1e2d3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a'::uuid,
  'Contract Analysis Memo',
  'This memo analyzes the key terms of the software licensing contract...',
  'legal_memo',
  'completed'
) ON CONFLICT DO NOTHING;

-- Insert AI engine status (prevents AI API 500s)
INSERT INTO ai_engine_status (engine_name, is_online, version, capabilities)
VALUES
  ('gemma4-legal', true, '3.0.0', '{"analysis": true, "chat": true, "embeddings": true}'),
  ('cuda-gpu-server', true, '1.2.0', '{"inference": true, "vectorization": true}')
ON CONFLICT (engine_name) DO UPDATE SET
  is_online = EXCLUDED.is_online,
  last_health_check = now();

-- Create sample case activity
INSERT INTO case_activities (case_id, user_id, activity_type, description)
VALUES (
  'c1e2d3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a'::uuid,
  'ba2c97bb-2f5a-4887-9e1c-324f7f011747'::uuid,
  'case_created',
  'Initial case setup completed'
) ON CONFLICT DO NOTHING;

-- Create sample AI recommendation
INSERT INTO ai_recommendations (case_id, recommendation_type, title, description, confidence_score)
VALUES (
  'c1e2d3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a'::uuid,
  'contract_review',
  'Review Termination Clauses',
  'The contract contains ambiguous termination clauses that may need clarification',
  0.8500
) ON CONFLICT DO NOTHING;

-- ====================
-- Final Setup
-- ====================

-- Update table statistics for query planner
ANALYZE;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Legal AI Platform database initialized successfully';
    RAISE NOTICE 'Created % tables with seed data', (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    );
END $$;