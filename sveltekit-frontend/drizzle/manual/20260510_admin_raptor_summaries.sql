-- Migration: create admin_raptor_summaries table to match
-- src/lib/server/db/schema/admin-raptor-summaries.ts declaration.
--
-- The Drizzle schema for this lives in a sub-schema not picked up by
-- drizzle.config.ts (which reads schema.ts → schema-postgres.ts), so the
-- table was never auto-created. raptor-summarizer.ts already exists in code
-- but had no persistence target.
--
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260510_admin_raptor_summaries.sql
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS admin_raptor_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level           integer NOT NULL DEFAULT 0,             -- 0 = leaf chunks, 1+ = recursive summaries
  summary         text NOT NULL,
  source_clusters jsonb NOT NULL,                         -- array of cluster IDs that fed this summary
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_raptor_summaries_level_idx
  ON admin_raptor_summaries (level);

CREATE INDEX IF NOT EXISTS admin_raptor_summaries_created_idx
  ON admin_raptor_summaries (created_at DESC);
