-- outcome_ledger fresh-install schema convergence (2026-09-04)
--
-- Two independent migrations both do `CREATE TABLE IF NOT EXISTS outcome_ledger`
-- with incompatible column sets:
--   drizzle/0111_tool_call_runtime_contract.sql            (task_id/outcome_type/score/reward/feedback/metadata)
--   drizzle/migrations/20260709_agent_telemetry_tables.sql (previous_state/next_state/execution_id/final_state/...)
-- On any environment, whichever runs first wins; the other's CREATE TABLE
-- silently no-ops and its CREATE INDEX statements fail (columns don't exist).
--
-- Verified live via `\d outcome_ledger`: the 0111 shape is what is actually
-- deployed. That means two REAL, already-shipped application call sites are
-- currently broken against it every time they run (verified by reading the
-- code, not assumed):
--   - src/routes/api/agent/execute/+server.ts's outcome_ledger INSERT selects
--     previous_state/next_state/tool_name/execution_id/result_class/
--     recovery_attempted/final_state/final_outcome/total_duration_ms/created_at
--   - src/lib/server/agent/execution-review.ts::loadOutcomeLedger() SELECTs
--     the same column set, filtered by execution_id
-- Both are wrapped in try/catch and fail silently (console.error only) --
-- this has likely been a silent no-op since whichever session wrote those
-- call sites against the wrong migration's shape.
--
-- Resolution: converge on ONE table with the union of both column sets,
-- additive only. No rename, drop, or existing-row mutation. This makes both
-- existing callers (the 0111-shaped receipt/reward writers already proven
-- live this session, and the previous_state/next_state writers above) valid
-- against a single real table, and gives a fresh install one authoritative
-- shape to converge on going forward.
--
-- drizzle/migrations/20260709_agent_telemetry_tables.sql's outcome_ledger
-- block is left in place (archive-not-delete) but must not be run again --
-- see the note added directly above it in that file.

DO $$
BEGIN
  IF to_regclass('public.outcome_ledger') IS NULL THEN
    RAISE EXCEPTION 'OUTCOME_LEDGER_REQUIRED_FOR_STATE_TRANSITION_CONVERGENCE';
  END IF;
END
$$;

-- `outcome_type` was NOT NULL under the reward-ledger shape (0111), but the
-- state-transition writer (src/routes/api/agent/execute/+server.ts) never
-- supplies it -- that concept doesn't exist in its call site. Live-proven:
-- before this ALTER, its exact INSERT statement failed with
-- `null value in column "outcome_type" violates not-null constraint`.
-- Relaxing this is non-destructive (no existing row has a null outcome_type
-- to violate anything downstream) and every other caller
-- (tool-call-recorder.ts::recordOutcome, agent-work-receipt-store-v1.ts)
-- continues to always supply a value on its own.
ALTER TABLE public.outcome_ledger
  ALTER COLUMN outcome_type DROP NOT NULL;

ALTER TABLE public.outcome_ledger
  ADD COLUMN IF NOT EXISTS previous_state varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS next_state varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS tool_name varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS execution_id uuid NULL,
  ADD COLUMN IF NOT EXISTS result_class varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS recovery_attempted boolean NULL,
  ADD COLUMN IF NOT EXISTS final_state varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS final_outcome varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS total_duration_ms integer NULL,
  -- Redundant in spirit with the existing `recorded_at` column, but the live
  -- INSERT in +server.ts explicitly targets `created_at` by name; adding it
  -- (rather than editing the call site) keeps this migration schema-only.
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_outcome_ledger_execution_id
  ON public.outcome_ledger (execution_id)
  WHERE execution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_previous_state
  ON public.outcome_ledger (previous_state)
  WHERE previous_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_next_state
  ON public.outcome_ledger (next_state)
  WHERE next_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_final_outcome
  ON public.outcome_ledger (final_outcome)
  WHERE final_outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_created_at
  ON public.outcome_ledger (created_at DESC);
