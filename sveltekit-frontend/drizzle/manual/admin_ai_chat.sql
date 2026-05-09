-- Admin AI Chat Sessions & Messages
-- Supports persistent contextual AI assistance for the Unified Indexing Studio.

CREATE TABLE IF NOT EXISTS admin_ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    context_tag TEXT DEFAULT 'global',
    active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_chat_active_session 
ON admin_ai_chat_sessions (user_id, context_tag) 
WHERE active = true;

CREATE TABLE IF NOT EXISTS admin_ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES admin_ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_chat_messages_session ON admin_ai_chat_messages(session_id);

-- Add sample session for dev bypass
-- INSERT INTO admin_ai_chat_sessions (user_id, context_tag) VALUES ('dev-admin', 'global');
