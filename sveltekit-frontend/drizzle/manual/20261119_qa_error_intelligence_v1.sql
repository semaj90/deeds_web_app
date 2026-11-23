-- 2026-11-19 — QA error intelligence (openspec: e2e-error-intelligence-kanban, task QA-DB-01).
-- STATUS: DRAFT. NOT APPLIED to legal_ai_db. Rehearsal only, in a transaction that ends in ROLLBACK.
-- Not in drizzle/meta/_journal.json; applied by hand only after explicit operator approval.
--
-- Tables:
--   qa_runs    one Playwright run (revision, verified server identity, totals)
--   qa_issues  one row per fingerprint (deduplicated defect); disposition kept separate from task state
--   qa_events  raw occurrences; append-only, each tied to one run and one fingerprint
--
-- kanban_task_id is plain text until the task table identity is confirmed (QA-TASK-LINK-01).
-- The partial unique index enforces one active task per issue at the database level.

BEGIN;

CREATE TABLE IF NOT EXISTS qa_runs (
  run_id           text PRIMARY KEY,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  revision         text,
  server_pid       integer,
  server_started_at timestamptz,
  server_verified  boolean NOT NULL DEFAULT false,
  totals           jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_ref     text
);

CREATE TABLE IF NOT EXISTS qa_issues (
  fingerprint        text PRIMARY KEY CHECK (fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  error_code         text NOT NULL,
  feature_label      text NOT NULL,
  route_template     text NOT NULL,
  severity           text NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
  confidence         text NOT NULL CHECK (confidence IN ('EXPLICIT', 'ASSERTION', 'STACK', 'KEYWORD')),
  needs_confirmation boolean NOT NULL DEFAULT false,
  occurrences        integer NOT NULL DEFAULT 0 CHECK (occurrences >= 0),
  first_run_id       text REFERENCES qa_runs (run_id),
  last_run_id        text REFERENCES qa_runs (run_id),
  disposition        text NOT NULL DEFAULT 'NEW' CHECK (disposition IN (
                       'NEW', 'TRIAGED', 'ACCEPTED', 'SUPPRESSED', 'RESOLVED_UNVERIFIED', 'RESOLVED_VERIFIED')),
  kanban_task_id     text,
  sample_message     text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_issues_one_active_task
  ON qa_issues (kanban_task_id) WHERE kanban_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS qa_events (
  id             bigserial PRIMARY KEY,
  run_id         text NOT NULL REFERENCES qa_runs (run_id),
  fingerprint    text NOT NULL REFERENCES qa_issues (fingerprint),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL,
  error_code     text NOT NULL,
  feature_label  text NOT NULL,
  route_template text,
  test_title     text,
  artifact_ref   text
);

CREATE INDEX IF NOT EXISTS qa_events_fingerprint_idx ON qa_events (fingerprint, occurred_at);
CREATE INDEX IF NOT EXISTS qa_events_run_idx ON qa_events (run_id);

-- Post-checks (rehearsal prints these; they must all be true before any apply is considered).
SELECT
  to_regclass('public.qa_runs')   IS NOT NULL AS qa_runs_present,
  to_regclass('public.qa_issues') IS NOT NULL AS qa_issues_present,
  to_regclass('public.qa_events') IS NOT NULL AS qa_events_present,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'qa_issues_one_active_task') AS partial_unique_present;

ROLLBACK;
