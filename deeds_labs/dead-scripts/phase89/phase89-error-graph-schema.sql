-- Phase 89: Error Graph Schema (Minimal)
-- Database: legal (5434) - Phase 87 portable stack
-- User: user / Pass: pass
--
-- Run once:
-- docker exec -i phase66-postgres psql -U user -d legal < scripts/phase89-error-graph-schema.sql

-- ============================================================
-- Knowledge Graph Nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,                 -- file:<path> | sym:<file>:<name> | err:<id> | doc:<id>
  kind TEXT NOT NULL,                  -- 'file' | 'symbol' | 'error' | 'doc'
  label TEXT NOT NULL,                 -- Display name
  meta JSONB DEFAULT '{}'::jsonb      -- {path, line, col, code, severity, etc.}
);

CREATE INDEX IF NOT EXISTS kg_nodes_kind_idx ON kg_nodes(kind);
CREATE INDEX IF NOT EXISTS kg_nodes_label_idx ON kg_nodes(label);

-- ============================================================
-- Knowledge Graph Edges
-- ============================================================
CREATE TABLE IF NOT EXISTS kg_edges (
  id BIGSERIAL PRIMARY KEY,
  from_id TEXT NOT NULL,               -- Source node id
  to_id TEXT NOT NULL,                 -- Target node id
  type TEXT NOT NULL,                  -- 'FILE_IMPORTS_FILE' | 'FILE_DEFINES_SYMBOL' | 'ERROR_IN_FILE' | 'ERROR_NEAR_SYMBOL'
  weight REAL DEFAULT 1.0,             -- Edge strength
  evidence JSONB DEFAULT '{}'::jsonb   -- {line, col, snippet, etc.}
);

CREATE INDEX IF NOT EXISTS kg_edges_from_idx ON kg_edges(from_id);
CREATE INDEX IF NOT EXISTS kg_edges_to_idx ON kg_edges(to_id);
CREATE INDEX IF NOT EXISTS kg_edges_type_idx ON kg_edges(type);
CREATE INDEX IF NOT EXISTS kg_edges_from_to_type_idx ON kg_edges(from_id, to_id, type);

-- ============================================================
-- File Index (AST metadata cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS file_index (
  path TEXT PRIMARY KEY,
  module_kind TEXT,                    -- 'route' | 'lib' | 'component' | 'util'
  exports JSONB DEFAULT '[]'::jsonb,   -- [{name, kind, line}]
  imports JSONB DEFAULT '[]'::jsonb,   -- [{source, specifiers, line}]
  hash TEXT NOT NULL,                  -- SHA-256 of file content
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS file_index_kind_idx ON file_index(module_kind);

-- ============================================================
-- Utility Functions
-- ============================================================

-- Get all errors for a file
CREATE OR REPLACE FUNCTION get_file_errors(file_path TEXT)
RETURNS TABLE (
  error_id TEXT,
  message TEXT,
  line INTEGER,
  code TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id as error_id,
    n.label as message,
    (n.meta->>'line')::INTEGER as line,
    n.meta->>'code' as code
  FROM kg_nodes n
  JOIN kg_edges e ON e.from_id = n.id
  WHERE e.type = 'ERROR_IN_FILE'
    AND e.to_id = 'file:' || file_path
    AND n.kind = 'error'
  ORDER BY (n.meta->>'line')::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Get error density by directory
CREATE OR REPLACE FUNCTION get_error_density()
RETURNS TABLE (
  directory TEXT,
  file_count BIGINT,
  error_count BIGINT,
  density NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH file_errors AS (
    SELECT
      split_part(n.meta->>'path', '/', 2) as dir,
      n.id as file_id,
      COUNT(e.id) as errors
    FROM kg_nodes n
    LEFT JOIN kg_edges e ON e.to_id = n.id AND e.type = 'ERROR_IN_FILE'
    WHERE n.kind = 'file'
    GROUP BY n.id, n.meta->>'path'
  )
  SELECT
    dir as directory,
    COUNT(DISTINCT file_id) as file_count,
    SUM(errors) as error_count,
    ROUND((SUM(errors)::NUMERIC / NULLIF(COUNT(DISTINCT file_id), 0)), 2) as density
  FROM file_errors
  WHERE dir IS NOT NULL AND dir != ''
  GROUP BY dir
  ORDER BY error_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Schema Complete
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 89 schema ready!';
  RAISE NOTICE '  kg_nodes: % rows', (SELECT COUNT(*) FROM kg_nodes);
  RAISE NOTICE '  kg_edges: % rows', (SELECT COUNT(*) FROM kg_edges);
  RAISE NOTICE '  file_index: % rows', (SELECT COUNT(*) FROM file_index);
END;
$$;
