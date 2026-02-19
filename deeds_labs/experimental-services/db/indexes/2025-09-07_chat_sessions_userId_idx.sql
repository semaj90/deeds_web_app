-- Accelerate chat history lookups by userId stored in JSONB metadata
-- Safe to run multiple times; CREATE INDEX IF NOT EXISTS is idempotent in modern Postgres

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id
ON chat_sessions ((metadata ->> 'userId'));
