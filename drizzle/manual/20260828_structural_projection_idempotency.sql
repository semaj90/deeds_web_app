-- STRUCT-13E: durable idempotency key for revision-qualified structural facts.
-- Apply through the normal Drizzle/manual migration process; do not run directly
-- as part of a structural projection apply.
ALTER TABLE feature_structural_facts
  ADD COLUMN IF NOT EXISTS projection_key text;

CREATE UNIQUE INDEX IF NOT EXISTS feature_structural_facts_projection_key_uidx
  ON feature_structural_facts (projection_key)
  WHERE projection_key IS NOT NULL;
