-- Safe Migration: Add failed_jobs table for durable DLQ persistence
-- Date: 2026-04-20
-- Purpose: Restore DLQ observability when the table was not created in older DBs
-- Safe: Uses CREATE TABLE/INDEX IF NOT EXISTS (no data loss)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS failed_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue VARCHAR(100) NOT NULL,
    dlq_queue VARCHAR(100) NOT NULL,
    reason VARCHAR(100) NOT NULL DEFAULT 'unknown',
    retry_count INTEGER NOT NULL DEFAULT 0,
    payload JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    dead_lettered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS failed_jobs_queue_idx ON failed_jobs(queue);
CREATE INDEX IF NOT EXISTS failed_jobs_dead_lettered_at_idx ON failed_jobs(dead_lettered_at);
CREATE INDEX IF NOT EXISTS failed_jobs_resolved_at_idx ON failed_jobs(resolved_at);

COMMENT ON TABLE failed_jobs IS 'Durable log of dead-lettered RabbitMQ jobs for operational triage';