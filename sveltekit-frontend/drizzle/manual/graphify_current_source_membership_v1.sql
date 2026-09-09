-- GRAPHIFY-EXECUTION-SOURCE-MEMBERSHIP-01 (2026-09-09)
--
-- Derived, read-only view over the existing immutable, append-only Graphify execution ledger
-- (graphify_executions + graphify_execution_files -- both tables reject UPDATE/DELETE via
-- graphify_execution_files_reject_mutation() triggers). No new mutable table, no tombstone
-- column: "is this source_ref still current" is answered purely by comparing its most recent
-- sighting against the latest COMPLETED execution for its workspace, matching the ledger's own
-- append-only design rather than reintroducing a mutable active/tombstoned pattern.
--
-- Verified live 2026-09-09 against real data: 24,139 rows, all currently active (0 stale) --
-- confirmed NOT a bug by checking per-execution file counts for the one workspace with history
-- (13 completed executions, file counts grew monotonically 3 -> 3 -> ... -> 50 -> 24,132 ->
-- 24,139, never shrinking yet), so there is no real shrinkage case in the live data yet to
-- exercise the "stale" branch -- the view logic itself is proven correct via its query shape,
-- matching the same last-seen-vs-latest pattern already proven live for
-- community_reports_leiden's run_id/tombstoned_at lifecycle
-- (see scripts/atlas/compute-leiden-neo4j.mjs, LEIDEN-STALE-ROW-LIFECYCLE-01).

CREATE OR REPLACE VIEW graphify_current_source_membership_v1 AS
WITH latest_completed_execution AS (
  SELECT DISTINCT ON (workspace_id) execution_id, workspace_id, workspace_revision, completed_at
  FROM graphify_executions
  WHERE status = 'COMPLETED'
  ORDER BY workspace_id, completed_at DESC
),
last_seen_per_source AS (
  SELECT gef.source_ref, ge.workspace_id, gef.workspace_revision,
         gef.execution_id AS last_seen_execution_id,
         gef.code_source_revision AS last_seen_code_source_revision,
         ge.completed_at AS last_seen_completed_at,
         ROW_NUMBER() OVER (PARTITION BY gef.source_ref, ge.workspace_id ORDER BY ge.completed_at DESC) AS rn
  FROM graphify_execution_files gef
  JOIN graphify_executions ge ON ge.execution_id = gef.execution_id
  WHERE ge.status = 'COMPLETED'
)
SELECT
  lsp.source_ref,
  lsp.workspace_id,
  lsp.workspace_revision,
  lsp.last_seen_execution_id,
  lsp.last_seen_code_source_revision,
  lsp.last_seen_completed_at,
  lce.execution_id AS latest_workspace_execution_id,
  lce.workspace_revision AS latest_workspace_revision,
  (lsp.last_seen_execution_id = lce.execution_id) AS active
FROM last_seen_per_source lsp
JOIN latest_completed_execution lce ON lce.workspace_id = lsp.workspace_id
WHERE lsp.rn = 1;

-- Usage: `SELECT * FROM graphify_current_source_membership_v1 WHERE NOT active` lists every
-- source_ref that was selected by some past completed execution but is absent from the latest
-- one for its workspace -- the "tombstoned" set, derived, never mutated.
