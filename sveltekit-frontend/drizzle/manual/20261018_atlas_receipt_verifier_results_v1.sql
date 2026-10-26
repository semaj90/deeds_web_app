-- Parent Atlas verifier results v1 (RECEIPT-OWNER-01). Additive, evidence only.
-- Written ONLY by a verifier process (never by the test writer, scorer or a model). The existing view
-- atlas_receipt_verification_v1 only relabels the writer's own status; this table records an independent verdict.
-- A VERIFIED_PASS requires evidence_resolved = true (the stored report was found and its digest recomputed).
CREATE TABLE IF NOT EXISTS atlas_receipt_verifier_results_v1 (
  verification_uuid    uuid        NOT NULL DEFAULT uuidv7() PRIMARY KEY,
  execution_receipt_id text        NOT NULL
    REFERENCES atlas_test_execution_receipts (execution_receipt_id) ON DELETE CASCADE,
  verifier_id          text        NOT NULL CHECK (btrim(verifier_id) <> ''),
  verifier_revision    text        NOT NULL CHECK (btrim(verifier_revision) <> ''),
  verification_status  text        NOT NULL
    CHECK (verification_status IN ('VERIFIED_PASS', 'VERIFIED_FAIL', 'UNVERIFIED', 'FABRICATED')),
  evidence_resolved    boolean     NOT NULL,
  computed_digest      text        NOT NULL CHECK (computed_digest ~ '^sha256:[0-9a-f]{64}$'),
  command_identity     text,
  workspace_revision   text,
  source_revision      text,
  verified_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  canonical            boolean     NOT NULL DEFAULT false CHECK (canonical = false),
  CONSTRAINT atlas_receipt_verifier_pass_needs_evidence
    CHECK (verification_status <> 'VERIFIED_PASS' OR evidence_resolved),
  CONSTRAINT atlas_receipt_verifier_unique UNIQUE (execution_receipt_id, verifier_id, verifier_revision)
);
CREATE INDEX IF NOT EXISTS idx_atlas_receipt_verifier_pass
  ON atlas_receipt_verifier_results_v1 (execution_receipt_id) WHERE verification_status = 'VERIFIED_PASS';
COMMENT ON TABLE atlas_receipt_verifier_results_v1 IS
  'Verifier-written verdicts over atlas_test_execution_receipts. canonical=false. Training admission requires VERIFIED_PASS/VERIFIED_FAIL here, not the relabel view.';
