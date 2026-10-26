-- Add source coordinates and extractor provenance to structural reference
-- resolutions. Existing rows remain readable; legacy lineage stays NULL.
ALTER TABLE public.atlas_structural_reference_resolutions
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS target_source_ref TEXT,
  ADD COLUMN IF NOT EXISTS target_source_revision TEXT,
  ADD COLUMN IF NOT EXISTS workspace_revision TEXT,
  ADD COLUMN IF NOT EXISTS upstream_source_node_id TEXT,
  ADD COLUMN IF NOT EXISTS upstream_target_node_id TEXT,
  ADD COLUMN IF NOT EXISTS upstream_chunk_id TEXT,
  ADD COLUMN IF NOT EXISTS captures JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extractor TEXT,
  ADD COLUMN IF NOT EXISTS extractor_revision TEXT;

CREATE INDEX IF NOT EXISTS idx_atlas_reference_resolution_workspace_source
  ON public.atlas_structural_reference_resolutions (workspace_revision, source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_reference_resolution_workspace_target
  ON public.atlas_structural_reference_resolutions (workspace_revision, target_source_ref);
