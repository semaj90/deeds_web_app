-- Analytics Events: durable event log for RabbitMQ analytics consumer
-- Persists analytics alongside Redis sorted sets for long-term querying

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_event_type_idx ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx ON analytics_events (user_id);
