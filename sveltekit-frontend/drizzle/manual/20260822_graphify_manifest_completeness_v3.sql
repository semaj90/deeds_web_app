-- Parent Atlas Graphify full-manifest completeness extension.
-- Manual migration. Additive only: no DROP / UPDATE / DELETE / TRUNCATE / backfill.
-- APPLIED 2026-08-23 against the live legal-ai-postgres container, immediately after
-- 20260822_graphify_revision_authority_v2.sql (see that file's header for status).

BEGIN;

ALTER TABLE public.graphify_runs
  ADD COLUMN IF NOT EXISTS source_manifest_source_count integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_runs'::regclass
      AND conname = 'graphify_runs_source_manifest_source_count_v3'
  ) THEN
    ALTER TABLE public.graphify_runs
      ADD CONSTRAINT graphify_runs_source_manifest_source_count_v3
      CHECK (source_manifest_source_count IS NULL OR source_manifest_source_count > 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS graphify_runs_manifest_completeness_idx_v3
  ON public.graphify_runs (workspace_revision, source_manifest_digest, source_manifest_source_count)
  WHERE workspace_revision IS NOT NULL
    AND source_manifest_digest IS NOT NULL
    AND source_manifest_source_count IS NOT NULL;

COMMENT ON COLUMN public.graphify_runs.source_manifest_source_count IS
  'Expected WorkspaceRevisionRecordV1 source count. A row is not a complete workspace proof until exact graphify_files readback agrees for the same run.';

COMMIT;
