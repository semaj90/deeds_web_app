-- Parent Atlas canonical symbol registry v1
-- Purpose: separate cross-revision logical symbol identity from upstream
-- treesitter-chunker node/symbol/chunk IDs and revision-scoped symbol versions.
-- Apply manually, read back, and record a proof receipt before enabling writes.

CREATE TABLE IF NOT EXISTS atlas_symbol_registry (
  stable_symbol_id TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL,
  symbol_kind TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  canonical_qualified_name TEXT NOT NULL,
  created_from_nomination_id TEXT NOT NULL,
  created_from_source_ref TEXT NOT NULL,
  created_from_source_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_symbol_registry_kind
  ON atlas_symbol_registry(language, symbol_kind);
CREATE INDEX IF NOT EXISTS idx_atlas_symbol_registry_name
  ON atlas_symbol_registry(canonical_name);

CREATE TABLE IF NOT EXISTS atlas_symbol_aliases (
  alias_key TEXT NOT NULL,
  stable_symbol_id TEXT NOT NULL REFERENCES atlas_symbol_registry(stable_symbol_id) ON DELETE CASCADE,
  alias_kind TEXT NOT NULL CHECK (alias_kind IN ('symbol_key','upstream_symbol_id','qualified_name','rename','move','human')),
  source_ref TEXT,
  source_revision TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  registry_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(alias_key, stable_symbol_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_symbol_aliases_symbol
  ON atlas_symbol_aliases(stable_symbol_id);
CREATE INDEX IF NOT EXISTS idx_atlas_symbol_aliases_alias
  ON atlas_symbol_aliases(alias_key);

CREATE TABLE IF NOT EXISTS atlas_symbol_versions (
  symbol_version_id TEXT PRIMARY KEY,
  stable_symbol_id TEXT NOT NULL REFERENCES atlas_symbol_registry(stable_symbol_id) ON DELETE RESTRICT,
  source_ref TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  workspace_revision TEXT NOT NULL,
  upstream_node_id TEXT NOT NULL,
  upstream_file_id TEXT,
  upstream_symbol_id TEXT,
  upstream_chunk_id TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  declaration_hash TEXT NOT NULL,
  signature_normalized TEXT,
  byte_start BIGINT NOT NULL CHECK (byte_start >= 0),
  byte_end BIGINT NOT NULL CHECK (byte_end >= byte_start),
  parent_route JSONB NOT NULL DEFAULT '[]'::jsonb,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stable_symbol_id, source_revision, declaration_hash, upstream_node_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_symbol_versions_symbol_revision
  ON atlas_symbol_versions(stable_symbol_id, source_revision);
CREATE INDEX IF NOT EXISTS idx_atlas_symbol_versions_upstream_node
  ON atlas_symbol_versions(upstream_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_symbol_versions_upstream_symbol
  ON atlas_symbol_versions(upstream_symbol_id) WHERE upstream_symbol_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_symbol_versions_source
  ON atlas_symbol_versions(source_ref, source_revision);

CREATE TABLE IF NOT EXISTS atlas_structural_reference_resolutions (
  reference_id TEXT PRIMARY KEY,
  source_stable_symbol_id TEXT REFERENCES atlas_symbol_registry(stable_symbol_id) ON DELETE SET NULL,
  target_stable_symbol_id TEXT REFERENCES atlas_symbol_registry(stable_symbol_id) ON DELETE SET NULL,
  reference_kind TEXT NOT NULL,
  target_text TEXT NOT NULL,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('canonical','degraded','ambiguous','unresolved')),
  resolution_basis TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_reference_resolution_source
  ON atlas_structural_reference_resolutions(source_stable_symbol_id);
CREATE INDEX IF NOT EXISTS idx_atlas_reference_resolution_target
  ON atlas_structural_reference_resolutions(target_stable_symbol_id);
