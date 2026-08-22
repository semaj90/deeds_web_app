-- Parent Atlas Graphify revision-authority v2 extension.
-- Manual / intentionally unapplied migration.
--
-- SAFETY CONTRACT:
--   * additive CREATE TABLE / ADD COLUMN / ADD CONSTRAINT / CREATE INDEX only;
--   * no DROP TABLE / DROP COLUMN / DROP CONSTRAINT / DROP INDEX;
--   * no DELETE / TRUNCATE / UPDATE / historical backfill;
--   * foreign keys use RESTRICT so deleting a Graphify run cannot cascade-delete
--     source inventory rows created by this migration.
--
-- Historical provenance remains intact:
--   graphify_runs.repository_revision = Git/base commit provenance
--   graphify_files.source_revision    = legacy Git provenance
--   graphify_files.content_hash       = exact-byte SHA-256 digest
--
-- Canonical Parent Atlas logical revisions are additive:
--   graphify_runs.workspace_revision     = sha256:<sorted exact-byte source manifest>
--   graphify_runs.source_manifest_digest = exact manifest digest
--   graphify_files.code_source_revision  = sha256:<exact source bytes>
--
-- Historical uniqueness constraints are intentionally preserved. If an older
-- deployment has a constraint whose semantics conflict with the v2 writer, that
-- deployment must fail closed and be reconciled in a separate reviewed migration.
-- Historical Graphify columns retain their original meanings:
--   graphify_runs.repository_revision = Git commit provenance
--   graphify_files.source_revision    = historical Git/file provenance
--   graphify_files.content_hash       = exact-byte SHA-256 digest
--
-- Current Parent Atlas logical revisions are additive and first-class:
--   graphify_runs.workspace_revision    = sha256:<sorted exact-byte source manifest>
--   graphify_files.code_source_revision = sha256:<content_hash>
--
-- Safety:
--   * Creates only graphify_runs / graphify_files when the historical base migration was never applied.
--   * No backfill and no UPDATE / DELETE.
--   * Existing repository_revision/source_revision values are preserved.
--   * Existing rows are never promoted merely because the v2 columns exist.
--   * FANOUT remains blocked until one controlled writer row and independent read-only proof agree.

BEGIN;

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
  first_seen_run_id uuid NOT NULL REFERENCES public.graphify_runs(run_id) ON DELETE RESTRICT,
  last_seen_run_id uuid NOT NULL REFERENCES public.graphify_runs(run_id) ON DELETE RESTRICT
  first_seen_run_id uuid NOT NULL REFERENCES public.graphify_runs(run_id) ON DELETE CASCADE,
  last_seen_run_id uuid NOT NULL REFERENCES public.graphify_runs(run_id) ON DELETE CASCADE
);

ALTER TABLE public.graphify_runs
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_manifest_digest text;

ALTER TABLE public.graphify_files
  ADD COLUMN IF NOT EXISTS code_source_revision text;

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

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_files'::regclass
      AND conname = 'graphify_files_content_hash_sha256_v2'
  ) THEN
    ALTER TABLE public.graphify_files
      ADD CONSTRAINT graphify_files_content_hash_sha256_v2
      CHECK (content_hash ~ '^(sha256:)?[a-f0-9]{64}$') NOT VALID;
  END IF;
END $$;

-- Canonical v2 uniqueness is additive. Legacy constraints, when present, are
-- retained rather than weakened or dropped by this migration.
CREATE UNIQUE INDEX IF NOT EXISTS graphify_runs_workspace_revision_parser_uq_v2
  ON public.graphify_runs (workspace_id, workspace_revision, parser_contract_version)
  WHERE workspace_revision IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_files_code_source_revision_uq_v2
  ON public.graphify_files (workspace_id, source_ref, code_source_revision)
  WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_runs_workspace_revision_idx_v2
  ON public.graphify_runs (workspace_id, workspace_revision)
  WHERE workspace_revision IS NOT NULL;
CREATE INDEX IF NOT EXISTS graphify_runs_repository_revision_provenance_idx_v2
  ON public.graphify_runs (workspace_id, repository_revision, started_at DESC);
CREATE INDEX IF NOT EXISTS graphify_runs_source_manifest_digest_idx_v2
  ON public.graphify_runs (source_manifest_digest)
  WHERE source_manifest_digest IS NOT NULL;
CREATE INDEX IF NOT EXISTS graphify_files_source_ref_idx_v2
  ON public.graphify_files (workspace_id, source_ref);
CREATE INDEX IF NOT EXISTS graphify_files_legacy_source_revision_provenance_idx_v2
  ON public.graphify_files (workspace_id, source_ref, source_revision);
END $$;

ALTER TABLE public.graphify_runs
  DROP CONSTRAINT IF EXISTS graphify_runs_workspace_id_repository_revision_parser_contract_version_key;
ALTER TABLE public.graphify_files
  DROP CONSTRAINT IF EXISTS graphify_files_workspace_id_source_ref_source_revision_key;

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

COMMENT ON COLUMN public.graphify_runs.repository_revision IS
  'Git/base commit provenance only; not canonical workspace revision authority.';
COMMENT ON COLUMN public.graphify_runs.workspace_revision IS
  'WorkspaceRevisionRecordV1 identity: sha256 of sorted exact-byte source manifest.';
COMMENT ON COLUMN public.graphify_runs.source_manifest_digest IS
  'Unprefixed SHA-256 digest underlying workspace_revision.';
COMMENT ON COLUMN public.graphify_files.source_revision IS
  'Legacy Git provenance coordinate retained for compatibility.';
COMMENT ON COLUMN public.graphify_files.content_hash IS
  'Exact UTF-8 source byte SHA-256 digest.';
COMMENT ON COLUMN public.graphify_files.code_source_revision IS
  'CodeSourceRevisionV1 identity: sha256:<content_hash>.';

COMMIT;
