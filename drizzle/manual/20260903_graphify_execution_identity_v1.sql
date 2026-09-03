-- Graphify execution identity separation (DRAFT; apply only after the
-- disposable-DB contract test and explicit migration authorization pass).
-- workspace_revision remains snapshot identity; execution_id identifies one
-- attempt over that snapshot. Existing graphify_runs/file rows are preserved.

CREATE TABLE IF NOT EXISTS graphify_execution_receipts (
  execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES graphify_runs(run_id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  workspace_revision text,
  parser_contract_version text NOT NULL,
  extraction_contract_version text NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_manifest_digest text,
  source_manifest_source_count integer,
  environment jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT graphify_execution_receipts_workspace_revision_sha256
    CHECK (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT graphify_execution_receipts_source_manifest_digest_sha256
    CHECK (source_manifest_digest IS NULL OR source_manifest_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT graphify_execution_receipts_source_count_positive
    CHECK (source_manifest_source_count IS NULL OR source_manifest_source_count > 0),
  CONSTRAINT graphify_execution_receipts_terminal_time
    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'ABANDONED', 'SUPERSEDED')
      AND (status = 'RUNNING' OR completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS graphify_execution_receipts_snapshot_idx
  ON graphify_execution_receipts (workspace_id, workspace_revision,
                                  parser_contract_version, extraction_contract_version);

CREATE INDEX IF NOT EXISTS graphify_execution_receipts_status_started_idx
  ON graphify_execution_receipts (status, started_at DESC);

ALTER TABLE graphify_files
  ADD COLUMN IF NOT EXISTS execution_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graphify_files_execution_id_fkey'
      AND conrelid = 'graphify_files'::regclass
  ) THEN
    ALTER TABLE graphify_files
      ADD CONSTRAINT graphify_files_execution_id_fkey
      FOREIGN KEY (execution_id)
      REFERENCES graphify_execution_receipts(execution_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS graphify_files_execution_id_idx
  ON graphify_files (execution_id)
  WHERE execution_id IS NOT NULL;
