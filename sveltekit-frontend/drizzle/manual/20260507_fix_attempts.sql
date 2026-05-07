-- Audit log for ops.record_fix_attempt (operator-gated MCP tool).
-- Each row is one human-approved fix proposal: type, diff, scope, outcome.
-- Idempotent: safe to re-apply; uses IF NOT EXISTS for table + indexes.

CREATE TABLE IF NOT EXISTS fix_attempts (
  id              bigserial PRIMARY KEY,
  fix_type        text        NOT NULL,
  fix_description text        NOT NULL,
  fix_diff        text,
  files_affected  integer     NOT NULL DEFAULT 0,
  errors_resolved integer     NOT NULL DEFAULT 0,
  success         boolean,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fix_attempts_fix_type_idx
  ON fix_attempts (fix_type);

CREATE INDEX IF NOT EXISTS fix_attempts_created_at_idx
  ON fix_attempts (created_at DESC);

CREATE INDEX IF NOT EXISTS fix_attempts_metadata_gin_idx
  ON fix_attempts USING gin (metadata);
