-- Safe Migration: Add Missing Chat and Push Notification Tables
-- Date: 2026-04-09
-- Purpose: Add yorha_chat_sessions, chat_messages, push_subscriptions
-- Safe: Uses CREATE TABLE IF NOT EXISTS (no data loss)

-- 1. yorha_chat_sessions (Chat system sessions)
CREATE TABLE IF NOT EXISTS yorha_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    title TEXT,
    context_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_yorha_chat_sessions_user_id ON yorha_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_yorha_chat_sessions_case_id ON yorha_chat_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_yorha_chat_sessions_updated_at ON yorha_chat_sessions(updated_at DESC);

COMMENT ON TABLE yorha_chat_sessions IS 'YORHA AI chat sessions with context tracking';

-- 2. chat_messages (Individual chat messages)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES yorha_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    model TEXT,
    tokens_used INTEGER,
    latency_ms INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

COMMENT ON TABLE chat_messages IS 'Individual chat messages within sessions';

-- 3. push_subscriptions (Web Push notification subscriptions)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

COMMENT ON TABLE push_subscriptions IS 'Web Push API subscription data for browser notifications';

-- Verification: Count new tables
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('yorha_chat_sessions', 'chat_messages', 'push_subscriptions');

    RAISE NOTICE '✅ Migration complete: % chat/push tables now exist', table_count;
END $$;
