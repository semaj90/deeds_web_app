-- Parent Atlas canonical test registry v1
-- Vitest/JUnit reporter output owns execution truth, but stable Atlas test
-- identity is created only through explicit registry promotion.

CREATE TABLE IF NOT EXISTS atlas_test_registry (
  stable_test_id TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  framework TEXT NOT NULL,
  canonical_source_ref TEXT NOT NULL,
  canonical_full_name TEXT NOT NULL,
  created_from_nomination_id TEXT NOT NULL,
  created_from_source_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_test_registry_framework_source
  ON atlas_test_registry(framework, canonical_source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_test_registry_full_name
  ON atlas_test_registry(canonical_full_name);

CREATE TABLE IF NOT EXISTS atlas_test_aliases (
  alias_key TEXT NOT NULL,
  stable_test_id TEXT NOT NULL REFERENCES atlas_test_registry(stable_test_id) ON DELETE CASCADE,
  alias_kind TEXT NOT NULL CHECK (alias_kind IN ('test_key','full_name','rename','move','human')),
  source_ref TEXT,
  source_revision TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  registry_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(alias_key, stable_test_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_test_aliases_test
  ON atlas_test_aliases(stable_test_id);
CREATE INDEX IF NOT EXISTS idx_atlas_test_aliases_alias
  ON atlas_test_aliases(alias_key);

CREATE TABLE IF NOT EXISTS atlas_test_versions (
  test_version_id TEXT PRIMARY KEY,
  stable_test_id TEXT NOT NULL REFERENCES atlas_test_registry(stable_test_id) ON DELETE RESTRICT,
  test_key TEXT NOT NULL,
  framework TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  suite_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  title TEXT NOT NULL,
  full_name TEXT NOT NULL,
  line BIGINT CHECK (line IS NULL OR line > 0),
  column_no BIGINT CHECK (column_no IS NULL OR column_no > 0),
  definition_hash TEXT NOT NULL,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stable_test_id, source_revision, definition_hash)
);

CREATE INDEX IF NOT EXISTS idx_atlas_test_versions_test_revision
  ON atlas_test_versions(stable_test_id, source_revision);
CREATE INDEX IF NOT EXISTS idx_atlas_test_versions_source
  ON atlas_test_versions(source_ref, source_revision);
CREATE INDEX IF NOT EXISTS idx_atlas_test_versions_key
  ON atlas_test_versions(test_key);

CREATE TABLE IF NOT EXISTS atlas_test_execution_receipts (
  execution_receipt_id TEXT PRIMARY KEY,
  stable_test_id TEXT REFERENCES atlas_test_registry(stable_test_id) ON DELETE SET NULL,
  test_key TEXT NOT NULL,
  run_revision TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  framework TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped','error')),
  duration_ms DOUBLE PRECISION,
  failure_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_checksum TEXT NOT NULL,
  observed_at_ms BIGINT,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_test_execution_test_run
  ON atlas_test_execution_receipts(stable_test_id, run_revision);
CREATE INDEX IF NOT EXISTS idx_atlas_test_execution_key_run
  ON atlas_test_execution_receipts(test_key, run_revision);
CREATE INDEX IF NOT EXISTS idx_atlas_test_execution_status
  ON atlas_test_execution_receipts(status, run_revision);
