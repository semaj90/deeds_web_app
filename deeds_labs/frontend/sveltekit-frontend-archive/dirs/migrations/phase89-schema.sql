-- Phase 89 Deliverable 2: Knowledge Graph Schema
-- Run in: docker exec -i phase66-postgres psql -U user -d legal < phase89-schema.sql

-- Drop existing tables (if reapplying)
DROP TABLE IF EXISTS kg_edges CASCADE;
DROP TABLE IF EXISTS kg_nodes CASCADE;
DROP TABLE IF NOT EXISTS file_index CASCADE;

-- Knowledge graph nodes (files, symbols, errors, docs)
CREATE TABLE kg_nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'symbol', 'error', 'doc')),
  label TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX kg_nodes_kind_idx ON kg_nodes(kind);
CREATE INDEX kg_nodes_label_idx ON kg_nodes(label);
CREATE INDEX kg_nodes_meta_idx ON kg_nodes USING gin(meta);

-- Knowledge graph edges (typed relationships)
CREATE TABLE kg_edges (
  id BIGSERIAL PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- FILE_IMPORTS_FILE | FILE_DEFINES_SYMBOL | ERROR_IN_FILE | ERROR_NEAR_SYMBOL
  weight REAL DEFAULT 1.0,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX kg_edges_from_idx ON kg_edges(from_id);
CREATE INDEX kg_edges_to_idx ON kg_edges(to_id);
CREATE INDEX kg_edges_type_idx ON kg_edges(type);
CREATE INDEX kg_edges_from_type_idx ON kg_edges(from_id, type);
CREATE INDEX kg_edges_to_type_idx ON kg_edges(to_id, type);

-- File index (AST metadata)
CREATE TABLE file_index (
  path TEXT PRIMARY KEY,
  module_kind TEXT CHECK (module_kind IN ('esm', 'commonjs', 'svelte', 'unknown')),
  exports JSONB DEFAULT '[]'::jsonb,  -- [{name, kind, line}]
  imports JSONB DEFAULT '[]'::jsonb,  -- [{source, specifiers}]
  hash TEXT NOT NULL,
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX file_index_module_kind_idx ON file_index(module_kind);
CREATE INDEX file_index_hash_idx ON file_index(hash);

-- Helper function: upsert node
CREATE OR REPLACE FUNCTION upsert_kg_node(
  p_id TEXT,
  p_kind TEXT,
  p_label TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS TEXT AS $$
BEGIN
  INSERT INTO kg_nodes (id, kind, label, meta)
  VALUES (p_id, p_kind, p_label, p_meta)
  ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    meta = kg_nodes.meta || EXCLUDED.meta;  -- Merge JSONB
  RETURN p_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function: create edge (idempotent)
CREATE OR REPLACE FUNCTION create_kg_edge(
  p_from TEXT,
  p_to TEXT,
  p_type TEXT,
  p_weight REAL DEFAULT 1.0,
  p_evidence JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  v_edge_id BIGINT;
BEGIN
  INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
  VALUES (p_from, p_to, p_type, p_weight, p_evidence)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_edge_id;

  IF v_edge_id IS NULL THEN
    SELECT id INTO v_edge_id FROM kg_edges
    WHERE from_id = p_from AND to_id = p_to AND type = p_type
    LIMIT 1;
  END IF;

  RETURN v_edge_id;
END;
$$ LANGUAGE plpgsql;

-- Recursive graph expansion (for UI queries)
CREATE OR REPLACE FUNCTION expand_graph(
  p_seed_ids TEXT[],
  p_depth INT DEFAULT 2,
  p_edge_types TEXT[] DEFAULT NULL
) RETURNS TABLE (
  node_id TEXT,
  node_kind TEXT,
  node_label TEXT,
  node_meta JSONB,
  edge_id BIGINT,
  edge_from TEXT,
  edge_to TEXT,
  edge_type TEXT,
  edge_weight REAL,
  depth INT
) AS $$
WITH RECURSIVE graph_walk AS (
  -- Seed nodes
  SELECT
    id AS node_id,
    kind AS node_kind,
    label AS node_label,
    meta AS node_meta,
    NULL::BIGINT AS edge_id,
    NULL::TEXT AS edge_from,
    NULL::TEXT AS edge_to,
    NULL::TEXT AS edge_type,
    NULL::REAL AS edge_weight,
    0 AS depth
  FROM kg_nodes
  WHERE id = ANY(p_seed_ids)

  UNION ALL

  -- Expand outward
  SELECT
    n.id,
    n.kind,
    n.label,
    n.meta,
    e.id,
    e.from_id,
    e.to_id,
    e.type,
    e.weight,
    gw.depth + 1
  FROM graph_walk gw
  JOIN kg_edges e ON (e.from_id = gw.node_id OR e.to_id = gw.node_id)
  JOIN kg_nodes n ON (n.id = CASE
    WHEN e.from_id = gw.node_id THEN e.to_id
    ELSE e.from_id
  END)
  WHERE gw.depth < p_depth
    AND (p_edge_types IS NULL OR e.type = ANY(p_edge_types))
)
SELECT DISTINCT * FROM graph_walk;
$$ LANGUAGE sql STABLE;

-- Views for quick stats
CREATE OR REPLACE VIEW error_density_by_directory AS
SELECT
  split_part(n.id, '/', 2) AS directory,
  COUNT(*) AS error_count,
  COUNT(DISTINCT e.from_id) AS affected_files
FROM kg_nodes n
JOIN kg_edges e ON e.to_id = n.id AND e.type = 'ERROR_IN_FILE'
WHERE n.kind = 'error'
GROUP BY directory
ORDER BY error_count DESC;

CREATE OR REPLACE VIEW top_error_files AS
SELECT
  e.from_id AS file_path,
  n.label AS file_name,
  COUNT(*) AS error_count,
  array_agg(DISTINCT err.label) AS error_types
FROM kg_edges e
JOIN kg_nodes n ON n.id = e.from_id
JOIN kg_nodes err ON err.id = e.to_id
WHERE e.type = 'ERROR_IN_FILE' AND n.kind = 'file' AND err.kind = 'error'
GROUP BY e.from_id, n.label
ORDER BY error_count DESC
LIMIT 50;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO user;

-- Summary
DO $$
DECLARE
  v_node_count INT;
  v_edge_count INT;
  v_file_count INT;
BEGIN
  SELECT COUNT(*) INTO v_node_count FROM kg_nodes;
  SELECT COUNT(*) INTO v_edge_count FROM kg_edges;
  SELECT COUNT(*) INTO v_file_count FROM file_index;

  RAISE NOTICE '✅ Phase 89 schema ready';
  RAISE NOTICE '   Nodes: %', v_node_count;
  RAISE NOTICE '   Edges: %', v_edge_count;
  RAISE NOTICE '   Files: %', v_file_count;
END $$;
