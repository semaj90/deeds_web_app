-- Graphify workspace owner backfill (2026-08-29)
--
-- Finding: all 5 live graphify_runs rows share workspace_id
-- 625743d2-092b-4fa8-abe0-9dc094920c80, but public.workspaces has zero rows and
-- graphify_runs.workspace_id / graphify_files.workspace_id carry no foreign key
-- against workspaces.id. Referenced by:
--   docs/reports/current-graphify-run-owner-v1.json
--   docs/reports/graphify-workspace-owner-v1.json
--   scripts/atlas/audit-graphify-workspace-owner-v1.mjs
--   scripts/atlas/audit-current-graphify-run-owner-v1.mjs
--
-- Idempotent: safe to re-run.

INSERT INTO workspaces (id, title, description, created_at, updated_at)
VALUES (
  '625743d2-092b-4fa8-abe0-9dc094920c80',
  'Graphify Default Workspace',
  'Backfilled owner for the workspace_id already in consistent use across every '
  || 'graphify_runs row as of 2026-08-29. Created to satisfy the graphify_runs / '
  || 'graphify_files NOT NULL workspace_id contract and to unblock the Parent Atlas '
  || 'workstation source-binding gate. See drizzle/manual/graphify_workspace_owner_backfill.sql.',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'graphify_runs_workspace_id_fkey'
  ) THEN
    ALTER TABLE graphify_runs
      ADD CONSTRAINT graphify_runs_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'graphify_files_workspace_id_fkey'
  ) THEN
    ALTER TABLE graphify_files
      ADD CONSTRAINT graphify_files_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
  END IF;
END $$;
