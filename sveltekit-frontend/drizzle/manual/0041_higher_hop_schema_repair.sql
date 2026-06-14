-- 0041_higher_hop_schema_repair.sql
--
-- Phase 1 higher-hop schema repair for atlas_feature_packets.
-- Adds the missing lineage columns required by the higher-hop audit:
--   file_path
--   tree_node_id
--   som_cluster
--
-- The migration is additive and idempotent.

ALTER TABLE IF EXISTS atlas_feature_packets
  ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE IF EXISTS atlas_feature_packets
  ADD COLUMN IF NOT EXISTS tree_node_id uuid REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS atlas_feature_packets
  ADD COLUMN IF NOT EXISTS som_cluster integer;

CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_file_path
  ON atlas_feature_packets(file_path);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_tree_node_id
  ON atlas_feature_packets(tree_node_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_som_cluster
  ON atlas_feature_packets(som_cluster);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_packets_tree_node_som_cluster
  ON atlas_feature_packets(tree_node_id, som_cluster)
  WHERE tree_node_id IS NOT NULL AND som_cluster IS NOT NULL;

-- Conservative backfills from existing lineage fields.
WITH feature_file_paths AS (
  SELECT DISTINCT ON (feature_id)
    feature_id,
    file_path
  FROM atlas_codebase_packets
  WHERE file_path IS NOT NULL
    AND feature_id IS NOT NULL
  ORDER BY feature_id, file_path
)
UPDATE atlas_feature_packets fp
SET file_path = COALESCE(fp.file_path, ffp.file_path)
FROM feature_file_paths ffp
WHERE fp.feature_id = ffp.feature_id
  AND fp.file_path IS NULL;

-- Tree-node linkage is retained as a nullable forward link.
-- The current split-ledger evidence does not expose a safe join path yet.
-- Leave tree_node_id NULL until the tree projection lane emits a deterministic mapping.

WITH feature_som_clusters AS (
  SELECT DISTINCT ON (feature_id)
    feature_id,
    NULLIF(regexp_replace(som_cluster, '[^0-9]+', '', 'g'), '')::integer AS som_cluster
  FROM atlas_feature_map
  WHERE feature_id IS NOT NULL
    AND som_cluster IS NOT NULL
  ORDER BY feature_id, CASE WHEN som_cluster ~ '[0-9]' THEN 0 ELSE 1 END, som_cluster
)
UPDATE atlas_feature_packets fp
SET som_cluster = COALESCE(fp.som_cluster, fsc.som_cluster)
FROM feature_som_clusters fsc
WHERE fp.feature_id = fsc.feature_id
  AND fp.som_cluster IS NULL
  AND fsc.som_cluster IS NOT NULL;

-- Verification:
-- SELECT
--   COUNT(*) AS total_rows,
--   COUNT(file_path) AS file_path_rows,
--   COUNT(tree_node_id) AS tree_node_rows,
--   COUNT(som_cluster) AS som_cluster_rows
-- FROM atlas_feature_packets;
