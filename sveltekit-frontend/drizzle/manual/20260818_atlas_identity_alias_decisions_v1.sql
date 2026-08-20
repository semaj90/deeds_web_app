-- Parent Atlas reviewed identity alias decisions v1
-- Auditable approval ledger for preserving stable identity across reviewed
-- schema/test renames and moves. Alias rows are projections of these decisions.

CREATE TABLE IF NOT EXISTS atlas_identity_alias_decisions (
  decision_id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('test','schema_object')),
  stable_id TEXT NOT NULL,
  old_key TEXT NOT NULL,
  new_key TEXT NOT NULL,
  transition_kind TEXT NOT NULL CHECK (transition_kind IN ('rename','move','rename_and_move','human')),
  old_source_ref TEXT,
  new_source_ref TEXT,
  old_revision TEXT NOT NULL,
  new_revision TEXT NOT NULL,
  evidence_refs JSONB NOT NULL,
  reviewer_id TEXT NOT NULL,
  workflow_action_id TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  registry_revision TEXT NOT NULL,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (old_key <> new_key)
);

CREATE INDEX IF NOT EXISTS idx_atlas_identity_alias_decisions_stable
  ON atlas_identity_alias_decisions(entity_kind, stable_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_identity_alias_decisions_new_key
  ON atlas_identity_alias_decisions(entity_kind, new_key, registry_revision);

COMMENT ON TABLE atlas_identity_alias_decisions IS
  'Reviewed continuity decisions. A row is evidence that a new nomination key should resolve to an existing stable identity; it does not itself create the alias projection.';
