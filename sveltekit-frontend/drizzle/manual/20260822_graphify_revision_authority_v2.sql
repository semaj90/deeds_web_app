-- Parent Atlas Graphify revision-authority v2 extension.
-- Manual / intentionally unapplied migration.
--
-- STRICTLY ADDITIVE SAFETY POLICY
-- --------------------------------
-- This migration does not DROP, DELETE, UPDATE, TRUNCATE, rename, reinterpret,
-- or backfill any existing object or row.
--
-- Historical Graphify fields keep their original meanings:
--   graphify_runs.repository_revision = Git commit provenance
--   graphify_files.source_revision    = historical Git/file provenance
--   graphify_files.content_hash       = exact-byte SHA-256 when populated
--
-- Parent Atlas logical revision authority is stored in additive v2 surfaces:
--   graphify_runs.workspace_revision                    (compatibility column)
--   graphify_runs.source_manifest_digest                (compatibility column)
--   graphify_files.code_source_revision                 (compatibility column)
--   graphify_workspace_revisions_v2                     (append-only authority)
--   graphify_source_revisions_v2                        (append-only authority)
--
-- The v2 sidecar tables are the safe authority target when historical UNIQUE
-- constraints on graphify_runs/graphify_files would otherwise collapse dirty
-- or untracked byte states sharing the same Git revision.
--
-- FANOUT remains blocked until a controlled writer canary and independent
-- read-only owner proof agree on the same persisted v2 coordinates.

BEGIN;

-- Base source-inventory tables are created only when absent. Existing tables
-- and all existing rows/constraints are left untouched.
CREATE TABLE IF NOT EXISTS public.graphify_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  repository_revision text NOT NULL,
  base_revision text,
  parser_contract_version text NOT NULL DEFAULT 'graphify.parser.v0.1',
  extraction_contract_version text NOT NULL DEFAULT 'graphify.extractor.v0.1',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING',
  dry_run boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.graphify_files (
  file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  source_ref text NOT NULL,
  source_revision text,
  content_hash text NOT NULL,
  byte_length bigint NOT NULL,
  language text,
  parser_name text,
  parser_version text,
  parse_status text NOT NULL DEFAULT 'UNPROCESSED',
  parse_error jsonb,
  first_seen_run_id uuid NOT NULL REFERENCES public.graphify_runs(run_id) ON DELETE CASCADE,
  last_seen_run_id uuid NOT NULL REFERENCES public.graphify_runs(run_id) ON DELETE CASCADE
);

-- Compatibility columns are additive only. They are nullable so historical rows
-- are never promoted or rewritten implicitly.
ALTER TABLE public.graphify_runs
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_manifest_digest text;

ALTER TABLE public.graphify_files
  ADD COLUMN IF NOT EXISTS code_source_revision text;

-- Append-only logical workspace revision authority. This table intentionally
-- does not depend on the historical graphify_runs UNIQUE key.
CREATE TABLE IF NOT EXISTS public.graphify_workspace_revisions_v2 (
  workspace_revision text PRIMARY KEY,
  workspace_id uuid NOT NULL,
  source_manifest_digest text NOT NULL,
  repository_revision text NOT NULL,
  repository_revision_role text NOT NULL DEFAULT 'GIT_PROVENANCE_ONLY',
  parser_contract_version text NOT NULL,
  extraction_contract_version text NOT NULL,
  source_count bigint NOT NULL,
  producer_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (source_manifest_digest ~ '^[a-f0-9]{64}$'),
  CHECK (workspace_revision = 'sha256:' || source_manifest_digest),
  CHECK (source_count >= 0),
  CHECK (repository_revision_role = 'GIT_PROVENANCE_ONLY')
);

-- Append-only exact source-byte revision authority. A dirty or untracked file
-- may therefore receive a new code_source_revision without changing or
-- conflicting with legacy graphify_files.source_revision uniqueness.
CREATE TABLE IF NOT EXISTS public.graphify_source_revisions_v2 (
  workspace_revision text NOT NULL REFERENCES public.graphify_workspace_revisions_v2(workspace_revision) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  source_ref text NOT NULL,
  code_source_revision text NOT NULL,
  content_hash text NOT NULL,
  byte_length bigint NOT NULL,
  repository_revision text NOT NULL,
  repository_revision_role text NOT NULL DEFAULT 'GIT_PROVENANCE_ONLY',
  legacy_file_id uuid,
  producer_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_revision, source_ref, code_source_revision),
  CHECK (code_source_revision ~ '^sha256:[a-f0-9]{64}$'),
  CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CHECK (code_source_revision = 'sha256:' || content_hash),
  CHECK (byte_length >= 0),
  CHECK (repository_revision_role = 'GIT_PROVENANCE_ONLY')
);

