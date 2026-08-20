-- Parent Atlas canonical schema object registry v1
-- Stable identity for tables/columns/FKs/indexes/policies/etc. Catalog OIDs and
-- subobject locators are revision-local provenance only and MUST NOT become
-- canonical Atlas identity.
-- Apply manually and read back before enabling automatic schema evidence writes.

CREATE TABLE IF NOT EXISTS atlas_schema_object_registry (
  stable_schema_object_id TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  object_kind TEXT NOT NULL CHECK (object_kind IN (
    'database','schema','table','view','column','foreign_key','index',
    'database_policy','constraint','database_function','trigger'
  )),
  database_key TEXT NOT NULL,
  schema_name TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_registry_kind
  ON atlas_schema_object_registry(database_key, schema_name, object_kind);
CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_registry_name
  ON atlas_schema_object_registry(canonical_qualified_name);

CREATE TABLE IF NOT EXISTS atlas_schema_object_aliases (
  alias_key TEXT NOT NULL,
  stable_schema_object_id TEXT NOT NULL REFERENCES atlas_schema_object_registry(stable_schema_object_id) ON DELETE CASCADE,
  alias_kind TEXT NOT NULL CHECK (alias_kind IN ('object_key','qualified_name','rename','move','human')),
  source_ref TEXT,
  source_revision TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  registry_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(alias_key, stable_schema_object_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_aliases_object
  ON atlas_schema_object_aliases(stable_schema_object_id);
CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_aliases_alias
  ON atlas_schema_object_aliases(alias_key);

CREATE TABLE IF NOT EXISTS atlas_schema_object_versions (
  schema_object_version_id TEXT PRIMARY KEY,
  stable_schema_object_id TEXT NOT NULL REFERENCES atlas_schema_object_registry(stable_schema_object_id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL,
  object_kind TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  schema_revision TEXT NOT NULL,
  parent_stable_schema_object_id TEXT REFERENCES atlas_schema_object_registry(stable_schema_object_id) ON DELETE SET NULL,
  catalog_oid BIGINT CHECK (catalog_oid IS NULL OR catalog_oid >= 0),
  catalog_locator JSONB,
  definition_hash TEXT NOT NULL,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stable_schema_object_id, schema_revision, definition_hash)
);

CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_versions_object_revision
  ON atlas_schema_object_versions(stable_schema_object_id, schema_revision);
CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_versions_catalog_oid
  ON atlas_schema_object_versions(catalog_oid) WHERE catalog_oid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_schema_object_versions_source
  ON atlas_schema_object_versions(source_ref, source_revision);

COMMENT ON COLUMN atlas_schema_object_versions.catalog_oid IS
  'PostgreSQL object OID at this schema revision only; never canonical Atlas identity. Columns use NULL here.';
COMMENT ON COLUMN atlas_schema_object_versions.catalog_locator IS
  'Revision-local PostgreSQL catalog locator such as {object_oid: relation OID, object_sub_id: attnum}; never canonical Atlas identity.';
