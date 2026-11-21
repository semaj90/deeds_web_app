-- Candidate only: durable orchestration state for case scene generation.
-- Not applied. scene_document_revisions remains the canonical saved scene.
-- Workers may poll queued rows with FOR UPDATE SKIP LOCKED; RabbitMQ is optional wake-up only.
CREATE TABLE IF NOT EXISTS scene_generation_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  scene_id uuid NOT NULL,
  created_by integer NOT NULL,
  input_kind text NOT NULL CONSTRAINT scene_generation_jobs_input_kind_ck CHECK (input_kind IN ('BLOCKOUT', 'EVIDENCE_BACKED')),
  expected_scene_revision integer NOT NULL CONSTRAINT scene_generation_jobs_expected_revision_ck CHECK (expected_scene_revision >= 0),
  request_sha256 text NOT NULL CONSTRAINT scene_generation_jobs_request_sha_ck CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CONSTRAINT scene_generation_jobs_idempotency_ck CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  request_snapshot jsonb NOT NULL CONSTRAINT scene_generation_jobs_request_object_ck CHECK (jsonb_typeof(request_snapshot) = 'object'),
  CONSTRAINT scene_generation_jobs_request_size_ck CHECK (pg_column_size(request_snapshot) <= 1048576),
  source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT scene_generation_jobs_source_array_ck CHECK (jsonb_typeof(source_snapshot) = 'array'),
  status text NOT NULL DEFAULT 'queued' CONSTRAINT scene_generation_jobs_status_ck CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale')),
  progress integer NOT NULL DEFAULT 0 CONSTRAINT scene_generation_jobs_progress_ck CHECK (progress BETWEEN 0 AND 100),
  attempt_count smallint NOT NULL DEFAULT 0 CONSTRAINT scene_generation_jobs_attempt_count_ck CHECK (attempt_count BETWEEN 0 AND 5),
  max_attempts smallint NOT NULL DEFAULT 3 CONSTRAINT scene_generation_jobs_max_attempts_ck CHECK (max_attempts BETWEEN 1 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  worker_id text,
  lease_expires_at timestamptz,
  error_code text,
  result_refs jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT scene_generation_jobs_result_array_ck CHECK (jsonb_typeof(result_refs) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT scene_generation_jobs_case_scene_idempotency_uq UNIQUE (case_id, scene_id, idempotency_key),
  CONSTRAINT scene_generation_jobs_source_kind_ck CHECK (
    (input_kind = 'BLOCKOUT' AND jsonb_array_length(source_snapshot) = 0) OR
    (input_kind = 'EVIDENCE_BACKED' AND jsonb_array_length(source_snapshot) > 0)
  ),
  CONSTRAINT scene_generation_jobs_attempt_limit_ck CHECK (attempt_count <= max_attempts),
  CONSTRAINT scene_generation_jobs_lease_ck CHECK (
    (status = 'running' AND worker_id IS NOT NULL AND lease_expires_at IS NOT NULL) OR
    (status <> 'running' AND worker_id IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS scene_generation_jobs_claim_idx
  ON scene_generation_jobs (available_at, created_at, job_id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS scene_generation_jobs_case_scene_idx
  ON scene_generation_jobs (case_id, scene_id, created_at DESC);

-- Immutable transition history. The mutable job row is the current lifecycle
-- projection; this table records why each accepted transition occurred.
CREATE TABLE IF NOT EXISTS scene_generation_job_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES scene_generation_jobs(job_id) ON DELETE RESTRICT,
  sequence integer NOT NULL CONSTRAINT scene_generation_job_events_sequence_ck CHECK (sequence >= 1),
  from_status text CONSTRAINT scene_generation_job_events_from_status_ck CHECK (from_status IS NULL OR from_status IN ('queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale')),
  to_status text NOT NULL CONSTRAINT scene_generation_job_events_to_status_ck CHECK (to_status IN ('queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale')),
  reason_code text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT scene_generation_job_events_details_object_ck CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_generation_job_events_job_sequence_uq UNIQUE (job_id, sequence)
);
CREATE INDEX IF NOT EXISTS scene_generation_job_events_job_idx
  ON scene_generation_job_events (job_id, sequence);

CREATE OR REPLACE FUNCTION reject_scene_generation_job_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'scene_generation_job_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS scene_generation_job_events_immutable_trg ON scene_generation_job_events;
CREATE TRIGGER scene_generation_job_events_immutable_trg
  BEFORE UPDATE OR DELETE ON scene_generation_job_events
  FOR EACH ROW EXECUTE FUNCTION reject_scene_generation_job_event_mutation();
