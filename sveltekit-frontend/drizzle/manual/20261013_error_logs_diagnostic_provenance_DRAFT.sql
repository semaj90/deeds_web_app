-- DRAFT — NOT APPLIED. For review only.
-- Purpose: add diagnostic provenance columns to the existing error_logs table
-- (reuse, not a second diagnostic table) so svelte-check observations can be
-- indexed by log checksum, line, fingerprint, and full-text message.
-- Target: PostgreSQL 18.4, legal_ai_db. Current state: 1 row, no tsvector column.
-- Every statement is additive and idempotent (IF NOT EXISTS). No DROP, no UPDATE.

BEGIN;

ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS diagnostic_run_id text NULL;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS diagnostic_log_sha256 text NULL;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS diagnostic_log_line integer NULL;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS diagnostic_code text NULL;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS diagnostic_fingerprint text NULL;

-- Stored generated column. Adding a stored generated column rewrites the table;
-- at current size (1 row) this is negligible. Re-check the row count before applying.
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS message_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(message, ''))) STORED;

-- Exact lookup by fingerprint (B-tree, partial: only diagnostic rows).
CREATE INDEX IF NOT EXISTS error_logs_diagnostic_fingerprint_idx
  ON error_logs (diagnostic_fingerprint)
  WHERE diagnostic_fingerprint IS NOT NULL;

-- Idempotent replay: one observation per (log checksum, log line).
CREATE UNIQUE INDEX IF NOT EXISTS error_logs_diagnostic_log_line_uidx
  ON error_logs (diagnostic_log_sha256, diagnostic_log_line)
  WHERE diagnostic_log_sha256 IS NOT NULL;

-- Full-text search over diagnostic messages (GIN on the stored tsvector).
CREATE INDEX IF NOT EXISTS error_logs_message_tsv_gin
  ON error_logs USING gin (message_tsv);

COMMIT;

-- Rollback (owner decision only; valid while the new columns are unused):
--   ALTER TABLE error_logs DROP COLUMN IF EXISTS message_tsv,
--     DROP COLUMN IF EXISTS diagnostic_fingerprint, DROP COLUMN IF EXISTS diagnostic_code,
--     DROP COLUMN IF EXISTS diagnostic_log_line, DROP COLUMN IF EXISTS diagnostic_log_sha256,
--     DROP COLUMN IF EXISTS diagnostic_run_id;