-- Additive validation constraints on compatibility columns. NOT VALID avoids a
-- historical-table scan for existing rows; new/changed rows must satisfy them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_runs'::regclass
      AND conname = 'graphify_runs_workspace_revision_sha256_v2'
  ) THEN
    ALTER TABLE public.graphify_runs
      ADD CONSTRAINT graphify_runs_workspace_revision_sha256_v2
      CHECK (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[a-f0-9]{64}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_runs'::regclass
      AND conname = 'graphify_runs_source_manifest_digest_sha256_v2'
  ) THEN
    ALTER TABLE public.graphify_runs
      ADD CONSTRAINT graphify_runs_source_manifest_digest_sha256_v2
      CHECK (source_manifest_digest IS NULL OR source_manifest_digest ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_files'::regclass
      AND conname = 'graphify_files_code_source_revision_sha256_v2'
  ) THEN
    ALTER TABLE public.graphify_files
      ADD CONSTRAINT graphify_files_code_source_revision_sha256_v2
      CHECK (code_source_revision IS NULL OR code_source_revision ~ '^sha256:[a-f0-9]{64}$') NOT VALID;
  END IF;
END $$;

-- Additive indexes only. No existing index or constraint is dropped.
CREATE UNIQUE INDEX IF NOT EXISTS graphify_runs_workspace_revision_parser_uq_v2
  ON public.graphify_runs (workspace_id, workspace_revision, parser_contract_version)
  WHERE workspace_revision IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_files_code_source_revision_uq_v2
  ON public.graphify_files (workspace_id, source_ref, code_source_revision)
  WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_runs_repository_revision_provenance_idx_v2
  ON public.graphify_runs (workspace_id, repository_revision, started_at DESC);

CREATE INDEX IF NOT EXISTS graphify_runs_workspace_revision_idx_v2
  ON public.graphify_runs (workspace_id, workspace_revision)
  WHERE workspace_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_files_source_ref_idx_v2
  ON public.graphify_files (workspace_id, source_ref);

CREATE INDEX IF NOT EXISTS graphify_files_code_source_revision_idx_v2
  ON public.graphify_files (code_source_revision)
  WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_files_content_hash_idx_v2
  ON public.graphify_files (content_hash);

CREATE INDEX IF NOT EXISTS graphify_files_last_seen_run_id_idx_v2
  ON public.graphify_files (last_seen_run_id);

CREATE INDEX IF NOT EXISTS graphify_workspace_revisions_v2_workspace_idx
  ON public.graphify_workspace_revisions_v2 (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS graphify_workspace_revisions_v2_git_provenance_idx
  ON public.graphify_workspace_revisions_v2 (workspace_id, repository_revision, created_at DESC);

CREATE INDEX IF NOT EXISTS graphify_source_revisions_v2_source_idx
  ON public.graphify_source_revisions_v2 (workspace_id, source_ref, created_at DESC);

CREATE INDEX IF NOT EXISTS graphify_source_revisions_v2_code_revision_idx
  ON public.graphify_source_revisions_v2 (code_source_revision);

CREATE INDEX IF NOT EXISTS graphify_source_revisions_v2_content_hash_idx
  ON public.graphify_source_revisions_v2 (content_hash);

COMMIT;

-- Required post-apply gate order (non-production proof DB only):
--   1. Verify all four tables/three compatibility columns exist.
--   2. Verify no legacy constraint/index was removed.
--   3. Run the writer canary with rollback-only semantics.
--   4. Review exact readback receipt.
--   5. Only with explicit opt-in, commit one v2 authority row.
--   6. Independent read-only owner proof must return REVISION_OWNER_PROVEN.
--   7. Only then may FANOUT consume v2 lineage as canonical.
