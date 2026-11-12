-- Additive, unapplied migration for resumable evidence-job progress.
-- Rehearse in a disposable database/transaction before any operator applies it.
-- analysis_jobs remains the durable job owner; this table is its append-only event history.

CREATE TABLE IF NOT EXISTS public.analysis_job_events (
  event_seq bigserial PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  case_id uuid NOT NULL,
  stage varchar(64) NOT NULL,
  status varchar(32) NOT NULL,
  progress varchar(32),
  source_revision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_job_events_status_ck CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

-- Record the highest event sequence removed for each durable job. Since event_seq
-- is global, consumers must compare this watermark rather than infer retention
-- loss from sequence-number gaps caused by other jobs.
ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS progress_events_pruned_max_seq bigint NOT NULL DEFAULT 0
  CHECK (progress_events_pruned_max_seq >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_job_events_event_id_uidx
  ON public.analysis_job_events (event_id);

CREATE INDEX IF NOT EXISTS analysis_job_events_job_sequence_idx
  ON public.analysis_job_events (job_id, event_seq);

CREATE OR REPLACE FUNCTION public.record_analysis_job_event_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_case_id uuid;
  v_source_revision text;
  v_stage varchar(64);
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.progress IS NOT DISTINCT FROM NEW.progress
     AND OLD.result IS NOT DISTINCT FROM NEW.result
     AND OLD.error IS NOT DISTINCT FROM NEW.error THEN
    RETURN NEW;
  END IF;

  SELECT e.case_id, e.hash
    INTO v_case_id, v_source_revision
    FROM public.evidence AS e
   WHERE e.id = NEW.evidence_id;

  -- Never let an explicitly scoped job override the evidence's owning case.
  IF NEW.case_id IS NOT NULL AND NEW.case_id IS DISTINCT FROM v_case_id THEN
    RAISE EXCEPTION 'ANALYSIS_JOB_CASE_EVIDENCE_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  -- Non-case analysis jobs are outside this case-authorized SSE contract.
  IF v_case_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_stage := CASE NEW.status
    WHEN 'queued' THEN 'queued'
    WHEN 'running' THEN 'running'
    WHEN 'completed' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    ELSE 'unknown'
  END;

  INSERT INTO public.analysis_job_events
    (job_id, evidence_id, case_id, stage, status, progress, source_revision)
  VALUES
    (NEW.id, NEW.evidence_id, v_case_id, v_stage, NEW.status, NEW.progress, v_source_revision);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analysis_jobs_event_history_v1 ON public.analysis_jobs;
CREATE TRIGGER analysis_jobs_event_history_v1
  AFTER INSERT OR UPDATE OF status, progress, result, error
  ON public.analysis_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.record_analysis_job_event_v1();

CREATE OR REPLACE FUNCTION public.record_analysis_job_event_prune_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.analysis_jobs
     SET progress_events_pruned_max_seq = GREATEST(progress_events_pruned_max_seq, OLD.event_seq)
   WHERE id = OLD.job_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS analysis_job_events_prune_watermark_v1 ON public.analysis_job_events;
CREATE TRIGGER analysis_job_events_prune_watermark_v1
  AFTER DELETE ON public.analysis_job_events
  FOR EACH ROW
  EXECUTE FUNCTION public.record_analysis_job_event_prune_v1();

COMMENT ON TABLE public.analysis_job_events IS
  'Append-only state history for analysis_jobs; contains only redacted case-scoped progress fields.';
COMMENT ON COLUMN public.analysis_jobs.progress_events_pruned_max_seq IS
  'Highest deleted analysis_job_events.event_seq for this job; clients with an older cursor must refresh state because replay has a retention gap.';
