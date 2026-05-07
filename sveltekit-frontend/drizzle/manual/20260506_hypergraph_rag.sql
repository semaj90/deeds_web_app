-- 20260506_hypergraph_rag.sql
-- HyperGraphRAG: n-ary hyperedges connecting retrieval artifacts.
-- Each edge connects query, files, AGENTS.md context, cluster, prior answer, test, etc.
-- Contrast with binary graph edges (SIMILAR_TO, IMPORTS) which connect exactly 2 nodes.

CREATE TABLE IF NOT EXISTS hypergraph_edges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_type       text NOT NULL,          -- 'retrieval', 'fix_attempt', 'test_coverage', 'cluster_context', 'agents_context'
  label           text,                   -- human-readable summary
  query_hash      text,                   -- sha256 of triggering query (nullable for non-query edges)
  run_id          uuid,                   -- groups edges from same ACE run / MCP call
  weight          real NOT NULL DEFAULT 1.0,
  topology        jsonb,                  -- HyperedgeTopology: topo_class, glyph_cluster, manifold4, etc.
  metadata        jsonb,                  -- arbitrary extra fields per edge_type
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hyperedges_edge_type_idx  ON hypergraph_edges (edge_type);
CREATE INDEX IF NOT EXISTS hyperedges_run_id_idx     ON hypergraph_edges (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hyperedges_query_hash_idx ON hypergraph_edges (query_hash) WHERE query_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS hyperedges_created_at_idx ON hypergraph_edges (created_at DESC);
CREATE INDEX IF NOT EXISTS hyperedges_metadata_gin   ON hypergraph_edges USING gin (metadata);
ALTER TABLE hypergraph_edges ADD COLUMN IF NOT EXISTS topology jsonb;
CREATE INDEX IF NOT EXISTS hyperedges_topology_gin   ON hypergraph_edges USING gin (topology);

CREATE TABLE IF NOT EXISTS hypergraph_edge_members (
  id              bigserial PRIMARY KEY,
  edge_id         uuid NOT NULL REFERENCES hypergraph_edges (id) ON DELETE CASCADE,
  member_kind     text NOT NULL,          -- 'query', 'file', 'agents_md', 'cluster', 'prior_answer', 'test', 'chunk', 'neo4j_node'
  member_key      text NOT NULL,          -- stable_key, qdrant_id, redis_key, neo4j_id, etc.
  role            text,                   -- 'source', 'context', 'result', 'constraint', 'evidence'
  score           real,                   -- relevance / confidence for this member in this edge
  payload         jsonb                   -- member-specific metadata snapshot
);

CREATE INDEX IF NOT EXISTS hyperedge_members_edge_idx    ON hypergraph_edge_members (edge_id);
CREATE INDEX IF NOT EXISTS hyperedge_members_kind_idx    ON hypergraph_edge_members (member_kind, member_key);
CREATE INDEX IF NOT EXISTS hyperedge_members_key_idx     ON hypergraph_edge_members (member_key);

-- Fix-attempt linkage: each ops.record_fix_attempt creates a fix_attempt edge
-- that joins file, test, operator_token hash, and prior_answer for full audit trail.
COMMENT ON TABLE hypergraph_edges        IS 'HyperGraphRAG n-ary edges — each row is one retrieval/fix/context event';
COMMENT ON TABLE hypergraph_edge_members IS 'Members of each hyperedge — multiple rows per edge, one per participant';
