-- Parent Atlas sidecar migration preflight. SELECT-only; intentionally not executed.
-- Run only through an operator-approved, identity-bound read-only PostgreSQL connection.
-- First inspect current_database()/server_version and confirm the intended target.
-- The orphan-count scans can be expensive on large tables; review workload/timeout first.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_database() AS database_name,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only;

-- Inspect actual FK/unique definitions and referenced key candidates by definition,
-- not by historical constraint/index name.
SELECT c.conrelid::regclass AS table_name,
       c.conname,
       c.contype,
       pg_get_constraintdef(c.oid, true) AS definition,
       c.convalidated
FROM pg_constraint AS c
WHERE c.conrelid IN (
  to_regclass('public.tool_call_events'),
  to_regclass('public.outcome_ledger'),
  to_regclass('public.agent_tasks'),
  to_regclass('public.agent_traces')
)
ORDER BY c.conrelid::regclass::text, c.contype, c.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('tool_call_events', 'outcome_ledger', 'agent_tasks', 'agent_traces')
ORDER BY tablename, indexname;

-- Check the nullable FK candidates observed in the rolled-back scratch rehearsal.
-- NULL references are counted separately and are not classified as orphans.
SELECT 'tool_call_events.trace_id -> agent_traces.trace_id' AS relationship,
       count(*) AS source_rows,
       count(*) FILTER (WHERE e.trace_id IS NULL) AS null_references,
       count(*) FILTER (WHERE e.trace_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.agent_traces t WHERE t.trace_id = e.trace_id)) AS orphan_references
FROM public.tool_call_events e
UNION ALL
SELECT 'outcome_ledger.task_id -> agent_tasks.id', count(*),
       count(*) FILTER (WHERE o.task_id IS NULL),
       count(*) FILTER (WHERE o.task_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.agent_tasks t WHERE t.id = o.task_id))
FROM public.outcome_ledger o
UNION ALL
SELECT 'outcome_ledger.trace_id -> agent_traces.trace_id', count(*),
       count(*) FILTER (WHERE o.trace_id IS NULL),
       count(*) FILTER (WHERE o.trace_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.agent_traces t WHERE t.trace_id = o.trace_id))
FROM public.outcome_ledger o
UNION ALL
SELECT 'outcome_ledger.tool_call_id -> tool_call_events.id', count(*),
       count(*) FILTER (WHERE o.tool_call_id IS NULL),
       count(*) FILTER (WHERE o.tool_call_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.tool_call_events e WHERE e.id = o.tool_call_id))
FROM public.outcome_ledger o;

-- Explicit uniqueness checks for candidate parent keys. A zero duplicate count
-- does not itself prove a compatible unique constraint exists; inspect catalog output above.
SELECT 'agent_traces.trace_id' AS candidate_key,
       count(*) AS rows,
       count(*) - count(DISTINCT trace_id) AS duplicate_or_null_key_count
FROM public.agent_traces
UNION ALL
SELECT 'agent_tasks.id', count(*), count(*) - count(DISTINCT id)
FROM public.agent_tasks
UNION ALL
SELECT 'tool_call_events.id', count(*), count(*) - count(DISTINCT id)
FROM public.tool_call_events;

ROLLBACK;
