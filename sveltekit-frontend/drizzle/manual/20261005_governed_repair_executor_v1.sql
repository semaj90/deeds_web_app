-- AGENTIC-REPAIR-EXEC-DDL-01 -- DRAFT, NOT APPLIED. Rehearse inside BEGIN ... ROLLBACK first; apply only on explicit operator approval.
-- Binds the existing approval owner (workflow_approvals / recordApproval) to an approved mutation plan and stores the
-- mutation receipt and the independent validation receipt as separate, immutable records. No new run states: existing
-- workflow_runs.status already covers planning / blocked / executing / validating / completed / failed.
-- All statements are idempotent (IF NOT EXISTS / guarded DO blocks). Additive only: no DROP, no data rewrite.
-- Drizzle note: these tables are not declared in schema-postgres.ts; add them to drizzle.config.ts tablesFilter
-- (`!approved_mutation_plans`, `!repair_mutation_receipts`, `!repair_validation_receipts`) before any `drizzle-kit` run.

-- 1. The plan an approver actually approved (one plan per run + repair attempt).
CREATE TABLE IF NOT EXISTS approved_mutation_plans (
  plan_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES workflow_runs(id),
  task_id               text NOT NULL,
  repair_attempt_id     text NOT NULL,
  retry_of              text,
  workspace_revision    text NOT NULL,
  target_files          jsonb NOT NULL,               -- [{ "sourceRef": text, "checksumBefore": "sha256:..." }]
  allowed_operations    text[] NOT NULL,
  validation_profile_id text NOT NULL,
  mutation_checksum     text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_amp_run_attempt UNIQUE (run_id, repair_attempt_id),
  CONSTRAINT chk_amp_operations CHECK (
    cardinality(allowed_operations) > 0
    AND allowed_operations <@ ARRAY['WRITE_FILE','PATCH_FILE','DELETE_FILE']::text[]
  ),
  CONSTRAINT chk_amp_checksum CHECK (mutation_checksum ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT chk_amp_targets CHECK (jsonb_typeof(target_files) = 'array' AND jsonb_array_length(target_files) > 0)
);
CREATE INDEX IF NOT EXISTS idx_amp_task_id ON approved_mutation_plans (task_id);

-- 2. Tie an approval to the exact plan it approved (both-or-neither; legacy approvals stay plan-less).
ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES approved_mutation_plans(plan_id);
ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS plan_checksum text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_workflow_approvals_plan_binding') THEN
    ALTER TABLE workflow_approvals ADD CONSTRAINT chk_workflow_approvals_plan_binding CHECK (
      (plan_id IS NULL) = (plan_checksum IS NULL)
      AND (plan_checksum IS NULL OR plan_checksum ~ '^sha256:[0-9a-f]{64}$')
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_plan_id ON workflow_approvals (plan_id) WHERE plan_id IS NOT NULL;

-- 3. What the governed executor actually did (one mutation per plan).
CREATE TABLE IF NOT EXISTS repair_mutation_receipts (
  receipt_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                    uuid NOT NULL,
  approval_id               uuid NOT NULL,
  plan_id                   uuid NOT NULL UNIQUE REFERENCES approved_mutation_plans(plan_id),
  task_id                   text NOT NULL,
  repair_attempt_id         text NOT NULL,
  workspace_revision_before text NOT NULL,
  workspace_revision_after  text,
  files                     jsonb NOT NULL,            -- [{ sourceRef, checksumBefore, checksumAfter, operation }]
  commands_executed         text[] NOT NULL DEFAULT '{}',
  started_at                timestamptz NOT NULL,
  completed_at              timestamptz,
  executor_revision         text NOT NULL,
  mutation_applied          boolean NOT NULL,
  receipt_checksum          text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_rmr_approval FOREIGN KEY (run_id, approval_id) REFERENCES workflow_approvals (run_id, approval_id),
  CONSTRAINT chk_rmr_checksum CHECK (receipt_checksum ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT chk_rmr_applied_has_after CHECK (NOT mutation_applied OR workspace_revision_after IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_rmr_task_attempt ON repair_mutation_receipts (task_id, repair_attempt_id);

-- 4. Independent validation of that mutation (never the executor's own claim). Verdicts match RepairEpisodeVerifierV1.
CREATE TABLE IF NOT EXISTS repair_validation_receipts (
  receipt_id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutation_receipt_id             uuid NOT NULL UNIQUE REFERENCES repair_mutation_receipts(receipt_id),
  verdict                         text NOT NULL,
  validator_passed                boolean NOT NULL,
  regression_introduced           boolean NOT NULL,
  before_evidence_checksum        text NOT NULL,
  after_evidence_checksum         text NOT NULL,
  target_fingerprint_count_before integer NOT NULL,
  target_fingerprint_count_after  integer NOT NULL,
  new_fingerprint_count           integer NOT NULL,
  validator_revision              text NOT NULL,
  verification_checksum           text NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rvr_verdict CHECK (verdict IN ('PASS','REGRESSED','FAILURE')),
  CONSTRAINT chk_rvr_consistency CHECK (
    validator_passed = (verdict = 'PASS') AND regression_introduced = (verdict = 'REGRESSED')
  ),
  CONSTRAINT chk_rvr_counts CHECK (target_fingerprint_count_before >= 0 AND target_fingerprint_count_after >= 0 AND new_fingerprint_count >= 0),
  CONSTRAINT chk_rvr_checksums CHECK (
    before_evidence_checksum ~ '^sha256:[0-9a-f]{64}$' AND after_evidence_checksum ~ '^sha256:[0-9a-f]{64}$'
    AND verification_checksum ~ '^sha256:[0-9a-f]{64}$'
  )
);

-- 5. Receipts are append-only.
CREATE OR REPLACE FUNCTION repair_receipts_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'REPAIR_RECEIPTS_ARE_APPEND_ONLY (%.%)', TG_TABLE_NAME, TG_OP;
END;
$fn$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rmr_append_only') THEN
    CREATE TRIGGER trg_rmr_append_only BEFORE UPDATE OR DELETE ON repair_mutation_receipts
      FOR EACH ROW EXECUTE FUNCTION repair_receipts_append_only();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rvr_append_only') THEN
    CREATE TRIGGER trg_rvr_append_only BEFORE UPDATE OR DELETE ON repair_validation_receipts
      FOR EACH ROW EXECUTE FUNCTION repair_receipts_append_only();
  END IF;
END $$;

-- 6. LearningOutcomeV1 lives in outcome_ledger.metadata.learningOutcome: index the lookup keys and forbid duplicate rows
--    per execution (partial indexes; the table currently holds no learning_outcome rows).
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_lo_task
  ON outcome_ledger ((metadata->'learningOutcome'->>'taskId')) WHERE outcome_type = 'learning_outcome';
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_lo_repair_attempt
  ON outcome_ledger ((metadata->'learningOutcome'->>'repairAttemptId')) WHERE outcome_type = 'learning_outcome';
CREATE UNIQUE INDEX IF NOT EXISTS uq_outcome_ledger_lo_execution
  ON outcome_ledger ((metadata->'learningOutcome'->>'executionId')) WHERE outcome_type = 'learning_outcome';
