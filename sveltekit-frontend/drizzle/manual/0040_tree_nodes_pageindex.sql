-- 0040_tree_nodes_pageindex.sql
--
-- Extends atlas_packets with PageIndex-style tree node structure.
-- Preserves document hierarchy (document → page → section → chunk).
-- Enables multi-step reasoning across document sections.
--
-- Created: June 14, 2026
-- Status: Manual migration (run with: psql ... < 0040_tree_nodes_pageindex.sql)

-- ────────────────────────────────────────────────────────────────────
-- Table 1: Tree nodes (document hierarchy)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_tree_nodes (
  node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES atlas_tree_nodes(node_id) ON DELETE CASCADE,
  root_id UUID NOT NULL,

  -- Tree structure & navigation
  page_index_path VARCHAR(500) NOT NULL,     -- "doc:123/page:5/section:2/chunk:8"
  node_type VARCHAR(50) NOT NULL,            -- 'document'|'page'|'section'|'subsection'|'chunk'
  tree_depth INT NOT NULL DEFAULT 0,         -- 0=document, 1=page, 2=section, ..., N=chunk

  -- Content identity (align with atlas_packets)
  source_ref VARCHAR(500) NOT NULL,          -- canonical file path
  file_path VARCHAR(1000) NOT NULL,          -- full file path
  file_url VARCHAR(1000),                    -- S3/SeaweedFS URL
  packet_key VARCHAR(500),                   -- atlas identity (if chunk level)
  feature_id VARCHAR(255),                   -- semantic feature (nullable)

  -- Content summary
  title TEXT,                                -- node title/heading
  summary TEXT,                              -- 100-300 char summary
  content_preview TEXT,                      -- first 500 chars
  page_start INT,                            -- start page (for pagination)
  page_end INT,                              -- end page

  -- Enrichment
  keywords TEXT[],                           -- extracted keywords
  tags TEXT[],                               -- semantic tags
  ontology JSONB,                            -- domain ontology mapping
  domain VARCHAR(255),                       -- semantic domain
  som_cluster INT,                           -- SOM grid cell
  community_id INT,                          -- community partition

  -- Lineage & metadata
  metadata JSONB DEFAULT '{}'::jsonb,        -- flexible metadata envelope
  ledger_type VARCHAR(50) DEFAULT 'canonical', -- 'canonical'|'legacy'|'synthetic'
  lineage_version VARCHAR(50) DEFAULT 'tree-nodes-v1',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_tree_path CHECK (page_index_path LIKE 'doc:%'),
  CONSTRAINT parent_depth_consistency CHECK (
    (parent_id IS NULL AND tree_depth = 0) OR
    (parent_id IS NOT NULL AND tree_depth > 0)
  ),
  CONSTRAINT valid_node_type CHECK (
    node_type IN ('document', 'page', 'section', 'subsection', 'chunk')
  ),
  CONSTRAINT valid_ledger_type CHECK (
    ledger_type IN ('canonical', 'legacy', 'synthetic')
  )
);

-- Table 2: Extend atlas_packets with tree node reference
-- (Alters existing table; adds new column)

ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS tree_node_id UUID REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────
-- Indexes: Identity & tree navigation
-- ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_source_ref
  ON atlas_tree_nodes(source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_packet_key
  ON atlas_tree_nodes(packet_key);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_feature_id
  ON atlas_tree_nodes(feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_parent_id
  ON atlas_tree_nodes(parent_id);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_root_id
  ON atlas_tree_nodes(root_id);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_page_index_path
  ON atlas_tree_nodes(page_index_path);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_file_path
  ON atlas_tree_nodes(file_path);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_node_type
  ON atlas_tree_nodes(node_type);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_tree_depth
  ON atlas_tree_nodes(tree_depth);

-- ────────────────────────────────────────────────────────────────────
-- Indexes: Enrichment & search
-- ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_som_community
  ON atlas_tree_nodes(som_cluster, community_id);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_domain
  ON atlas_tree_nodes(domain, title);

-- ────────────────────────────────────────────────────────────────────
-- GIN Indexes: Full-text & flexible metadata search
-- ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_tags_gin
  ON atlas_tree_nodes USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_keywords_gin
  ON atlas_tree_nodes USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_metadata_gin
  ON atlas_tree_nodes USING GIN(metadata);

-- ────────────────────────────────────────────────────────────────────
-- Expression Indexes: Hot metadata keys (direct access)
-- ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_qdrant_collection
  ON atlas_tree_nodes((metadata->>'qdrant_collection'));

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_neo4j_node_id
  ON atlas_tree_nodes((metadata->>'neo4j_node_id'));

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_server_path
  ON atlas_tree_nodes((metadata->>'server_path'));

CREATE INDEX IF NOT EXISTS idx_atlas_tree_nodes_package_name
  ON atlas_tree_nodes((metadata->>'package_name'));

-- ────────────────────────────────────────────────────────────────────
-- Index on atlas_packets for tree node linking
-- ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_packets_tree_node_id
  ON atlas_packets(tree_node_id);

-- ────────────────────────────────────────────────────────────────────
-- Helper view: Tree ancestry (query parent chain)
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW atlas_tree_ancestry AS
WITH RECURSIVE ancestors AS (
  SELECT
    node_id, parent_id, root_id, page_index_path, node_type, title,
    ARRAY[node_id] AS ancestor_path,
    tree_depth
  FROM atlas_tree_nodes

  UNION ALL

  SELECT
    a.node_id, n.parent_id, n.root_id, n.page_index_path, n.node_type, n.title,
    a.ancestor_path || n.node_id,
    n.tree_depth
  FROM ancestors a
  JOIN atlas_tree_nodes n ON a.parent_id = n.node_id
  WHERE a.tree_depth > 0
)
SELECT
  node_id, parent_id, root_id, page_index_path, node_type, title,
  ancestor_path, tree_depth, array_length(ancestor_path, 1) AS depth_from_leaf
FROM ancestors;

-- ────────────────────────────────────────────────────────────────────
-- Helper view: Direct children (query subtrees)
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW atlas_tree_children AS
SELECT
  parent.node_id AS parent_node_id,
  parent.page_index_path AS parent_path,
  parent.title AS parent_title,
  COUNT(child.node_id) AS child_count,
  array_agg(
    json_build_object(
      'node_id', child.node_id,
      'node_type', child.node_type,
      'title', child.title,
      'page_index_path', child.page_index_path
    )
  ) AS children
FROM atlas_tree_nodes parent
LEFT JOIN atlas_tree_nodes child ON child.parent_id = parent.node_id
GROUP BY parent.node_id, parent.page_index_path, parent.title;

-- ────────────────────────────────────────────────────────────────────
-- Grant permissions
-- ────────────────────────────────────────────────────────────────────

GRANT SELECT ON atlas_tree_nodes TO legal_ai_user;
GRANT SELECT ON atlas_tree_ancestry TO legal_ai_user;
GRANT SELECT ON atlas_tree_children TO legal_ai_user;

-- ────────────────────────────────────────────────────────────────────
-- Verification
-- ────────────────────────────────────────────────────────────────────

-- Run this to verify the migration:
-- SELECT
--   COUNT(*) AS total_tree_nodes,
--   COUNT(DISTINCT root_id) AS document_count,
--   COUNT(CASE WHEN node_type = 'chunk' THEN 1 END) AS chunk_nodes,
--   COUNT(CASE WHEN node_type = 'section' THEN 1 END) AS section_nodes
-- FROM atlas_tree_nodes;
