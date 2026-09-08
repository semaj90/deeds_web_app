-- 20260908_execution_reviews_evidence_refs.sql
--
-- Second, smaller schema-drift fix found while verifying
-- 20260908_tool_call_events_execution_columns.sql fixed the "Validation receipts / proof gates"
-- inventory item end-to-end: saveExecutionReview() in src/lib/server/agent/execution-review.ts
-- INSERTs an `evidence_refs` column into `execution_reviews` that the live table never had
-- (`error: column "evidence_refs" of relation "execution_reviews" does not exist`, code 42703).
-- Every other column that INSERT references already exists live -- this is the only gap.
--
-- Purely additive: ADD COLUMN IF NOT EXISTS, nullable, no rewrite of existing rows.
--
-- Apply only through the reviewed Drizzle migration path after authorization.

ALTER TABLE public.execution_reviews
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb;
