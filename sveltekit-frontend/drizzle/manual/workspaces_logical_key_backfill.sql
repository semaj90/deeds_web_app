-- Workspaces logical_key backfill (2026-09-03)
--
-- Finding: audit-workspace-source-namespace-v1.mjs (LINEAGE-01) requires a column on
-- public.workspaces whose name matches /(^|_)(name|key|slug|identifier|code)($|_)/i and whose
-- value equals the logical workspace key configured in scripts/atlas/daily-graphify-config.json
-- ("legal-ai:deeds-web-app"). workspaces had no such column at all (only id, title, description,
-- case_id, created_by, created_at, updated_at) -- the config already asserts the logical key /
-- UUID binding, workspaces just had nowhere to hold it. See
-- openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md,
-- GRAPHIFY-LIFECYCLE-OWNER-01 section, 2026-09-03 entries, for the full trace.
--
-- Same table this repo already backfilled once before, same convention:
-- drizzle/manual/graphify_workspace_owner_backfill.sql (2026-08-29).
--
-- Idempotent: safe to re-run.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logical_key text;
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_logical_key_uq ON workspaces (logical_key) WHERE logical_key IS NOT NULL;

UPDATE workspaces
   SET logical_key = 'legal-ai:deeds-web-app'
 WHERE id = '625743d2-092b-4fa8-abe0-9dc094920c80'
   AND (logical_key IS NULL OR logical_key <> 'legal-ai:deeds-web-app');
