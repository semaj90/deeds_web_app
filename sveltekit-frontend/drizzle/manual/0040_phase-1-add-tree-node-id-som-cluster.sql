-- Phase 1: Add tree_node_id and som_cluster columns to atlas_codebase_packets
--
-- Purpose: Enable topology indexing and SOM grid assignment for the full codebase index
--
-- Context:
-- - atlas_codebase_packets: 3,251 packets (full codebase)
-- - atlas_tree_nodes: exists with directory hierarchy
-- - Need to link packets to tree nodes and assign SOM grid coordinates
--
-- Execution: idempotent, safe to re-run
-- Duration: <1s for column creation + sparse indexes

-- Add tree_node_id column (links to atlas_tree_nodes)
ALTER TABLE atlas_codebase_packets
ADD COLUMN IF NOT EXISTS tree_node_id UUID DEFAULT NULL;

-- Add index for tree_node_id (sparse, for topology traversal)
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_tree_node_id
ON atlas_codebase_packets(tree_node_id)
WHERE tree_node_id IS NOT NULL;

-- Add som_cluster column (SOM grid cell assignment, 0-399 for 20x20 grid)
ALTER TABLE atlas_codebase_packets
ADD COLUMN IF NOT EXISTS som_cluster INTEGER DEFAULT NULL;

-- Add index for som_cluster (sparse, for SOM topology lookups)
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_som_cluster
ON atlas_codebase_packets(som_cluster)
WHERE som_cluster IS NOT NULL;

-- Add composite index for topology traversal (tree_node_id + som_cluster)
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_topology
ON atlas_codebase_packets(tree_node_id, som_cluster)
WHERE tree_node_id IS NOT NULL AND som_cluster IS NOT NULL;

-- Backfill tree_node_id: match each packet to its nearest tree_node by source_ref hierarchy
UPDATE atlas_codebase_packets ap
SET tree_node_id = (
  SELECT atn.node_id FROM atlas_tree_nodes atn
  WHERE ap.source_ref LIKE atn.source_ref || '/%'
     OR ap.source_ref = atn.source_ref
  ORDER BY LENGTH(atn.source_ref) DESC
  LIMIT 1
)
WHERE ap.tree_node_id IS NULL
AND ap.source_ref IS NOT NULL;

-- Record: som_cluster is not backfilled here (requires k-means GPU compute)
-- It will be populated in a separate Phase 1b step after GPU k-means completes.

-- Verification queries:
-- SELECT COUNT(*) as total, COUNT(tree_node_id) as filled FROM atlas_codebase_packets;
-- SELECT COUNT(DISTINCT som_cluster) as distinct_clusters FROM atlas_codebase_packets WHERE som_cluster IS NOT NULL;
