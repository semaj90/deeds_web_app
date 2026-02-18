-- User Analytics Events table
-- Stores contextual events for predictive analytics + todo summaries.
-- Events, not raw content — privacy-safe.
-- JSONB payload for flexible schema evolution.

CREATE TABLE IF NOT EXISTS user_analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id TEXT,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON user_analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON user_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON user_analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user_event_time ON user_analytics_events(user_id, event_type, created_at);

-- GIN index on JSONB payload for queryHash / routeId lookups
CREATE INDEX IF NOT EXISTS idx_analytics_payload ON user_analytics_events USING GIN (payload);

-- Partition hint: if this table grows beyond 10M rows, partition by created_at monthly.
-- For now, a simple table with indexes is sufficient.
