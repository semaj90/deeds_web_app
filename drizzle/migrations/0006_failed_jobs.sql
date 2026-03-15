-- Sprint 3.7: Durable dead-letter job tracking table
CREATE TABLE IF NOT EXISTS "failed_jobs" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    "queue" varchar(100) NOT NULL,
    "dlq_queue" varchar(100) NOT NULL,
    "reason" varchar(100) NOT NULL DEFAULT 'unknown',
    "retry_count" integer NOT NULL DEFAULT 0,
    "payload" jsonb DEFAULT '{}',
    "error" text,
    "dead_lettered_at" timestamp with time zone DEFAULT now() NOT NULL,
    "resolved_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "failed_jobs_queue_idx" ON "failed_jobs" ("queue");
CREATE INDEX IF NOT EXISTS "failed_jobs_dead_lettered_at_idx" ON "failed_jobs" ("dead_lettered_at");
CREATE INDEX IF NOT EXISTS "failed_jobs_resolved_at_idx" ON "failed_jobs" ("resolved_at");
