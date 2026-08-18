-- Parent Atlas static assertion registry v1
-- Assertion identity is owned by static test-source analysis beneath a resolved
-- stable_test_id. Vitest runner IDs remain execution provenance only.

CREATE TABLE IF NOT EXISTS atlas_assertion_registry (
  stable_assertion_id TEXT PRIMARY KEY,
  stable_test_id TEXT NOT NULL REFERENCES atlas_test_registry(stable_test_id) ON DELETE CASCADE,
  canonical_key TEXT NOT NULL UNIQUE,
  assertion_kind TEXT NOT NULL CHECK (assertion_kind IN ('expect','assert','custom_assertion')),
  expression_fingerprint TEXT NOT NULL,
  created_from_nomination_id TEXT NOT NULL,
  created_from_source_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_assertion_registry_test
  ON atlas_assertion_registry(stable_test_id, assertion_kind);

CREATE TABLE IF NOT EXISTS atlas_assertion_aliases (
  alias_key TEXT NOT NULL,
  stable_assertion_id TEXT NOT NULL REFERENCES atlas_assertion_registry(stable_assertion_id) ON DELETE CASCADE,
  alias_kind TEXT NOT NULL CHECK (alias_kind IN ('assertion_key','human')),
  source_ref TEXT,
  source_revision TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  registry_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(alias_key, stable_assertion_id)
);

CREATE TABLE IF NOT EXISTS atlas_assertion_versions (
  assertion_version_id TEXT PRIMARY KEY,
  stable_assertion_id TEXT NOT NULL REFERENCES atlas_assertion_registry(stable_assertion_id) ON DELETE RESTRICT,
  stable_test_id TEXT NOT NULL REFERENCES atlas_test_registry(stable_test_id) ON DELETE CASCADE,
  assertion_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  assertion_kind TEXT NOT NULL,
  expression_fingerprint TEXT NOT NULL,
  duplicate_ordinal INTEGER NOT NULL CHECK (duplicate_ordinal >= 0),
  byte_start BIGINT NOT NULL CHECK (byte_start >= 0),
  byte_end BIGINT NOT NULL CHECK (byte_end > byte_start),
  line BIGINT NOT NULL CHECK (line > 0),
  column_no BIGINT NOT NULL CHECK (column_no > 0),
  definition_hash TEXT NOT NULL,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stable_assertion_id, source_revision, definition_hash)
);

CREATE INDEX IF NOT EXISTS idx_atlas_assertion_versions_test_revision
  ON atlas_assertion_versions(stable_test_id, source_revision);
