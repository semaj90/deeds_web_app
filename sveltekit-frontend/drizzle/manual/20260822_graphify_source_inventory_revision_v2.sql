-- Parent Atlas Graphify source-inventory revision convergence.
--
-- Existing columns keep their historical semantics:
--   workspace_revision = legacy Git/repository provenance from the v1 writer
--   source_revision    = legacy Git/file provenance
--   content_hash       = exact byte SHA-256
--
-- New first-class logical revision columns avoid reinterpreting existing rows:
--   workspace_manifest_revision = WorkspaceRevisionRecordV1.workspaceRevision
--   code_source_revision         = CodeSourceRevisionV1.sourceRevision
--   repository_revision          = explicit Git provenance for new rows
--
-- Manual migration only. It performs no backfill and authorizes no Qdrant or
-- graph promotion.

ALTER TABLE graphify_files
  ADD COLUMN IF NOT EXISTS workspace_manifest_revision text,
  ADD COLUMN IF NOT EXISTS code_source_revision text,
  ADD COLUMN IF NOT EXISTS repository_revision text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'graphify_files_workspace_manifest_revision_sha256_v2') THEN
    ALTER TABLE graphify_files ADD CONSTRAINT graphify_files_workspace_manifest_revision_sha256_v2
      CHECK (workspace_manifest_revision IS NULL OR workspace_manifest_revision ~ '^sha256:[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'graphify_files_code_source_revision_sha256_v2') THEN
    ALTER TABLE graphify_files ADD CONSTRAINT graphify_files_code_source_revision_sha256_v2
      CHECK (code_source_revision IS NULL OR code_source_revision ~ '^sha256:[a-f0-9]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS graphify_files_manifest_source_revision_uq_v2
  ON graphify_files (workspace_manifest_revision, source_ref, code_source_revision)
  WHERE workspace_manifest_revision IS NOT NULL AND code_source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_files_manifest_source_idx_v2
  ON graphify_files (workspace_manifest_revision, source_ref)
  WHERE workspace_manifest_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS graphify_files_code_source_revision_idx_v2
  ON graphify_files (code_source_revision)
  WHERE code_source_revision IS NOT NULL;

COMMENT ON COLUMN graphify_files.workspace_revision IS
  'Legacy v1 repository/Git provenance field. Do not use as WorkspaceRevisionRecordV1 authority.';
COMMENT ON COLUMN graphify_files.workspace_manifest_revision IS
  'Canonical WorkspaceRevisionRecordV1 identity: sha256 of sorted exact indexed source-byte manifest.';
COMMENT ON COLUMN graphify_files.repository_revision IS
  'Explicit Git commit provenance for v2 writes; never canonical workspace world-state identity.';
COMMENT ON COLUMN graphify_files.source_revision IS
  'Legacy Git/file provenance coordinate retained for compatibility.';
COMMENT ON COLUMN graphify_files.content_hash IS
  'Exact source-byte SHA-256 digest without sha256: prefix.';
COMMENT ON COLUMN graphify_files.code_source_revision IS
  'Canonical CodeSourceRevisionV1 identity: sha256:<content_hash>.';
