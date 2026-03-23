-- AI Usage Log: Token tracking for LLM inference
-- Created: 2026-03-22

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    cached BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_user_idx ON ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_endpoint_idx ON ai_usage_log(endpoint);
CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx ON ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_log_model_idx ON ai_usage_log(model);