-- Additive provenance for bounded Gemma4 Parent Atlas summaries.
-- Text generation remains llama-server only; Ollama is embedding-only.

ALTER TABLE IF EXISTS public.parent_atlas_documents
  ADD COLUMN IF NOT EXISTS summary_hash text,
  ADD COLUMN IF NOT EXISTS summary_model text,
  ADD COLUMN IF NOT EXISTS summary_backend text,
  ADD COLUMN IF NOT EXISTS summary_version text,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_parent_atlas_documents_summary_model
  ON public.parent_atlas_documents(summary_model);

CREATE INDEX IF NOT EXISTS idx_parent_atlas_documents_summary_generated_at
  ON public.parent_atlas_documents(summary_generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_atlas_documents_summary_metadata_gin
  ON public.parent_atlas_documents USING gin(summary_metadata);
