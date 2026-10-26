-- graphify_files: revision-scoped uniqueness (2026-10-22, PREPARED, NOT APPLIED)
--
-- Problem: graphify_files_code_source_revision_uq_v2 is UNIQUE (workspace_id, source_ref,
-- code_source_revision). A file whose bytes are unchanged across two workspace revisions
-- cannot have a second row for the new workspace revision, so an insert for that revision is
-- rejected instead of recording that the file was seen at that revision.
--
-- Change: replace the index with one that also includes the workspace revision. Existing rows
-- are not modified. Old rows keep their workspace_revision; new rows for another workspace
-- revision can now coexist with them.
--
-- NOT a validation: changing the key does not make an existing graphify row valid for a new
-- revision. New rows must still be inserted only after source-byte and Graphify evidence for
-- that revision is verified. This file only relaxes uniqueness.
--
-- Writer dependency: scripts/graphify or sveltekit-frontend/src/lib/server/atlas/indexing/
-- graphify-source-inventory-writer-v2.ts uses ON CONFLICT (workspace_id, source_ref,
-- code_source_revision) at line 521. That conflict target must move to the new expression key
-- in the same release, or that writer fails once the old index is dropped.
--
-- NULL handling: COALESCE(workspace_revision, '') keeps uniqueness strict when workspace_revision
-- is NULL, so the new index does not allow duplicate NULL-workspace rows that the old one blocked.
--
-- Apply with: psql -v ON_ERROR_STOP=1 -f drizzle/manual/graphify_files_revision_scoped_unique.sql
-- Rollback: the old index definition is recorded in the comment below. Recreate it with
-- CREATE UNIQUE INDEX graphify_files_code_source_revision_uq_v2 ON public.graphify_files
--   USING btree (workspace_id, source_ref, code_source_revision) WHERE (code_source_revision IS NOT NULL);
--
-- Pre-image (read 2026-10-22): index definition above; 26,014 graphify_files rows.

BEGIN;

DROP INDEX IF EXISTS graphify_files_code_source_revision_uq_v2;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_files_code_source_revision_uq_v3
  ON public.graphify_files (workspace_id, source_ref, code_source_revision, (COALESCE(workspace_revision, '')))
  WHERE code_source_revision IS NOT NULL;

-- Post-check: the new index exists and the old one is gone. Failure aborts the transaction.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'graphify_files_code_source_revision_uq_v3') THEN
    RAISE EXCEPTION 'GRAPHIFY_FILES_UQ_V3_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'graphify_files_code_source_revision_uq_v2') THEN
    RAISE EXCEPTION 'GRAPHIFY_FILES_UQ_V2_STILL_PRESENT';
  END IF;
END $$;

COMMIT;
