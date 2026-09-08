-- 20260908_tool_call_events_execution_columns.sql
--
-- Fixes the schema-drift bug recorded in
-- openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's "Validation receipts /
-- proof gates" inventory item (found 2026-09-08, characterized by the failing-state test at
-- src/lib/server/agent/execution-review.integration.spec.ts).
--
-- Root cause: two independent call sites (src/lib/server/agent/execution-review.ts's
-- loadToolCallEvents() reader, and src/routes/api/agent/execute/+server.ts's own INSERT INTO
-- tool_call_events) were written against an "execution_id"-based schema that was never migrated
-- into the live table. The live table only ever received the columns
-- src/lib/server/telemetry/tool-call-recorder.ts's writer uses (session_id, tool_source,
-- result_summary, result_ok, latency_ms, otel_span_id, otel_trace_id, called_at, completed_at) --
-- a separate, real, already-working writer that this migration does not touch or change.
--
-- Evidence this is the intended target shape, not a guess: the sibling table `outcome_ledger`
-- already has this exact column set live (execution_id uuid, tool_name varchar, result_class
-- varchar, total_duration_ms integer, created_at timestamptz, etc.) -- it was migrated, this
-- table was not. Confirmed via `POST /api/agent/execute`'s "Finalize trace" block: its
-- tool_call_events INSERT (referencing execution_id) throws on every real call, caught silently
-- by the surrounding try/catch (logged as "[/api/agent/execute] Telemetry persistence error"),
-- so this has never once failed loudly -- it has simply never written a row via that path.
--
-- Purely additive: no column is renamed, dropped, or given a NOT NULL constraint (the live table
-- already has 120 rows from tool-call-recorder.ts's writer, which will simply leave these new
-- columns NULL going forward -- exactly as intended, since that writer and this one populate
-- disjoint column sets on the same table by design, matching how outcome_ledger already receives
-- writes from more than one caller). No data loss, no rewrite of existing rows.
--
-- Apply only through the reviewed Drizzle migration path after authorization (matching this
-- repo's convention -- see 20260908_task_semantic_packets_writer_columns_only.sql).

ALTER TABLE public.tool_call_events
  ADD COLUMN IF NOT EXISTS execution_id uuid,
  ADD COLUMN IF NOT EXISTS tool_namespace text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS result_class text,
  ADD COLUMN IF NOT EXISTS result_count integer,
  ADD COLUMN IF NOT EXISTS source_ref_count integer,
  ADD COLUMN IF NOT EXISTS source_refs text[],
  ADD COLUMN IF NOT EXISTS from_server boolean,
  ADD COLUMN IF NOT EXISTS event_json jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tool_call_events_execution_id
  ON public.tool_call_events (execution_id)
  WHERE execution_id IS NOT NULL;
