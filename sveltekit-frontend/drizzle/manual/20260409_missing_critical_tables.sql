-- Safe Migration: Add Missing Critical Tables
-- Date: 2026-04-09
-- Purpose: Add tables defined in Drizzle schema but missing from DB
-- Safe: Uses CREATE TABLE IF NOT EXISTS (no data loss)

-- 1. api_audit_log (from MEMORY.md - audit logging feature)
CREATE TABLE IF NOT EXISTS api_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    request_body JSONB,
    response_body JSONB,
    ip_address TEXT,
    user_agent TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_api_audit_log_user_id ON api_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_api_audit_log_path ON api_audit_log(path);
CREATE INDEX IF NOT EXISTS idx_api_audit_log_created_at ON api_audit_log(created_at DESC);

COMMENT ON TABLE api_audit_log IS 'API request audit trail with request/response logging';

-- 2. poi_profiles (Persons of Interest feature)
CREATE TABLE IF NOT EXISTS poi_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    aliases TEXT[],
    date_of_birth DATE,
    description TEXT,
    role TEXT, -- 'suspect', 'witness', 'victim', 'other'
    risk_level TEXT, -- 'low', 'medium', 'high', 'critical'
    contact_info JSONB DEFAULT '{}'::jsonb,
    physical_description JSONB DEFAULT '{}'::jsonb,
    known_associates TEXT[],
    timeline_events JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_profiles_case_id ON poi_profiles(case_id);
CREATE INDEX IF NOT EXISTS idx_poi_profiles_name ON poi_profiles(name);
CREATE INDEX IF NOT EXISTS idx_poi_profiles_role ON poi_profiles(role);

COMMENT ON TABLE poi_profiles IS 'Person of Interest profiles with risk assessment and timeline';

-- 3. ace_chunks (ACE - Adaptive Context Engine chunks)
CREATE TABLE IF NOT EXISTS ace_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_type TEXT, -- 'legal', 'evidence', 'analysis', 'note'
    source_document_id UUID,
    chunk_index INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(768), -- 768-dim vector for semantic search
    quality_score REAL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ace_chunks_case_id ON ace_chunks(case_id);
CREATE INDEX IF NOT EXISTS idx_ace_chunks_type ON ace_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_ace_chunks_embedding_hnsw ON ace_chunks USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops);

COMMENT ON TABLE ace_chunks IS 'ACE (Adaptive Context Engine) content chunks with embeddings';

-- 4. chat_turn_evidence (Chat system - evidence references in chat turns)
CREATE TABLE IF NOT EXISTS chat_turn_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_turn_id UUID, -- References chat turn (if chat_turns table exists)
    evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE,
    relevance_score REAL DEFAULT 0.5,
    snippet TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_turn_id ON chat_turn_evidence(chat_turn_id);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_evidence_id ON chat_turn_evidence(evidence_id);

COMMENT ON TABLE chat_turn_evidence IS 'Links between chat turns and referenced evidence items';

-- Verification: Count new tables
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('api_audit_log', 'poi_profiles', 'ace_chunks', 'chat_turn_evidence');

    RAISE NOTICE '✅ Migration complete: % critical tables now exist', table_count;
END $$;
