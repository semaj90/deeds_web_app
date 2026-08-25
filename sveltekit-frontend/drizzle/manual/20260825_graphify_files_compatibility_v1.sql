-- Parent Atlas Graphify legacy-table compatibility candidate.
--
-- This migration is intentionally unapplied. It only adds nullable lineage
-- columns and indexes to the existing legacy table. It never rewrites rows,
-- assigns fabricated revisions, drops constraints, or changes ownership.
-- A separate read-only preflight must prove the table shape and row policy
-- before an operator applies it.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.graphify_files') IS NULL THEN
    RAISE EXCEPTION 'GRAPHIFY_FILES_COMPATIBILITY_REQUIRES_EXISTING_TABLE';
  END IF;
END
$$;

ALTER TABLE public.graphify_files
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_revision_authority text,
  ADD COLUMN IF NOT EXISTS producer_revision text,
  ADD COLUMN IF NOT EXISTS git_blob_oid text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_files'::regclass
      AND conname = 'graphify_files_source_revision_authority_compat_v1'
  ) THEN
    ALTER TABLE public.graphify_files
      ADD CONSTRAINT graphify_files_source_revision_authority_compat_v1
      CHECK (
        source_revision_authority IS NULL
        OR source_revision_authority IN ('source_revision', 'content_hash')
      ) NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS graphify_files_workspace_source_compat_v1
  ON public.graphify_files (workspace_revision, source_ref)
  WHERE workspace_revision IS NOT NULL;
CREATE INDEX IF NOT EXISTS graphify_files_code_source_revision_compat_v1
  ON public.graphify_files (code_source_revision)
  WHERE code_source_revision IS NOT NULL;

COMMENT ON COLUMN public.graphify_files.workspace_revision IS
  'Nullable until an exact source-inventory backfill is separately approved.';
COMMENT ON COLUMN public.graphify_files.source_revision_authority IS
  'Provenance selector; NULL means legacy row not yet classified.';
COMMENT ON COLUMN public.graphify_files.producer_revision IS
  'Extractor/materializer revision; nullable for legacy rows.';

COMMIT;
