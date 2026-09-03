-- Targeted parameter indexes on taxonomy_nodes.metadata.
-- Supersedes the blanket GIN index (taxonomy_nodes_metadata_gin_idx) for the
-- specific keys real rows actually carry, verified live 2026-09-02:
--   SELECT jsonb_object_keys(metadata), count(*) FROM taxonomy_nodes GROUP BY 1;
--   -> topo_class (5043 rows), topo_byte (5043 rows), kind (483 rows)
-- Table: 5,527 rows / 62,802 taxonomy_edges as of this migration (see
-- drizzle/manual/20260507_topology_taxonomy.sql for the base tables). At this
-- scale a metadata->>'topo_class' filter is a cheap seq scan (~1.6ms); these
-- expression indexes are forward capacity for the taxonomy retrieval/dense
-- search work in openspec/changes/parent-atlas-ontology-kernel, not a fix for
-- an observed slow query.

CREATE INDEX IF NOT EXISTS taxonomy_nodes_topo_class_idx
  ON taxonomy_nodes ((metadata ->> 'topo_class'))
  WHERE metadata ? 'topo_class';

CREATE INDEX IF NOT EXISTS taxonomy_nodes_topo_byte_idx
  ON taxonomy_nodes ((metadata ->> 'topo_byte'))
  WHERE metadata ? 'topo_byte';

CREATE INDEX IF NOT EXISTS taxonomy_nodes_kind_idx
  ON taxonomy_nodes ((metadata ->> 'kind'))
  WHERE metadata ? 'kind';
