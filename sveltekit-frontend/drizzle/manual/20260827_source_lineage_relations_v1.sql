-- Source lineage relations v1 (DESIGN / UNAPPLIED)
--
-- These relations separate stable source identity, observed source versions,
-- and legacy locator bindings. They intentionally do not alter atlas_packets
-- or stamp revisions onto historical packet rows.
--
-- Apply only after the source-lineage owner and producer contracts are
-- explicitly approved. Until then, use scripts/atlas read-only audits.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_source_aliases (
  repo_id               text        NOT NULL DEFAULT 'deeds-web-app',
  alias_source_ref      text        NOT NULL,
  normalized_alias_ref  text        NOT NULL,
  canonical_source_ref  text        NOT NULL,
  resolution_kind       text        NOT NULL CHECK (resolution_kind IN (
    'NORMALIZED_EXACT', 'SVELTE_LIB_ALIAS', 'ROOT_PREFIX_ALIAS',
    'MOVED_PATH', 'HISTORICAL_PATH'
  )),
  status                text        NOT NULL DEFAULT 'PROPOSED' CHECK (status IN (
    'PROPOSED', 'VERIFIED', 'REJECTED', 'SUPERSEDED'
  )),
  evidence              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resolver_revision     text        NOT NULL,
  effective_from        timestamptz,
  effective_to          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, alias_source_ref),
  FOREIGN KEY (repo_id, canonical_source_ref)
    REFERENCES atlas_source_refs (repo_id, source_ref_key)
);

CREATE INDEX IF NOT EXISTS atlas_source_aliases_canonical_idx
  ON atlas_source_aliases (repo_id, canonical_source_ref, status);
CREATE INDEX IF NOT EXISTS atlas_source_aliases_normalized_idx
  ON atlas_source_aliases (repo_id, normalized_alias_ref, status);

CREATE TABLE IF NOT EXISTS atlas_workspace_source_bindings (
  repo_id                    text        NOT NULL DEFAULT 'deeds-web-app',
  workspace_revision         text        NOT NULL,
  canonical_source_ref       text        NOT NULL,
  source_revision            text        NOT NULL,
  content_digest             text        NOT NULL,
  byte_length                bigint      NOT NULL CHECK (byte_length >= 0),
  source_manifest_ordinal    integer,
  git_blob_oid               text,
  tracked_at_base_commit     boolean,
  dirty_relative_to_base    boolean,
  producer_revision          text        NOT NULL,
  binding_checksum           text        NOT NULL CHECK (binding_checksum ~ '^[a-f0-9]{64}$'),
  observed_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, workspace_revision, canonical_source_ref),
  FOREIGN KEY (repo_id, canonical_source_ref)
    REFERENCES atlas_source_refs (repo_id, source_ref_key),
  UNIQUE (repo_id, canonical_source_ref, source_revision, workspace_revision)
);

CREATE INDEX IF NOT EXISTS atlas_workspace_source_bindings_source_idx
  ON atlas_workspace_source_bindings (repo_id, canonical_source_ref, source_revision);
CREATE INDEX IF NOT EXISTS atlas_workspace_source_bindings_workspace_idx
  ON atlas_workspace_source_bindings (repo_id, workspace_revision);

COMMENT ON TABLE atlas_source_aliases IS
  'Evidence-backed legacy locator to stable source identity binding; VERIFIED rows only are promotion-eligible.';
COMMENT ON TABLE atlas_workspace_source_bindings IS
  'Workspace-scoped source version observations; owns source_revision/content_digest for a canonical source.';
COMMENT ON COLUMN atlas_workspace_source_bindings.source_revision IS
  'Content-derived source revision, expected to equal sha256:<content_digest>; Git provenance is separate.';

COMMIT;
