-- MCP-OUTCOME-RECEIPT-ADAPTER-01
-- Additive only. Review and apply through the normal migration owner.
-- No backfill, rename, drop, or existing-row mutation is performed.

DO $$
BEGIN
  IF to_regclass('public.outcome_ledger') IS NULL THEN
    RAISE EXCEPTION 'OUTCOME_LEDGER_REQUIRED_FOR_RECEIPT_IDENTITY_MIGRATION';
  END IF;
END
$$;

ALTER TABLE public.outcome_ledger
  ADD COLUMN IF NOT EXISTS receipt_id text NULL,
  ADD COLUMN IF NOT EXISTS run_id text NULL,
  ADD COLUMN IF NOT EXISTS receipt_schema text NULL,
  ADD COLUMN IF NOT EXISTS receipt_status text NULL,
  ADD COLUMN IF NOT EXISTS writes_performed boolean NULL,
  ADD COLUMN IF NOT EXISTS completion_checksum text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outcome_ledger_receipt_id
  ON public.outcome_ledger (receipt_id)
  WHERE receipt_id IS NOT NULL;
