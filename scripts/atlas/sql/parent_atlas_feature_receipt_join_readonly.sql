-- Parent Atlas: read-only task/feature/receipt relationship diagnostic.
-- Source contracts reviewed: kanban-task-board.ts, kanban-tasks.ts,
-- openspec-task-source-index.ts and feature-resolution-v1.ts.
-- DOES NOT create, update, or delete anything. No claims of canonical promotion.
-- Run with an existing authorized READ-ONLY PostgreSQL 18 connection, e.g.:
--   psql 'service=atlas_pg18_readonly' -X -v ON_ERROR_STOP=1 \
--     -f parent_atlas_feature_receipt_join_readonly.sql
-- The named service is an example; do not substitute production admin credentials.

\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';

\echo '=== Database identity and relevant table existence ==='
SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('server_version_num')::integer AS version_num;
SELECT name, to_regclass('public.' || name) AS live_relation
FROM (VALUES ('kanban_tasks'), ('kanban_task_attempts'),
             ('atlas_test_execution_receipts'),
             ('atlas_receipt_verifier_results_v1'),
             ('openspec_task_source_index_v1'),
             ('openspec_task_source_snapshots_v1'),
             ('feature_registry'), ('atlas_feature_labels')) AS tab(name);

\echo '=== Kanban attempt -> execution receipt -> independent verifier ==='
-- Zero or low counts are diagnostics. The source completion gate has additional
-- requirements (active task/current run/current source revision).
WITH joined AS (
  SELECT a.id AS attempt_id, a.task_id, a.run_id, a.success,
         a.execution_receipt_id,
         t.task_id IS NOT NULL AS task_exists,
         (r.execution_receipt_id IS NOT NULL) AS receipt_exists,
         COALESCE(r.status = 'passed' AND a.success
              AND r.run_revision = a.run_id
              AND t.source_revision IS NOT NULL
              AND r.source_revision = t.source_revision
              AND jsonb_typeof(t.source_refs) = 'array'
              AND t.source_refs ? r.source_ref, false) AS exact_run_source_match,
         EXISTS (
           SELECT 1 FROM public.atlas_receipt_verifier_results_v1 v
           WHERE v.execution_receipt_id = r.execution_receipt_id
             AND v.verification_status = 'VERIFIED_PASS'
             AND v.evidence_resolved = true
             AND v.computed_digest = 'sha256:' || r.report_checksum
         ) AS independently_verified
  FROM public.kanban_task_attempts a
  LEFT JOIN public.kanban_tasks t ON t.task_id = a.task_id
  LEFT JOIN public.atlas_test_execution_receipts r
    ON r.execution_receipt_id = a.execution_receipt_id
)
SELECT count(*) AS total_attempts,
       count(*) FILTER (WHERE execution_receipt_id IS NOT NULL) AS attempts_with_receipt_ref,
       count(*) FILTER (WHERE task_exists AND receipt_exists) AS linked_to_task_and_receipt,
       count(*) FILTER (WHERE exact_run_source_match) AS exact_run_source_matches,
       count(*) FILTER (WHERE exact_run_source_match AND independently_verified)
         AS verified_chain_candidates
FROM joined;

\echo '=== Latest indexed OpenSpec snapshot (open tasks only) ==='
SELECT snapshot_id, created_at, source_row_count, workspace_revision,
       input_checksum, snapshot_status
FROM public.openspec_task_source_snapshots_v1
WHERE snapshot_status = 'COMPLETE'
ORDER BY created_at DESC, snapshot_id DESC LIMIT 3;

\echo '=== Candidate identity/source matches against Kanban (not authoritative) ==='
-- The index contains only OPEN task observations. It contains NO source revision,
-- and canonical_task_key_candidate is explicitly non-authoritative.
WITH latest AS (
  SELECT snapshot_id FROM public.openspec_task_source_snapshots_v1
  WHERE snapshot_status = 'COMPLETE'
  ORDER BY created_at DESC, snapshot_id DESC LIMIT 1
), observations AS (
  SELECT i.source_ref, i.change_id, i.task_hash, i.identity_status,
         i.canonical_task_key_candidate
  FROM public.openspec_task_source_index_v1 i
  JOIN latest s USING (snapshot_id)
), matches AS (
  SELECT o.*,
    EXISTS (
      SELECT 1 FROM public.kanban_tasks k
      WHERE k.task_id = o.canonical_task_key_candidate
        AND k.feature_id = 'openspec:' || o.change_id
    ) AS candidate_key_hit,
    EXISTS (
      SELECT 1 FROM public.kanban_tasks k
      WHERE k.feature_id = 'openspec:' || o.change_id
        AND jsonb_typeof(k.source_refs) = 'array'
        AND k.source_refs ? o.source_ref
    ) AS exact_source_ref_hit,
    EXISTS (
      SELECT 1 FROM public.kanban_tasks k
      WHERE k.task_id = o.canonical_task_key_candidate
        AND k.feature_id = 'openspec:' || o.change_id
        AND jsonb_typeof(k.source_refs) = 'array'
        AND k.source_refs ? o.source_ref
    ) AS both_candidate_and_source_hit
  FROM observations o
)
SELECT count(*) AS indexed_open_tasks,
       count(*) FILTER (WHERE identity_status = 'AMBIGUOUS') AS ambiguous_identity,
       count(*) FILTER (WHERE candidate_key_hit) AS candidate_key_hits,
       count(*) FILTER (WHERE exact_source_ref_hit) AS source_ref_hits,
       count(*) FILTER (WHERE both_candidate_and_source_hit) AS both_hits,
       count(*) FILTER (WHERE NOT (candidate_key_hit OR exact_source_ref_hit)) AS no_match
FROM matches;

\echo '=== Sample mismatches for REVIEW only ==='
WITH latest AS (
  SELECT snapshot_id FROM public.openspec_task_source_snapshots_v1
  WHERE snapshot_status = 'COMPLETE'
  ORDER BY created_at DESC, snapshot_id DESC LIMIT 1
)
SELECT i.source_ref, i.identity_status, i.canonical_task_key_candidate,
       k.task_id AS candidate_kanban_task_id,
       k.feature_id AS candidate_feature_id,
       (k.source_refs ? i.source_ref) AS candidate_has_source_ref
FROM public.openspec_task_source_index_v1 i
JOIN latest s USING (snapshot_id)
LEFT JOIN public.kanban_tasks k
  ON k.task_id = i.canonical_task_key_candidate
ORDER BY i.source_ref
LIMIT 20;

ROLLBACK;
