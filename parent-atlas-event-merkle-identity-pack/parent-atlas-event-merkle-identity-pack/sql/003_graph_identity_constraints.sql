-- TEMPLATE ONLY. Adapt to actual live schema after inventory. Do not run blindly.

-- Canonical document root uniqueness:
-- CREATE UNIQUE INDEX CONCURRENTLY ...
-- ON atlas_tree_nodes (source_ref)
-- WHERE node_kind = 'DOCUMENT';

-- Canonical packet chunk uniqueness:
-- CREATE UNIQUE INDEX CONCURRENTLY ...
-- ON atlas_tree_nodes (packet_key)
-- WHERE node_kind = 'CHUNK' AND packet_key IS NOT NULL;

-- Stable cross-revision symbol:
-- CREATE TABLE atlas_symbols (
--   symbol_id TEXT PRIMARY KEY,
--   namespace TEXT NOT NULL,
--   qualified_name TEXT NOT NULL,
--   symbol_kind TEXT NOT NULL,
--   identity_revision TEXT NOT NULL,
--   UNIQUE (namespace, qualified_name, symbol_kind, identity_revision)
-- );

-- Revision-bound symbol occurrence:
-- CREATE TABLE atlas_symbol_versions (
--   symbol_version_id TEXT PRIMARY KEY,
--   symbol_id TEXT NOT NULL REFERENCES atlas_symbols(symbol_id),
--   source_ref TEXT NOT NULL,
--   source_revision TEXT NOT NULL,
--   parse_node_id TEXT NOT NULL,
--   content_hash TEXT NOT NULL,
--   start_byte BIGINT,
--   end_byte BIGINT,
--   UNIQUE (symbol_id, source_revision, parse_node_id)
-- );

-- page_index_path is NOT canonical identity.
-- Keep current tree_node_id uniqueness until migration + dry-run proof passes.
