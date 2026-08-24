-- Parent Atlas callable search projection v1
-- Additive only: no DROP, DELETE, TRUNCATE, or destructive ALTER operations.
-- atlas_symbol_versions remains the revision-specific source; this table is rebuildable.

ALTER TABLE IF EXISTS atlas_symbol_versions
  ADD COLUMN IF NOT EXISTS packet_key TEXT,
  ADD COLUMN IF NOT EXISTS candidate_ordinal INTEGER,
  ADD COLUMN IF NOT EXISTS parameter_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS parameter_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS return_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS imports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS calls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS callable_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_atlas_symbol_versions_packet_ordinal
  ON atlas_symbol_versions(packet_key, candidate_ordinal)
  WHERE packet_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_callable_search (
  symbol_version_id TEXT PRIMARY KEY,
  stable_symbol_id TEXT NOT NULL,
  tree_node_id TEXT,
  packet_key TEXT,
  candidate_ordinal INTEGER,
  source_ref TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  workspace_revision TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  node_kind TEXT,
  relative_path TEXT,
  signature_normalized TEXT,
  parameter_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  parameter_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  return_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  imports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  calls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  parent_qualified_name TEXT,
  domain_id TEXT,
  domain_confidence REAL,
  secondary_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  taxonomy_revision TEXT,
  inferred_uses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  enrichment_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  callable_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  search_vector TSVECTOR,
  projection_revision TEXT NOT NULL,
  producer_revision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_callable_search_qualified_name_idx
  ON atlas_callable_search(qualified_name);
CREATE INDEX IF NOT EXISTS atlas_callable_search_packet_ordinal_idx
  ON atlas_callable_search(packet_key, candidate_ordinal)
  WHERE packet_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_callable_search_source_revision_idx
  ON atlas_callable_search(source_ref, source_revision);
CREATE INDEX IF NOT EXISTS atlas_callable_search_node_kind_idx
  ON atlas_callable_search(node_kind);
CREATE INDEX IF NOT EXISTS atlas_callable_search_parameter_names_gin
  ON atlas_callable_search USING GIN(parameter_names);
CREATE INDEX IF NOT EXISTS atlas_callable_search_parameter_types_gin
  ON atlas_callable_search USING GIN(parameter_types);
CREATE INDEX IF NOT EXISTS atlas_callable_search_imports_gin
  ON atlas_callable_search USING GIN(imports);
CREATE INDEX IF NOT EXISTS atlas_callable_search_calls_gin
  ON atlas_callable_search USING GIN(calls);
CREATE INDEX IF NOT EXISTS atlas_callable_search_search_vector_gin
  ON atlas_callable_search USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS atlas_callable_search_metadata_gin
  ON atlas_callable_search USING GIN(callable_metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_callable_search_enrichment_metadata_gin
  ON atlas_callable_search USING GIN(enrichment_metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_callable_search_domain_idx
  ON atlas_callable_search(domain_id, domain_confidence);
CREATE INDEX IF NOT EXISTS atlas_callable_search_inferred_uses_gin
  ON atlas_callable_search USING GIN(inferred_uses);

-- Rebuildable, idempotent projection backfill. It is intentionally a no-op while
-- atlas_symbol_versions has no rows; future runs preserve existing source data.
INSERT INTO atlas_callable_search (
  symbol_version_id,
  stable_symbol_id,
  tree_node_id,
  packet_key,
  candidate_ordinal,
  source_ref,
  source_revision,
  workspace_revision,
  qualified_name,
  node_kind,
  relative_path,
  signature_normalized,
  parameter_names,
  parameter_types,
  return_types,
  imports,
  calls,
  callable_metadata,
  search_vector,
  projection_revision,
  producer_revision
)
SELECT
  v.symbol_version_id,
  v.stable_symbol_id,
  n.tree_node_id,
  v.packet_key,
  v.candidate_ordinal,
  v.source_ref,
  v.source_revision,
  v.workspace_revision,
  v.qualified_name,
  n.node_kind,
  n.relative_path,
  v.signature_normalized,
  v.parameter_names,
  v.parameter_types,
  v.return_types,
  v.imports,
  v.calls,
  v.callable_metadata,
  to_tsvector('simple', concat_ws(' ', v.qualified_name, n.relative_path,
    v.signature_normalized, array_to_string(v.parameter_names, ' '),
    array_to_string(v.parameter_types, ' '), array_to_string(v.return_types, ' '),
    array_to_string(v.imports, ' '), array_to_string(v.calls, ' '))),
  'atlas-callable-search-v1',
  v.producer_revision
FROM atlas_symbol_versions v
LEFT JOIN atlas_ast_nodes n
  ON n.source_ref_key = v.source_ref
 AND n.qualified_symbol = v.qualified_name
 AND (n.source_revision = v.source_revision OR n.source_revision IS NULL)
ON CONFLICT (symbol_version_id) DO UPDATE SET
  stable_symbol_id = EXCLUDED.stable_symbol_id,
  tree_node_id = EXCLUDED.tree_node_id,
  packet_key = EXCLUDED.packet_key,
  candidate_ordinal = EXCLUDED.candidate_ordinal,
  source_ref = EXCLUDED.source_ref,
  source_revision = EXCLUDED.source_revision,
  workspace_revision = EXCLUDED.workspace_revision,
  qualified_name = EXCLUDED.qualified_name,
  node_kind = EXCLUDED.node_kind,
  relative_path = EXCLUDED.relative_path,
  signature_normalized = EXCLUDED.signature_normalized,
  parameter_names = EXCLUDED.parameter_names,
  parameter_types = EXCLUDED.parameter_types,
  return_types = EXCLUDED.return_types,
  imports = EXCLUDED.imports,
  calls = EXCLUDED.calls,
  callable_metadata = EXCLUDED.callable_metadata,
  search_vector = EXCLUDED.search_vector,
  projection_revision = EXCLUDED.projection_revision,
  producer_revision = EXCLUDED.producer_revision,
  updated_at = now();
