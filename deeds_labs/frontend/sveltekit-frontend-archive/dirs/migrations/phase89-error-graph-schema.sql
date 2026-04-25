-- Phase 89: Agentic Error Analysis Map - Database Schema
-- Knowledge Graph for AST + Error + Symbol + Doc relationships

-- =============================================================================
-- 1. KNOWLEDGE GRAPH TABLES
-- =============================================================================

-- Graph Nodes (unified entity table)
CREATE TABLE IF NOT EXISTS kg_nodes (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(50) NOT NULL, -- 'file', 'error', 'symbol', 'doc', 'pattern'
  label TEXT NOT NULL,       -- human-readable name
  uri TEXT,                  -- unique identifier (file:path, err:TS1005:file:line, etc.)
  meta JSONB DEFAULT '{}',   -- flexible metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(uri)
);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_kind ON kg_nodes(kind);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_uri ON kg_nodes(uri);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_meta_gin ON kg_nodes USING GIN(meta);

-- Graph Edges (relationships)
CREATE TABLE IF NOT EXISTS kg_edges (
  id SERIAL PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL, -- 'FILE_IMPORTS_FILE', 'ERROR_IN_FILE', 'DOC_MENTIONS_SYMBOL', etc.
  weight FLOAT DEFAULT 1.0,   -- edge strength/confidence
  evidence JSONB DEFAULT '{}', -- proof/context for edge
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS idx_kg_edges_from ON kg_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_to ON kg_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON kg_edges(type);
CREATE INDEX IF NOT EXISTS idx_kg_edges_evidence_gin ON kg_edges USING GIN(evidence);

-- =============================================================================
-- 2. FILE INDEX (AST/ts-morph metadata)
-- =============================================================================

CREATE TABLE IF NOT EXISTS file_index (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  module_kind VARCHAR(50),    -- 'esm', 'commonjs', 'svelte', 'ts', etc.
  exports JSONB DEFAULT '[]', -- [{name, kind: 'class'|'function'|'const', line}]
  imports JSONB DEFAULT '[]', -- [{from, specifiers: [{name, alias}]}]
  hash VARCHAR(64),           -- file content hash for change detection
  ast_summary JSONB,          -- lightweight AST summary (top-level declarations)
  error_count INTEGER DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_index_path ON file_index(path);
CREATE INDEX IF NOT EXISTS idx_file_index_module_kind ON file_index(module_kind);
CREATE INDEX IF NOT EXISTS idx_file_index_exports_gin ON file_index USING GIN(exports);
CREATE INDEX IF NOT EXISTS idx_file_index_imports_gin ON file_index USING GIN(imports);
CREATE INDEX IF NOT EXISTS idx_file_index_hash ON file_index(hash);

-- =============================================================================
-- 3. TS ERROR EMBEDDINGS (already exists, but ensure pgvector)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS error_embeddings (
  id SERIAL PRIMARY KEY,
  error_id INTEGER REFERENCES ts_errors(id) ON DELETE CASCADE,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_embeddings_vector
  ON error_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- 4. PATTERN CATALOG (known fix patterns)
-- =============================================================================

CREATE TABLE IF NOT EXISTS fix_patterns (
  id SERIAL PRIMARY KEY,
  pattern_name VARCHAR(200) NOT NULL,
  error_codes TEXT[],        -- ['TS1005', 'TS1128']
  description TEXT,
  before_snippet TEXT,       -- example error code
  after_snippet TEXT,        -- example fix
  tags TEXT[],               -- ['svelte5', 'runes', 'migration']
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  embedding vector(768),     -- pattern embedding for similarity search
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fix_patterns_codes ON fix_patterns USING GIN(error_codes);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_tags ON fix_patterns USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_vector
  ON fix_patterns USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- =============================================================================
-- 5. VIEWS FOR ERROR ANALYSIS
-- =============================================================================

-- Error density by directory
CREATE OR REPLACE VIEW error_density_by_directory AS
SELECT
  regexp_replace(path, '/[^/]+$', '') AS directory,
  COUNT(*) AS error_count,
  COUNT(DISTINCT path) AS file_count,
  ARRAY_AGG(DISTINCT code) AS error_types
FROM ts_errors
GROUP BY directory
ORDER BY error_count DESC;

-- Files with most errors
CREATE OR REPLACE VIEW top_error_files AS
SELECT
  path,
  COUNT(*) AS error_count,
  ARRAY_AGG(DISTINCT code ORDER BY code) AS error_codes,
  MAX(created_at) AS last_error_at
FROM ts_errors
GROUP BY path
ORDER BY error_count DESC
LIMIT 50;

-- Error propagation graph (errors that share files)
CREATE OR REPLACE VIEW error_cooccurrence AS
SELECT
  e1.code AS error1,
  e2.code AS error2,
  COUNT(DISTINCT e1.path) AS shared_files
FROM ts_errors e1
JOIN ts_errors e2 ON e1.path = e2.path AND e1.code < e2.code
GROUP BY e1.code, e2.code
HAVING COUNT(DISTINCT e1.path) > 1
ORDER BY shared_files DESC;

-- =============================================================================
-- 6. FUNCTIONS FOR GRAPH OPERATIONS
-- =============================================================================

-- Get node by URI (create if missing)
CREATE OR REPLACE FUNCTION get_or_create_node(
  p_kind VARCHAR,
  p_label TEXT,
  p_uri TEXT,
  p_meta JSONB DEFAULT '{}'
) RETURNS INTEGER AS $$
DECLARE
  v_node_id INTEGER;
BEGIN
  SELECT id INTO v_node_id FROM kg_nodes WHERE uri = p_uri;

  IF v_node_id IS NULL THEN
    INSERT INTO kg_nodes (kind, label, uri, meta)
    VALUES (p_kind, p_label, p_uri, p_meta)
    RETURNING id INTO v_node_id;
  END IF;

  RETURN v_node_id;
END;
$$ LANGUAGE plpgsql;

-- Create edge (upsert)
CREATE OR REPLACE FUNCTION create_edge(
  p_from_uri TEXT,
  p_to_uri TEXT,
  p_type VARCHAR,
  p_weight FLOAT DEFAULT 1.0,
  p_evidence JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE
  v_from_id INTEGER;
  v_to_id INTEGER;
BEGIN
  SELECT id INTO v_from_id FROM kg_nodes WHERE uri = p_from_uri;
  SELECT id INTO v_to_id FROM kg_nodes WHERE uri = p_to_uri;

  IF v_from_id IS NOT NULL AND v_to_id IS NOT NULL THEN
    INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
    VALUES (v_from_id, v_to_id, p_type, p_weight, p_evidence)
    ON CONFLICT (from_id, to_id, type)
    DO UPDATE SET
      weight = EXCLUDED.weight,
      evidence = EXCLUDED.evidence;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Expand graph from seed nodes (KAG traversal)
CREATE OR REPLACE FUNCTION expand_graph(
  p_seed_uris TEXT[],
  p_depth INTEGER DEFAULT 1
) RETURNS TABLE(uri TEXT, kind VARCHAR, label TEXT, distance INTEGER) AS $$
WITH RECURSIVE graph_walk AS (
  -- Base case: seed nodes
  SELECT
    n.uri,
    n.kind,
    n.label,
    0 AS distance
  FROM kg_nodes n
  WHERE n.uri = ANY(p_seed_uris)

  UNION ALL

  -- Recursive case: follow edges
  SELECT
    n.uri,
    n.kind,
    n.label,
    gw.distance + 1
  FROM graph_walk gw
  JOIN kg_edges e ON e.from_id = (SELECT id FROM kg_nodes WHERE uri = gw.uri)
  JOIN kg_nodes n ON n.id = e.to_id
  WHERE gw.distance < p_depth
)
SELECT DISTINCT uri, kind, label, distance FROM graph_walk;
$$ LANGUAGE sql;

-- =============================================================================
-- 7. SAMPLE DATA POPULATION (for testing)
-- =============================================================================

-- Populate from existing ts_errors
INSERT INTO kg_nodes (kind, label, uri, meta)
SELECT DISTINCT
  'file',
  path,
  'file:' || path,
  jsonb_build_object('path', path)
FROM ts_errors
ON CONFLICT (uri) DO NOTHING;

INSERT INTO kg_nodes (kind, label, uri, meta)
SELECT
  'error',
  code || ':' || path || ':' || line,
  'err:' || code || ':' || path || ':' || line || ':' || "column",
  jsonb_build_object(
    'code', code,
    'message', message,
    'path', path,
    'line', line,
    'column', "column"
  )
FROM ts_errors
ON CONFLICT (uri) DO NOTHING;

-- Create ERROR_IN_FILE edges
INSERT INTO kg_edges (from_id, to_id, type, evidence)
SELECT
  (SELECT id FROM kg_nodes WHERE uri = 'err:' || e.code || ':' || e.path || ':' || e.line || ':' || e."column"),
  (SELECT id FROM kg_nodes WHERE uri = 'file:' || e.path),
  'ERROR_IN_FILE',
  jsonb_build_object('line', e.line, 'column', e."column", 'message', e.message)
FROM ts_errors e
ON CONFLICT (from_id, to_id, type) DO NOTHING;

COMMENT ON TABLE kg_nodes IS 'Phase 89: Unified knowledge graph nodes (files, errors, symbols, docs, patterns)';
COMMENT ON TABLE kg_edges IS 'Phase 89: Knowledge graph edges with typed relationships and evidence';
COMMENT ON TABLE file_index IS 'Phase 89: AST metadata for codebase files (exports, imports, hash)';
COMMENT ON TABLE fix_patterns IS 'Phase 89: Known error fix patterns with embeddings';
COMMENT ON FUNCTION expand_graph IS 'Phase 89: KAG traversal - expand graph from seed nodes with configurable depth';
