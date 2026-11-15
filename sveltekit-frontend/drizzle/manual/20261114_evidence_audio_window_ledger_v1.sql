-- Durable per-window ledger for bounded audio-content embedding (task 5.6 of evidence-analysis-bdd-pipeline).
-- Purpose: a retried or restarted video job knows which sampled audio windows already completed for
-- one source revision and analysis revision, and records per-window failure without discarding siblings.
-- Additive: creates one new table. No existing rows are rewritten.
-- Pre-image (2026-11-14): table does not exist in legal_ai_db. The vector writer is already idempotent
-- (evidence_multimodal_vectors conflict key); this ledger adds per-window status and resume evidence only.
-- Post-check: table exists, unique key exists, CHECK constraints present, row count = 0 after rehearsal.
-- Apply: manual psql only, after a rehearsal in legal_ai_live_integration_scratch rolled back.
-- Not journaled in drizzle/meta/_journal.json; registered in drizzle/sidecar-migrations.json.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.evidence') IS NULL THEN
    RAISE EXCEPTION 'EVIDENCE_AUDIO_WINDOW_LEDGER_REQUIRES_EVIDENCE_TABLE';
  END IF;
  IF to_regclass('public.evidence_audio_window_ledger') IS NOT NULL THEN
    RAISE EXCEPTION 'EVIDENCE_AUDIO_WINDOW_LEDGER_ALREADY_EXISTS';
  END IF;
END $$;

CREATE TABLE public.evidence_audio_window_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.evidence(id),
  source_revision text NOT NULL,
  analysis_revision text NOT NULL,
  analysis_job_id uuid NOT NULL,
  window_index integer NOT NULL,
  start_sample bigint NOT NULL,
  sample_count integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  vector_locator_sha256 text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT evidence_audio_window_ledger_source_revision_ck
    CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT evidence_audio_window_ledger_window_ck
    CHECK (window_index >= 0 AND start_sample >= 0 AND sample_count BETWEEN 1 AND 480000),
  CONSTRAINT evidence_audio_window_ledger_status_ck
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  CONSTRAINT evidence_audio_window_ledger_attempts_ck
    CHECK (attempt_count >= 0),
  CONSTRAINT evidence_audio_window_ledger_completed_ck
    CHECK (status <> 'COMPLETED' OR vector_locator_sha256 IS NOT NULL),
  CONSTRAINT evidence_audio_window_ledger_error_ck
    CHECK (last_error IS NULL OR char_length(last_error) <= 180),
  CONSTRAINT evidence_audio_window_ledger_window_key
    UNIQUE (evidence_id, source_revision, analysis_revision, window_index)
);

CREATE INDEX evidence_audio_window_ledger_job_idx
  ON public.evidence_audio_window_ledger (analysis_job_id, status);

-- Post-check (run inside the same transaction before COMMIT):
DO $$
BEGIN
  IF (SELECT count(*) FROM public.evidence_audio_window_ledger) <> 0 THEN
    RAISE EXCEPTION 'EVIDENCE_AUDIO_WINDOW_LEDGER_POSTCHECK_ROWS';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.evidence_audio_window_ledger'::regclass AND contype IN ('c', 'u', 'p', 'f')) < 6 THEN
    RAISE EXCEPTION 'EVIDENCE_AUDIO_WINDOW_LEDGER_POSTCHECK_CONSTRAINTS';
  END IF;
END $$;

COMMIT;
