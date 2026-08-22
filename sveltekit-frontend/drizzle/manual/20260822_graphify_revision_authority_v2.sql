-- Parent Atlas Graphify revision-authority v2 extension.
--
-- Historical Graphify columns retain their original meanings:
--   graphify_runs.repository_revision = Git commit provenance
--   graphify_files.source_revision    = historical Git/file provenance
--   graphify_files.content_hash       = exact-byte SHA-256 digest
--
-- Current Parent Atlas logical revisions are additive and first-class:
--   graphify_runs.workspace_revision   = sha256:<sorted exact-byte source manifest>
--   graphify_files.code_source_revision = sha256:<content_hash>
--
-- No historical row is backfilled or reinterpreted by this migration.

ALTER TABLE graphify_runs
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_manifest_digest text;

ALTER TABLE graphify_files
  ADD COLUMN IF NOT EXISTS code_source_revision text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graphify_runs_workspace_revision_sha256_v2'
  ) THEN
    ALTER TABLE graphify_runs
      ADD CONSTRAINT graphify_runs_workspace_revision_sha256_v2
      CHECK (
        workspace_revision IS NULL
        OR workspace_revision ~ '^sha256:[a-f0-9]{64}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graphify_runs_source_manifest_digest_sha256_v2'
  ) THEN
    ALTER TABLE graphify_runs
      ADD CONSTRAINT graphify_runs_source_manifest_digest_sha256_v2
      CHECK (
        source_manifest_digest IS NULL
        OR source_manifest_digest ~ '^[a-f0-9]{64}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graphify_files_code_source_revision_sha256_v2'
  ) THEN
    ALTER TABLE graphify_files
      ADD CONSTRAINT graphify_files_code_source_revision_sha256_v2
      CHECK (
        code_source_revision IS NULL
        OR code_source_revision ~ '^sha256:[a-f0-9]{64}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_runs_workspace_revision_parser_uq_v2
  ON graphify_runs (workspace_id, workspace_revision, parser_contract_version)
  WHERE workspace_revision IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_files_code_source_revision_uq_v2
  ON graphify_files (workspace_id, source_ref, code_source_revision)
  WHERE code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_files_code_source_revision_idx_v2
  ON graphify_files (code_source_revision)
  WHERE code_source_revision IS NOT NULL;

COMMENT ON COLUMN graphify_runs.repository_revision IS
  'Historical Git commit provenance. Never substitute this for logical Parent Atlas workspaceRevision.';

COMMENT ON COLUMN graphify_runs.workspace_revision IS
  'Parent Atlas WorkspaceRevisionRecordV1 identity: sha256 of the sorted exact-byte indexed source manifest.';

COMMENT ON COLUMN graphify_runs.source_manifest_digest IS
  'Unprefixed SHA-256 digest underlying workspace_revision.';

COMMENT ON COLUMN graphify_files.source_revision IS
  'Historical Git/file provenance coordinate retained for compatibility; not the Parent Atlas CodeSourceRevisionV1 owner.';

COMMENT ON COLUMN graphify_files.content_hash IS
  'Exact serialized source byte SHA-256 digest.';

COMMENT ON COLUMN graphify_files.code_source_revision IS
  'Parent Atlas CodeSourceRevisionV1 identity: sha256:<content_hash>.';
