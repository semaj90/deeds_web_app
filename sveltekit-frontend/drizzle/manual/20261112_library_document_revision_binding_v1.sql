-- Bind ingestion jobs and library versions to the exact bytes they process.
-- Candidate sidecar only: do not apply to a live database without migration review.
-- Legacy rows remain NULL unless a separate source-qualified reconciliation proves
-- which revision they represent.

ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS source_hash text;

ALTER TABLE public.library_document_versions
  ADD COLUMN IF NOT EXISTS source_hash text;

CREATE INDEX IF NOT EXISTS ingestion_jobs_source_hash_status_idx
  ON public.ingestion_jobs (source_hash, status, available_at);

CREATE INDEX IF NOT EXISTS library_document_versions_source_hash_idx
  ON public.library_document_versions (document_id, source_hash)
  WHERE source_hash IS NOT NULL;

COMMENT ON COLUMN public.ingestion_jobs.source_hash IS
  'SHA-256 of the document bytes observed when the job was enqueued; workers must reject a mismatch.';

COMMENT ON COLUMN public.library_document_versions.source_hash IS
  'SHA-256 of the source bytes represented by this version row.';
