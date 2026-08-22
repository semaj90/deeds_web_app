-- Manual / intentionally unapplied migration.
--
-- Purpose:
--   Establish the durable Graphify source-inventory schema required by
--   CodeRevisionAuthorityV1 without reinterpreting historical Git-oriented
--   source_revision values as exact source-byte authority.
--
-- Safety:
--   * No data backfill.
--   * No UPDATE/DELETE.
--   * Existing legacy source_revision values are preserved verbatim.
--   * repository_revision remains Git provenance only.
--   * workspace_revision and code_source_revision are the new logical
--     revision coordinates.
--   * FANOUT must remain blocked until the read-only canary proves an exact
--     persisted row produced by the canonical writer.

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
    -- Historical / compatibility field. Do not reinterpret this column as
    -- CodeRevisionAuthorityV1 when existing rows contain Git revisions.
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

-- Logical revision authority v2. These columns are nullable during migration so
-- legacy rows are not silently promoted. Only the canonical source-inventory
-- writer may populate them for newly materialized lineage.
ALTER TABLE public.graphify_runs
    ADD COLUMN IF NOT EXISTS workspace_revision text,
    ADD COLUMN IF NOT EXISTS source_manifest_digest text;

ALTER TABLE public.graphify_files
    ADD COLUMN IF NOT EXISTS code_source_revision text;

-- Fail malformed new authority values while allowing pre-v2 rows to remain
-- unpromoted. NOT VALID avoids rewriting historical rows during this manual
-- schema tranche; a later controlled migration may VALIDATE after a census.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.graphify_runs'::regclass
          AND conname = 'graphify_runs_workspace_revision_sha256_ck'
    ) THEN
        ALTER TABLE public.graphify_runs
            ADD CONSTRAINT graphify_runs_workspace_revision_sha256_ck
            CHECK (
                workspace_revision IS NULL
                OR workspace_revision ~ '^sha256:[a-f0-9]{64}$'
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.graphify_runs'::regclass
          AND conname = 'graphify_runs_source_manifest_digest_sha256_ck'
    ) THEN
        ALTER TABLE public.graphify_runs
            ADD CONSTRAINT graphify_runs_source_manifest_digest_sha256_ck
            CHECK (
                source_manifest_digest IS NULL
                OR source_manifest_digest ~ '^[a-f0-9]{64}$'
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.graphify_files'::regclass
          AND conname = 'graphify_files_code_source_revision_sha256_ck'
    ) THEN
        ALTER TABLE public.graphify_files
            ADD CONSTRAINT graphify_files_code_source_revision_sha256_ck
            CHECK (
                code_source_revision IS NULL
                OR code_source_revision ~ '^sha256:[a-f0-9]{64}$'
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.graphify_files'::regclass
          AND conname = 'graphify_files_content_hash_sha256_ck'
    ) THEN
        ALTER TABLE public.graphify_files
            ADD CONSTRAINT graphify_files_content_hash_sha256_ck
            CHECK (content_hash ~ '^(sha256:)?[a-f0-9]{64}$') NOT VALID;
    END IF;
END $$;

-- Run lookup: exact logical workspace snapshot first, Git provenance remains a
-- separate filter/tie-breaker rather than the identity coordinate.
CREATE INDEX IF NOT EXISTS idx_graphify_runs_workspace_revision
    ON public.graphify_runs (workspace_id, workspace_revision)
    WHERE workspace_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graphify_runs_source_manifest_digest
    ON public.graphify_runs (source_manifest_digest)
    WHERE source_manifest_digest IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graphify_runs_repository_revision
    ON public.graphify_runs (workspace_id, repository_revision);

CREATE INDEX IF NOT EXISTS idx_graphify_runs_status_started_at
    ON public.graphify_runs (status, started_at DESC);

-- Source lookup: code_source_revision is the exact source-byte coordinate.
-- The partial UNIQUE index prevents duplicate canonical file-revision rows
-- without constraining legacy rows whose logical revision is still NULL.
CREATE UNIQUE INDEX IF NOT EXISTS ux_graphify_files_workspace_source_code_revision
    ON public.graphify_files (workspace_id, source_ref, code_source_revision)
    WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graphify_files_source_ref
    ON public.graphify_files (workspace_id, source_ref);

CREATE INDEX IF NOT EXISTS idx_graphify_files_code_source_revision
    ON public.graphify_files (code_source_revision)
    WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graphify_files_content_hash
    ON public.graphify_files (content_hash);

CREATE INDEX IF NOT EXISTS idx_graphify_files_last_seen_run_id
    ON public.graphify_files (last_seen_run_id);

COMMIT;

-- Post-apply acceptance is intentionally external to this migration:
--   npx tsx scripts/atlas/prove-code-revision-owner-canary.mts
--
-- Expected immediately after schema-only application, before writer binding:
--   logicalWorkspaceRevisionColumnsPresent = true
--   logicalCodeSourceRevisionColumnPresent  = true
--   productionWriterPresent                = false
--   persistedMatchingRows                  = 0
--   revisionOwnerProven                    = false
--   fanoutMayConsumeAsCanonical            = false
