-- Library ingestion jobs use PostgreSQL as the durable queue authority.
-- Candidate only: do not apply to a live database without the normal review gate.
ALTER TABLE public.ingestion_jobs
  ALTER COLUMN status SET DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS ingestion_jobs_claim_idx
  ON public.ingestion_jobs (available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS ingestion_jobs_expired_lease_idx
  ON public.ingestion_jobs (lease_expires_at, created_at)
  WHERE status = 'running';

COMMENT ON COLUMN public.ingestion_jobs.lease_token IS
  'Opaque per-claim lease identity; NULL when not leased. Pair with fencing_token.';
COMMENT ON COLUMN public.ingestion_jobs.fencing_token IS
  'Monotonic per-job claim generation. Every new claim increments it; stale generations cannot mutate canonical rows.';
COMMENT ON COLUMN public.ingestion_jobs.lease_expires_at IS
  'Lease deadline for crash recovery; expired running jobs may be reclaimed.';
