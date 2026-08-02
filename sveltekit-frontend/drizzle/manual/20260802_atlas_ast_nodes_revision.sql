-- Adds source_revision, workspace_id, grammar_version to atlas_ast_nodes.
-- Without source_revision, cross-revision symbol_id stability cannot be
-- tested — normalized_node_hash conflates content-identity with
-- revision-identity. Nullable: existing rows have no value until re-analyzed.

ALTER TABLE atlas_ast_nodes ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE atlas_ast_nodes ADD COLUMN IF NOT EXISTS source_revision text;
ALTER TABLE atlas_ast_nodes ADD COLUMN IF NOT EXISTS grammar_version text;

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_source_revision ON atlas_ast_nodes (source_revision) WHERE source_revision IS NOT NULL;
