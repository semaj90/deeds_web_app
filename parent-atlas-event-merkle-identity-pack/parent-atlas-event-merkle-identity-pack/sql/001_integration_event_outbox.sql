-- TEMPLATE: reuse queue/outbox claim/retry mechanics without overloading TaskType.
CREATE TABLE IF NOT EXISTS integration_event_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    exchange_name TEXT NOT NULL,
    routing_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    correlation_id TEXT,
    causation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS integration_event_outbox_pending_idx
ON integration_event_outbox (created_at, id)
WHERE delivered_at IS NULL AND failed_at IS NULL;

-- Canonical evidence INSERT + outbox INSERT MUST occur in the same transaction.
-- Claim rows with FOR UPDATE SKIP LOCKED using the existing publisher pattern.
