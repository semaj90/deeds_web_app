-- P1 Phase 2A: Tree Nodes Table
-- Document/page/section/file/chunk hierarchy for PageIndex extraction
-- Created: June 15, 2026

CREATE TABLE IF NOT EXISTS atlas_tree_nodes (
  node_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255),
  source_ref      VARCHAR(512),

  parent_id       UUID,
  root_id         UUID,
  depth           INT DEFAULT 0,
  node_type       VARCHAR(50),
  label           TEXT,

  start_offset    INT,
  end_offset      INT,
  text_preview    TEXT,

  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (parent_id) REFERENCES atlas_tree_nodes(node_id) ON DELETE CASCADE,
  UNIQUE(packet_key, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_tree_packet_key ON atlas_tree_nodes(packet_key);
CREATE INDEX IF NOT EXISTS idx_tree_parent ON atlas_tree_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_tree_root ON atlas_tree_nodes(root_id);
CREATE INDEX IF NOT EXISTS idx_tree_type ON atlas_tree_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_tree_depth ON atlas_tree_nodes(depth);
CREATE INDEX IF NOT EXISTS idx_tree_source_ref ON atlas_tree_nodes(source_ref);
