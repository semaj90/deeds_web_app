-- Parent Atlas grounded execution receipts
--
-- This migration is intentionally additive. It does not change Kanban task truth,
-- completion semantics, retrieval ownership, or canonical evidence tables.
-- The new table is an append-only execution/validation provenance ledger.

CREATE TABLE IF NOT EXISTS atlas_grounded_execution_receipts (
  receipt_id text PRIMARY KEY,
  task_id text NOT NULL,
  run_id text NOT NULL,
  worker_id text NOT NULL,
  claim_token_digest text NOT NULL,
  context_manifest_checksum text NOT NULL,
  grounded_context_checksum text NOT NULL,
  status text NOT NULL,
  executor text NOT NULL,
  executor_revision text NOT NULL,
  receipt_checksum text NOT NULL,
  grounded_context jsonb NOT NULL,
  receipt jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_grounded_execution_receipts_status_check
    CHECK (status IN ('SUCCESS','FAILED','BLOCKED','PARTIAL')),
  CONSTRAINT atlas_grounded_execution_receipts_claim_digest_check
    CHECK (claim_token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT atlas_grounded_execution_receipts_context_checksum_check
    CHECK (context_manifest_checksum ~ '^[a-f0-9]{64}$'),
  CONSTRAINT atlas_grounded_execution_receipts_grounded_checksum_check
    CHECK (grounded_context_checksum ~ '^[a-f0-9]{64}$'),
  CONSTRAINT atlas_grounded_execution_receipts_receipt_checksum_check
    CHECK (receipt_checksum ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS atlas_grounded_execution_receipts_task_run_idx
  ON atlas_grounded_execution_receipts (task_id, run_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS atlas_grounded_execution_receipts_context_idx
  ON atlas_grounded_execution_receipts (context_manifest_checksum);

-- Makes linking a durable receipt to a Kanban attempt idempotent. Existing rows
-- with NULL execution_receipt_id remain unaffected because PostgreSQL UNIQUE
-- indexes permit multiple NULL values.
CREATE UNIQUE INDEX IF NOT EXISTS kanban_task_attempts_receipt_identity_uq
  ON kanban_task_attempts (task_id, run_id, execution_receipt_id)
  WHERE execution_receipt_id IS NOT NULL;
