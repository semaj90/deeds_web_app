-- Sidecar migration: create parent_atlas_jobs table to enqueue processing packets
CREATE TABLE IF NOT EXISTS public.parent_atlas_jobs (
  id serial PRIMARY KEY,
  record_id text,
  status varchar(32) NOT NULL DEFAULT 'pending',
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_atlas_jobs_status ON public.parent_atlas_jobs(status);
