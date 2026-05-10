-- Analytics events + failed jobs tables
-- Mirrors analyticsEvents + failedJobs in schema-postgres.ts.
-- Run: psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f drizzle/manual/20260510_analytics_events.sql

CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "event_type"   VARCHAR(100) NOT NULL,
    "user_id"      UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "session_id"   VARCHAR(255),
    "payload"      JSONB DEFAULT '{}',
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "analytics_events_event_type_idx" ON "analytics_events" ("event_type");
CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx" ON "analytics_events" ("created_at");
CREATE INDEX IF NOT EXISTS "analytics_events_user_id_idx"    ON "analytics_events" ("user_id");

CREATE TABLE IF NOT EXISTS "failed_jobs" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "queue"            VARCHAR(100) NOT NULL,
    "dlq_queue"        VARCHAR(100) NOT NULL,
    "reason"           VARCHAR(100) NOT NULL DEFAULT 'unknown',
    "retry_count"      INTEGER NOT NULL DEFAULT 0,
    "payload"          JSONB DEFAULT '{}',
    "error"            TEXT,
    "dead_lettered_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "resolved_at"      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "failed_jobs_queue_idx"            ON "failed_jobs" ("queue");
CREATE INDEX IF NOT EXISTS "failed_jobs_dead_lettered_at_idx" ON "failed_jobs" ("dead_lettered_at");
CREATE INDEX IF NOT EXISTS "failed_jobs_resolved_at_idx"      ON "failed_jobs" ("resolved_at");
