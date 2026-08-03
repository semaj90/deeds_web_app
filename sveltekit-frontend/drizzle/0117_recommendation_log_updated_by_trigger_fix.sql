-- Fixes a pre-existing production bug found while live-testing 0116's
-- supersede_recommendation(): the trigger function
-- update_recommendation_log_timestamp() (introduced in
-- 0109_phase109a_semantic_signals_repair.sql / 0110_phase109a_audit_trail.sql)
-- sets NEW.updated_by, but recommendation_log has never had an updated_by
-- column — not in the live table, not in schema-phase109a.ts's Drizzle
-- definition. Every UPDATE to recommendation_log has therefore been failing
-- with `record "new" has no field "updated_by"`, including the pre-existing
-- promote_recommendation() function's non-dry-run path — that function's
-- prior PARTIAL_PROVEN status was never backed by a real successful write.
--
-- Additive-only: nullable column matching the existing state_changed_by /
-- approved_by varchar(255) convention on this table. No trigger behavior
-- change, no existing row touched.

ALTER TABLE recommendation_log
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
