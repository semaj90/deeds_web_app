-- Ontological taxonomy over the topological data store.
-- Three-level hierarchy: codebase → topo_class → topo_byte → cluster → file.
-- Edges carry ontological relation types (IS_A, PART_OF, SIBLING_OF, SHARES_TOPO).
--
-- Built from code_retrieval_chunks.topo_class/topo_byte + qdrant_cluster_members.
-- See scripts/build-topology-taxonomy.mjs for the population logic.

CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  id              bigserial PRIMARY KEY,
  node_key        text        NOT NULL,        -- "topo:api-route", "byte:18", "cluster:gpu:42", "file:src/foo.ts"
  level           smallint    NOT NULL,        -- 0=root, 1=topo_class, 2=topo_byte, 3=cluster, 4=file
  parent_key      text,                        -- null for root, else parent's node_key
  display_name    text        NOT NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  member_count    integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_key)
);

CREATE INDEX IF NOT EXISTS taxonomy_nodes_level_idx
  ON taxonomy_nodes (level);

CREATE INDEX IF NOT EXISTS taxonomy_nodes_parent_idx
  ON taxonomy_nodes (parent_key);

CREATE INDEX IF NOT EXISTS taxonomy_nodes_metadata_gin_idx
  ON taxonomy_nodes USING gin (metadata);

CREATE TABLE IF NOT EXISTS taxonomy_edges (
  id            bigserial PRIMARY KEY,
  source_key    text        NOT NULL,
  target_key    text        NOT NULL,
  relation      text        NOT NULL,    -- IS_A | PART_OF | SIBLING_OF | SHARES_TOPO | INHERITS_FROM
  weight        real        NOT NULL DEFAULT 1.0,
  evidence      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, target_key, relation)
);

CREATE INDEX IF NOT EXISTS taxonomy_edges_source_idx
  ON taxonomy_edges (source_key, relation);

CREATE INDEX IF NOT EXISTS taxonomy_edges_target_idx
  ON taxonomy_edges (target_key, relation);
