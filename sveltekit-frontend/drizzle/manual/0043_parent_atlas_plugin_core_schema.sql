-- Parent Atlas Plugin: Core Schema for Postgres-First Semantic Indexing
-- Created: 2026-06-15 (Session 66 continued)
-- Model: ast-grep/parser → Postgres → Qdrant/Redis/Neo4j mirrors

-- ════════════════════════════════════════════════════════════════════════════
-- LAYER 1: Codebase Packet Identity (Frozen, immutable)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS atlas_codebase_packets (
  packet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_path text NOT NULL,                    -- e.g., "src/lib/server"
  source_ref text NOT NULL UNIQUE,                 -- canonical identity
  file_path text NOT NULL,                         -- absolute path to source
  function_symbol text,                            -- function/class name
  feature_id text,                                 -- logical feature grouping
  feature_label text,                              -- human-readable feature name
  packet_key text UNIQUE,                          -- ace:packet:* or similar

  -- Packet metadata
  packet_type text,                                -- 'function', 'class', 'module', 'type'
  summary text,                                    -- brief description

  -- Mirror references
  qdrant_point_id text,                            -- vector DB point ID
  qdrant_collection text DEFAULT 'codebase_chunks_768',
  redis_key text,                                  -- bifrost:packet:*

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  indexed_at timestamptz,                          -- when packet was last indexed
  verified_at timestamptz,                         -- when lineage was verified

  -- Constraints
  CONSTRAINT packet_identity_unique UNIQUE (directory_path, source_ref, file_path)
);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_codebase_packets(source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id ON atlas_codebase_packets(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_codebase_packets(packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_directory ON atlas_codebase_packets(directory_path);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_indexed_at ON atlas_codebase_packets(indexed_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- LAYER 2: Tree Nodes (Hierarchical Code Structure)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS atlas_tree_nodes (
  tree_node_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES atlas_codebase_packets(packet_id) ON DELETE CASCADE,

  -- Hierarchy
  parent_node_id uuid REFERENCES atlas_tree_nodes(tree_node_id) ON DELETE CASCADE,
  depth int DEFAULT 0,

  -- Structure
  node_label text NOT NULL,                        -- "auth", "db", "api"
  node_type text NOT NULL,                         -- 'directory', 'file', 'function', 'class'
  path text[] DEFAULT ARRAY[]::text[],             -- ['src', 'lib', 'server', 'auth']

  -- Content
  content text,                                    -- AST or summary
  content_hash text,                               -- SHA-256 for dedup

  -- Metrics
  child_count int DEFAULT 0,
  line_count int,
  complexity_score real,

  -- Status
  indexed boolean DEFAULT false,
  verified boolean DEFAULT false,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_parent ON atlas_tree_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_tree_packet ON atlas_tree_nodes(packet_id);
CREATE INDEX IF NOT EXISTS idx_atlas_tree_path ON atlas_tree_nodes USING gin(path);
CREATE INDEX IF NOT EXISTS idx_atlas_tree_depth ON atlas_tree_nodes(depth);
CREATE INDEX IF NOT EXISTS idx_atlas_tree_indexed ON atlas_tree_nodes(indexed);

-- ════════════════════════════════════════════════════════════════════════════
-- LAYER 3: Summary Layers (Semantic Summaries + Metadata)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS atlas_summary_layers (
  summary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES atlas_codebase_packets(packet_id) ON DELETE CASCADE,
  tree_node_id uuid REFERENCES atlas_tree_nodes(tree_node_id) ON DELETE SET NULL,

  -- Summary content
  summary_type text NOT NULL,                      -- 'brief', 'detailed', 'executive'
  summary_text text NOT NULL,
  summary_model text DEFAULT 'gemma4-rotorquant',  -- LLM used for generation

  -- Metadata (flexible JSONB layer)
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Expected keys:
  -- {
  --   "domain": "retrieval|reasoning|inference",
  --   "confidence": 0.85,
  --   "tags": ["async", "error-handling"],
  --   "karpathy_score": 7.2,
  --   "som_cluster": 15,
  --   "grpo_reward_score": 0.72
  -- }

  -- Quality metrics
  token_count int,
  embedding_dim int DEFAULT 768,

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  refreshed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_atlas_summary_packet ON atlas_summary_layers(packet_id);
CREATE INDEX IF NOT EXISTS idx_atlas_summary_type ON atlas_summary_layers(summary_type);
CREATE INDEX IF NOT EXISTS idx_atlas_summary_metadata_gin ON atlas_summary_layers USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_atlas_summary_domain ON atlas_summary_layers USING gin((metadata -> 'domain'));

-- ════════════════════════════════════════════════════════════════════════════
-- LAYER 4: Topology Index (Graph Relationships)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS atlas_topology_index (
  edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_packet_id uuid NOT NULL REFERENCES atlas_codebase_packets(packet_id) ON DELETE CASCADE,
  target_packet_id uuid NOT NULL REFERENCES atlas_codebase_packets(packet_id) ON DELETE CASCADE,

  -- Relationship type
  relation_type text NOT NULL,                     -- 'imports', 'calls', 'uses', 'extends'
  relation_strength real DEFAULT 1.0,              -- 0.0 - 1.0 confidence

  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Expected keys: {"bidirectional": true, "cyclic": false, "hops": 1, "som_adjacent": true}

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_atlas_topo_source ON atlas_topology_index(source_packet_id);
CREATE INDEX IF NOT EXISTS idx_atlas_topo_target ON atlas_topology_index(target_packet_id);
CREATE INDEX IF NOT EXISTS idx_atlas_topo_relation ON atlas_topology_index(relation_type);
CREATE INDEX IF NOT EXISTS idx_atlas_topo_strength ON atlas_topology_index(relation_strength DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_topo_metadata_gin ON atlas_topology_index USING gin(metadata);

-- ════════════════════════════════════════════════════════════════════════════
-- VIEWS: Common Query Patterns
-- ════════════════════════════════════════════════════════════════════════════

-- Unified packet view with all context
CREATE OR REPLACE VIEW v_atlas_packets_enriched AS
SELECT
  p.packet_id,
  p.source_ref,
  p.packet_key,
  p.feature_id,
  p.feature_label,
  p.directory_path,
  p.file_path,
  t.node_label,
  t.node_type,
  s.summary_text,
  s.summary_type,
  s.metadata,
  p.indexed_at,
  p.verified_at,
  COUNT(DISTINCT rel.edge_id) as relation_count
FROM atlas_codebase_packets p
LEFT JOIN atlas_tree_nodes t ON p.packet_id = t.packet_id
LEFT JOIN atlas_summary_layers s ON p.packet_id = s.packet_id
LEFT JOIN atlas_topology_index rel ON p.packet_id = rel.source_packet_id
GROUP BY p.packet_id, t.tree_node_id, s.summary_id;

-- Unindexed packets (work queue for next backfill)
CREATE OR REPLACE VIEW v_atlas_backfill_queue AS
SELECT
  p.packet_id,
  p.source_ref,
  p.packet_key,
  p.feature_id,
  COUNT(DISTINCT t.tree_node_id) as tree_nodes,
  COUNT(DISTINCT s.summary_id) as summaries,
  COUNT(DISTINCT rel.edge_id) as relations
FROM atlas_codebase_packets p
LEFT JOIN atlas_tree_nodes t ON p.packet_id = t.packet_id
LEFT JOIN atlas_summary_layers s ON p.packet_id = s.packet_id
LEFT JOIN atlas_topology_index rel ON p.packet_id = rel.source_packet_id
WHERE p.indexed_at IS NULL
GROUP BY p.packet_id
ORDER BY p.created_at ASC;

-- ════════════════════════════════════════════════════════════════════════════
-- AUDIT: Verify schema is live
-- ════════════════════════════════════════════════════════════════════════════

-- Run this to verify:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'atlas_%'
-- ORDER BY table_name;
