-- 0047: KAG Knowledge Layer Schema
-- Purpose: Knowledge-Augmented Generation (KAG) domain tuples + ontology
-- Created: 2026-06-23 (Session 74)

-- ============================================================================
-- TABLE: kag_knowledge_tuples
-- Description: Extracted domain knowledge facts (from LDR, codebase, graphs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kag_knowledge_tuples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tuple_id varchar(256) UNIQUE NOT NULL,  -- hash(domain + concept + source)
  domain_class varchar(50) NOT NULL,       -- auth, infra, topology, legal, etc.
  concept varchar(200) NOT NULL,           -- SOM_GRID, PAGERANK, DEPENDENCY_PATH
  description text NOT NULL,               -- one-line explanation
  source_type varchar(20) NOT NULL,        -- ldr, codebase, graph, manual
  source_ref varchar(256),                 -- ldr:12345 or packet_key
  confidence numeric(3, 2) NOT NULL,       -- 0.00-1.00
  semantic_embedding vector(768),          -- embedding for similarity search

  -- Ontology hierarchy
  parent_concept varchar(200),             -- parent in concept hierarchy
  child_concepts text[],                   -- child concept IDs (array of varchar)

  -- Examples
  code_examples text[],                    -- ["src/...", "src/..."]
  query_examples text[],                   -- ["how to...", "find..."]

  -- Timestamps
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  refreshed_at timestamp with time zone DEFAULT now() NOT NULL,

  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_kag_domain_class ON kag_knowledge_tuples(domain_class);
CREATE INDEX idx_kag_concept ON kag_knowledge_tuples(concept);
CREATE INDEX idx_kag_source_ref ON kag_knowledge_tuples(source_ref);
CREATE INDEX idx_kag_confidence ON kag_knowledge_tuples(confidence DESC);
CREATE INDEX idx_kag_parent_concept ON kag_knowledge_tuples(parent_concept);
CREATE INDEX idx_kag_embedding_hnsw ON kag_knowledge_tuples USING hnsw (semantic_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- TABLE: kag_domain_taxonomy
-- Description: Domain class hierarchy + routing hints
-- ============================================================================

CREATE TABLE IF NOT EXISTS kag_domain_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_class varchar(50) UNIQUE NOT NULL,  -- auth, infra, topology, legal
  parent_domain varchar(50),                 -- null for root
  description text,
  example_concepts text[],                  -- ["AUTH_FLOW", "SESSION", ...]

  -- Routing hints for 4D manifold
  prefer_x_axis boolean DEFAULT false,       -- favor dense semantic search
  prefer_y_axis boolean DEFAULT false,       -- favor graph traversal
  prefer_z_axis boolean DEFAULT false,       -- favor SOM topology
  prefer_w_axis boolean DEFAULT false,       -- favor authority ranking

  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_domain_parent ON kag_domain_taxonomy(parent_domain);

-- Initial domain seed
INSERT INTO kag_domain_taxonomy (domain_class, parent_domain, description, prefer_z_axis)
VALUES
  ('topology', NULL, 'Topology, clustering, manifold algorithms', true),
  ('auth', NULL, 'Authentication, session, identity', false),
  ('infra', NULL, 'Infrastructure, caching, storage', false),
  ('legal', NULL, 'Legal documents, statutes, evidence', false),
  ('analysis', NULL, 'Code analysis, AST, symbol resolution', true),
  ('retrieval', NULL, 'Search, ranking, information retrieval', true)
ON CONFLICT (domain_class) DO NOTHING;

-- ============================================================================
-- TABLE: kag_concept_relationships
-- Description: Links between concepts (hierarchical, cross-domain)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kag_concept_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept varchar(200) NOT NULL,
  target_concept varchar(200) NOT NULL,
  relationship_type varchar(50) NOT NULL,  -- parent_of, depends_on, similar_to
  confidence numeric(3, 2) NOT NULL,

  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_concept_source ON kag_concept_relationships(source_concept);
CREATE INDEX idx_concept_target ON kag_concept_relationships(target_concept);
CREATE INDEX idx_concept_type ON kag_concept_relationships(relationship_type);

-- ============================================================================
-- TABLE: kag_ldr_tasks
-- Description: Track LDR (Local Deep Research) knowledge extraction tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS kag_ldr_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar(128) UNIQUE NOT NULL,    -- LDR service task ID
  query varchar(500) NOT NULL,
  domain_target varchar(50),               -- target domain class (topology, auth, etc.)
  status varchar(20) NOT NULL,             -- pending, running, completed, failed

  -- Results
  summary text,
  sources jsonb DEFAULT '{}'::jsonb,      -- [{ title, url, snippet }]
  extracted_tuples uuid[],                -- FK to kag_knowledge_tuples

  -- Timestamps
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,

  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_ldr_status ON kag_ldr_tasks(status);
CREATE INDEX idx_ldr_domain ON kag_ldr_tasks(domain_target);
CREATE INDEX idx_ldr_created ON kag_ldr_tasks(created_at DESC);

-- ============================================================================
-- TABLE: kag_fusion_lane_metrics
-- Description: Track 4D manifold search lane performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS kag_fusion_lane_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash varchar(32) NOT NULL,         -- FNV-1a hash of query
  lane_name varchar(50) NOT NULL,          -- dense_semantic, graph_1hop, etc.

  -- Performance
  latency_ms integer,
  candidate_count integer,
  hit_count integer,
  precision numeric(3, 2),                 -- hit_count / candidate_count
  recall numeric(3, 2),                    -- hit_count / relevant_total

  -- Axis values
  x_cosine numeric(4, 3),
  y_graph integer,
  z_som numeric(4, 2),
  w_authority numeric(4, 3),

  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_fusion_lane ON kag_fusion_lane_metrics(lane_name);
CREATE INDEX idx_fusion_created ON kag_fusion_lane_metrics(created_at DESC);

-- ============================================================================
-- VIEW: kag_concept_explorer
-- Description: Navigate concept hierarchy with parent/child relationships
-- ============================================================================

CREATE OR REPLACE VIEW kag_concept_explorer AS
SELECT
  t.concept,
  t.domain_class,
  t.confidence,
  t.parent_concept,
  COUNT(DISTINCT rel.target_concept) AS child_count,
  STRING_AGG(DISTINCT rel.target_concept, ', ') AS children_list
FROM kag_knowledge_tuples t
LEFT JOIN kag_concept_relationships rel
  ON rel.source_concept = t.concept
  AND rel.relationship_type = 'parent_of'
GROUP BY t.concept, t.domain_class, t.confidence, t.parent_concept;

-- ============================================================================
-- VIEW: kag_domain_heat_map
-- Description: Show which domains have the most knowledge
-- ============================================================================

CREATE OR REPLACE VIEW kag_domain_heat_map AS
SELECT
  domain_class,
  COUNT(*) AS tuple_count,
  AVG(confidence) AS avg_confidence,
  COUNT(DISTINCT source_type) AS source_types,
  MAX(refreshed_at) AS last_updated
FROM kag_knowledge_tuples
GROUP BY domain_class
ORDER BY tuple_count DESC;

-- ============================================================================
-- COMMENT: Seed queries for KAG
-- ============================================================================

-- Extract topology domain knowledge:
-- INSERT INTO kag_ldr_tasks (task_id, query, domain_target, status)
-- VALUES ('ldr-topology-001', 'What are the best algorithms for SOM grids, k-means clustering, and tricubic interpolation?', 'topology', 'pending');

-- List all concepts in topology domain:
-- SELECT concept, confidence, child_concepts FROM kag_knowledge_tuples WHERE domain_class = 'topology' ORDER BY confidence DESC;

-- Find concept parents:
-- SELECT source_concept, target_concept FROM kag_concept_relationships WHERE relationship_type = 'parent_of' AND source_concept = 'SOM_GRID';
