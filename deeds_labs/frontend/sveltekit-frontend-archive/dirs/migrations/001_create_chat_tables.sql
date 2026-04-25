-- Phase 80: Chat Messages & Metadata Tables Migration
-- Run this script to create persistent chat storage in legal_ai_db

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    migrated_from VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_migrated_from ON chat_messages(migrated_from);

-- Create chat_metadata table
CREATE TABLE IF NOT EXISTS chat_metadata (
    chat_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    title VARCHAR(500),
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for chat_metadata
CREATE INDEX IF NOT EXISTS idx_chat_metadata_user_id ON chat_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_metadata_last_message_at ON chat_metadata(last_message_at);

-- Add updated_at trigger for chat_messages
CREATE OR REPLACE FUNCTION update_chat_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_messages_updated_at_trigger ON chat_messages;
CREATE TRIGGER chat_messages_updated_at_trigger
    BEFORE UPDATE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_messages_updated_at();

-- Add updated_at trigger for chat_metadata
CREATE OR REPLACE FUNCTION update_chat_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_metadata_updated_at_trigger ON chat_metadata;
CREATE TRIGGER chat_metadata_updated_at_trigger
    BEFORE UPDATE ON chat_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_metadata_updated_at();

-- Grant permissions to legal_admin
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO legal_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_metadata TO legal_admin;
GRANT USAGE, SELECT ON SEQUENCE chat_messages_id_seq TO legal_admin;

-- Verification queries
SELECT 'chat_messages table created' as status,
       COUNT(*) as row_count
FROM chat_messages;

SELECT 'chat_metadata table created' as status,
       COUNT(*) as row_count
FROM chat_metadata;

-- Show table structure
\d chat_messages
\d chat_metadata
