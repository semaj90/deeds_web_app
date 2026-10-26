-- Parent Atlas receipt verification view v1 (RECEIPT-OWNER-01)
-- Provides unified verification status ('VERIFIED_PASS', 'VERIFIED_FAIL', 'SKIPPED', 'UNVERIFIED')
-- and is_trainable flag over canonical atlas_test_execution_receipts.
-- Zero duplicate tables: queries canonical execution receipts directly.

CREATE OR REPLACE VIEW atlas_receipt_verification_v1 AS
SELECT
  execution_receipt_id,
  stable_test_id,
  test_key,
  run_revision,
  source_ref,
  source_revision,
  framework,
  status,
  duration_ms,
  failure_messages,
  report_checksum,
  observed_at_ms,
  producer_revision,
  created_at,
  CASE
    WHEN status = 'passed' AND (failure_messages IS NULL OR failure_messages = '[]'::jsonb) THEN 'VERIFIED_PASS'
    WHEN status IN ('failed', 'error') THEN 'VERIFIED_FAIL'
    WHEN status = 'skipped' THEN 'SKIPPED'
    ELSE 'UNVERIFIED'
  END AS verification_status,
  (
    status = 'passed'
    AND (failure_messages IS NULL OR failure_messages = '[]'::jsonb)
    AND source_revision IS NOT NULL
    AND report_checksum IS NOT NULL
  ) AS is_trainable
FROM atlas_test_execution_receipts;

COMMENT ON VIEW atlas_receipt_verification_v1 IS
  'Verified pass/fail view over canonical atlas_test_execution_receipts. Only is_trainable=true receipts may train adaptive policies.';
