-- Parent Atlas Graphify revision-authority v2 extension.
-- Manual / intentionally unapplied migration.
--
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
--   * Creates only the two source-inventory tables when the historical base
--     migration was never applied.
--   * Does not create graphify_symbols / graphify_edges; this tranche owns
--     source inventory + revision authority only.
--   * No data backfill and no UPDATE / DELETE.
--   * Existing repository_revision/source_revision values are preserved.
--   * Existing rows are never promoted merely because the v2 columns exist.
--   * FANOUT remains blocked until the canonical writer commits one controlled
--     row and the independent read-only owner canary proves exact readback.

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
  -- Historical compatibility field. When historical rows use Git revisions,
  -- this column remains provenance and is not reinterpreted as byte identity.
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
      CHECK (
        workspace_revision IS NULL
        OR workspace_revision ~ '^sha256:[a-f0-9]{64}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_runs'::regclass
      AND conname = 'graphify_runs_source_manifest_digest_sha256_v2'
  ) THEN
    ALTER TABLE public.graphify_runs
      ADD CONSTRAINT graphify_runs_source_manifest_digest_sha256_v2
      CHECK (
        source_manifest_digest IS NULL
        OR source_manifest_digest ~ '^[a-f0-9]{64}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.graphify_files'::regclass
      AND conname = 'graphify_files_code_source_revision_sha256_v2'
  ) THEN
    ALTER TABLE public.graphify_files
      ADD CONSTRAINT graphify_files_code_source_revision_sha256_v2
      CHECK (
        code_source_revision IS NULL
        OR code_source_revision ~ '^sha256:[a-f0-9]{64}$'
      ) NOT VALID;
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

-- PostgreSQL default names for the historical inline UNIQUE constraints from
-- drizzle/001_graphify_lineage.sql. Removing uniqueness does not remove the
-- provenance columns or historical values. These old keys collapse distinct
-- dirty/untracked byte states that share one Git revision.
ALTER TABLE public.graphify_runs
  DROP CONSTRAINT IF EXISTS graphify_runs_workspace_id_repository_revision_parser_contract_version_key;

ALTER TABLE public.graphify_files
  DROP CONSTRAINT IF EXISTS graphify_files_workspace_id_source_ref_source_revision_key;

-- Canonical logical revision keys. Partial indexes deliberately exclude legacy
-- rows whose v2 authority fields remain NULL.
CREATE UNIQUE INDEX IF NOT EXISTS graphify_runs_workspace_revision_parser_uq_v2
  ON public.graphify_runs (workspace_id, workspace_revision, parser_contract_version)
  WHERE workspace_revision IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_files_code_source_revision_uq_v2
  ON public.graphify_files (workspace_id, source_ref, code_source_revision)
  WHERE code_source_revision IS NOT NULL;

-- Bounded lookup / reconciliation indexes.
CREATE INDEX IF NOT EXISTS graphify_runs_workspace_revision_idx_v2
  ON public.graphify_runs (workspace_id, workspace_revision)
  WHERE workspace_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_runs_source_manifest_digest_idx_v2
  ON public.graphify_runs (source_manifest_digest)
  WHERE source_manifest_digest IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_runs_repository_revision_provenance_idx_v2
  ON public.graphify_runs (workspace_id, repository_revision, started_at DESC);

CREATE INDEX IF NOT EXISTS graphify_runs_status_started_at_idx_v2
  ON public.graphify_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS graphify_files_source_ref_idx_v2
  ON public.graphify_files (workspace_id, source_ref);

CREATE INDEX IF NOT EXISTS graphify_files_legacy_source_revision_provenance_idx_v2
  ON public.graphify_files (workspace_id, source_ref, source_revision);

CREATE INDEX IF NOT EXISTS graphify_files_code_source_revision_idx_v2
  ON public.graphify_files (code_source_revision)
  WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_files_content_hash_idx_v2
  ON public.graphify_files (content_hash);

CREATE INDEX IF NOT EXISTS graphify_files_last_seen_run_id_idx_v2
  ON public.graphify_files (last_seen_run_id);

COMMENT ON COLUMN public.graphify_runs.repository_revision IS
  'Historical Git commit provenance. Never substitute this for logical Parent Atlas workspaceRevision.';

COMMENT ON COLUMN public.graphify_runs.workspace_revision IS
  'Parent Atlas WorkspaceRevisionRecordV1 identity: sha256 of the sorted exact-byte indexed source manifest.';

COMMENT ON COLUMN public.graphify_runs.source_manifest_digest IS
  'Unprefixed SHA-256 digest underlying workspace_revision.';

COMMENT ON COLUMN public.graphify_files.source_revision IS
  'Historical Git/file provenance coordinate retained for compatibility; not the Parent Atlas CodeSourceRevisionV1 owner.';

COMMENT ON COLUMN public.graphify_files.content_hash IS
  'Exact serialized source byte SHA-256 digest.';

COMMENT ON COLUMN public.graphify_files.code_source_revision IS
  'Parent Atlas CodeSourceRevisionV1 identity: sha256:<content_hash>.';

COMMIT;

-- Post-apply gate order (non-production proof DB only):
--   1. npx tsx scripts/atlas/prove-code-revision-owner-canary.mts
--      Expected: schema v2 present, writer present, persistedMatchingRows=0,
--      revisionOwnerProven=false.
--   2. npx tsx scripts/atlas/prove-graphify-source-inventory-writer-canary.mts
--      with ATLAS_GRAPHIFY_REVISION_CANARY=1. Default proof rolls back.
--   3. Only after review, set ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT=1 for one
--      controlled row in the intended non-production proof DB.
--   4. Rerun prove-code-revision-owner-canary.mts and require
--      REVISION_OWNER_PROVEN before FANOUT may consume the lineage as canonical.
