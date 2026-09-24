-- SUPERSEDED — DO NOT APPLY THIS FILE. The canonical definition already exists and already reads
-- graphify_execution_file_membership_v2: sveltekit-frontend/drizzle/manual/graphify_current_source_membership_v1.sql
-- (GRAPHIFY-EXECUTION-SOURCE-MEMBERSHIP-01, commit 9d525dd2ae, 2026-09-09). The LIVE database view
-- drifted from that checked-in migration (it reads the legacy graphify_execution_files table), so the
-- fix is to re-apply the canonical file, with the same authorization. That file also settles the
-- semantics: "current" = last seen in the latest COMPLETED execution for the workspace.
-- Kept only as the 2026-09-24 audit record (archive-not-delete).
--
-- DRAFT — NOT APPLIED. Requires explicit operator authorization before execution.
-- Status: GRAPHIFY_CURRENT_SOURCE_MEMBERSHIP_V1_DDL_APPLY_AUTHORIZATION_REQUIRED
--
-- Defect (found 2026-09-24, read-only): graphify_current_source_membership_v1 reads the legacy
-- graphify_execution_files table, which stopped being written after execution 8bd073a7
-- (2026-09-09). Every later COMPLETED execution — including canonical 74d50c86 — has 0 rows
-- there, so the view reports 0 `active` sources. graphify_execution_file_membership_v2 carries
-- all 36 executions (a superset: 8bd073a7 has the same 24,139 rows in both tables).
--
-- Change: identical view name, columns, types, order and semantics; only the per-file source
-- table changes. CREATE OR REPLACE VIEW keeps dependants intact because the column list is
-- unchanged. No new authority surface is created.
--
-- Read-only proof of the new body (run as a plain SELECT, 2026-09-24): 25,545 rows,
-- 25,542 active, latest completed execution 0dba1c0d (same workspace revision as 74d50c86).
-- Semantics note (unchanged, flagged): "active" means last seen in the LATEST COMPLETED
-- execution for the workspace, not the execution flagged canonical_authority.
--
-- Rollback: re-run the previous definition (identical text with graphify_execution_files).

SET lock_timeout = '5s';
BEGIN;

CREATE OR REPLACE VIEW public.graphify_current_source_membership_v1 AS
WITH latest_completed_execution AS (
  SELECT DISTINCT ON (graphify_executions.workspace_id)
         graphify_executions.execution_id,
         graphify_executions.workspace_id,
         graphify_executions.workspace_revision,
         graphify_executions.completed_at
    FROM graphify_executions
   WHERE graphify_executions.status = 'COMPLETED'::text
   ORDER BY graphify_executions.workspace_id, graphify_executions.completed_at DESC
), last_seen_per_source AS (
  SELECT gef.source_ref,
         ge.workspace_id,
         gef.workspace_revision,
         gef.execution_id AS last_seen_execution_id,
         gef.code_source_revision AS last_seen_code_source_revision,
         ge.completed_at AS last_seen_completed_at,
         row_number() OVER (PARTITION BY gef.source_ref, ge.workspace_id ORDER BY ge.completed_at DESC) AS rn
    FROM graphify_execution_file_membership_v2 gef
    JOIN graphify_executions ge ON ge.execution_id = gef.execution_id
   WHERE ge.status = 'COMPLETED'::text
)
SELECT lsp.source_ref,
       lsp.workspace_id,
       lsp.workspace_revision,
       lsp.last_seen_execution_id,
       lsp.last_seen_code_source_revision,
       lsp.last_seen_completed_at,
       lce.execution_id AS latest_workspace_execution_id,
       lce.workspace_revision AS latest_workspace_revision,
       lsp.last_seen_execution_id = lce.execution_id AS active
  FROM last_seen_per_source lsp
  JOIN latest_completed_execution lce ON lce.workspace_id = lsp.workspace_id
 WHERE lsp.rn = 1;

COMMIT;
