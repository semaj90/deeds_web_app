-- Phase 2A: Topological Schema Extension
-- Adds K-means clustering columns + topology edges table
-- Safe: all columns have defaults, no destructive operations

-- ============================================================================
-- 1. ALTER atlas_packets TO ADD TOPOLOGY COLUMNS
-- ============================================================================

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS topolog_cluster INT,
  ADD COLUMN IF NOT EXISTS topolog_confidence REAL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS topolog_method TEXT DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS topolog_applied_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Index on topology cluster for fast lookup
CREATE INDEX IF NOT EXISTS idx_atlas_packets_topolog_cluster
  ON atlas_packets (topolog_cluster)
  WHERE topolog_cluster IS NOT NULL;

-- Index on confidence for filtering by quality
CREATE INDEX IF NOT EXISTS idx_atlas_packets_topolog_confidence
  ON atlas_packets (topolog_confidence)
  WHERE topolog_confidence > 0.6;

-- ============================================================================
-- 2. CREATE atlas_topology_clusters TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS atlas_topology_clusters (
  cluster_id INT PRIMARY KEY NOT NULL,
  size INT DEFAULT 0 NOT NULL,
  method TEXT DEFAULT 'kmeans_phase2a' NOT NULL,

  -- Centroid in latent space (64-dim average)
  semantic_center BYTEA NULL,  -- msgpack-encoded Float32Array[64]

  -- Authority scoring
  authority REAL DEFAULT 0.0 NOT NULL,

  -- SOM position (optional, from Phase 3)
  som_row INT NULL,
  som_col INT NULL,
  som_cluster INT NULL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Statistics for cluster quality assessment
  inertia REAL NULL,
  silhouette REAL NULL,
  davies_bouldin REAL NULL
);

COMMENT ON TABLE atlas_topology_clusters IS
  'K-means clustering results attached to AST lexical features. Phase 2A output.';

-- ============================================================================
-- 3. CREATE atlas_topology_edges TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS atlas_topology_edges (
  edge_id BIGSERIAL PRIMARY KEY NOT NULL,

  source_packet_id UUID NOT NULL,
  target_packet_id UUID NOT NULL,

  -- Edge semantics
  edge_type TEXT NOT NULL,  -- BELONGS_TO_TOPOLOGY_CLUSTER, SIMILAR_IN_CLUSTER, etc.
  weight REAL DEFAULT 1.0 NOT NULL,

  -- Provenance
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  method TEXT DEFAULT 'kmeans' NOT NULL,

  CONSTRAINT fk_source FOREIGN KEY (source_packet_id) REFERENCES atlas_packets (packet_id) ON DELETE CASCADE,
  CONSTRAINT fk_target FOREIGN KEY (target_packet_id) REFERENCES atlas_packets (packet_id) ON DELETE CASCADE
);

-- Composite index for fast traversal
CREATE INDEX IF NOT EXISTS idx_topology_edges_source_type
  ON atlas_topology_edges (source_packet_id, edge_type, weight DESC);

CREATE INDEX IF NOT EXISTS idx_topology_edges_target_type
  ON atlas_topology_edges (target_packet_id, edge_type);

-- ============================================================================
-- 4. CREATE atlas_topology_statistics VIEW
-- ============================================================================

CREATE OR REPLACE VIEW atlas_topology_statistics AS
SELECT
  tc.cluster_id,
  tc.method,
  tc.size,
  tc.authority,
  COUNT(DISTINCT ap.packet_id) AS actual_packet_count,
  AVG(ap.topolog_confidence) AS avg_confidence,
  MIN(ap.topolog_confidence) AS min_confidence,
  MAX(ap.topolog_confidence) AS max_confidence,
  tc.created_at,
  tc.updated_at
FROM atlas_topology_clusters tc
LEFT JOIN atlas_packets ap ON ap.topolog_cluster = tc.cluster_id
GROUP BY tc.cluster_id, tc.method, tc.size, tc.authority, tc.created_at, tc.updated_at;

COMMENT ON VIEW atlas_topology_statistics IS
  'Summary statistics for each topology cluster. Used for monitoring Phase 2A completion.';

-- ============================================================================
-- 5. CREATE MATERIALIZED VIEW FOR FAST CLUSTER LOOKUPS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS atlas_topology_cluster_members AS
SELECT
  tc.cluster_id,
  ap.packet_id,
  ap.source_ref,
  ap.feature_id,
  ap.topolog_confidence,
  ap.topolog_applied_at,
  tc.semantic_center,
  tc.som_row,
  tc.som_col
FROM atlas_topology_clusters tc
JOIN atlas_packets ap ON ap.topolog_cluster = tc.cluster_id
ORDER BY tc.cluster_id, ap.topolog_confidence DESC;

CREATE INDEX IF NOT EXISTS idx_topology_cluster_members_cluster
  ON atlas_topology_cluster_members (cluster_id);

COMMENT ON MATERIALIZED VIEW atlas_topology_cluster_members IS
  'Fast lookup of cluster membership. Refresh after Phase 2A bulk updates.';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Refresh cluster statistics
CREATE OR REPLACE FUNCTION refresh_topology_cluster_stats()
RETURNS void AS $$
BEGIN
  -- Update size based on actual packet count
  UPDATE atlas_topology_clusters tc
  SET size = (
    SELECT COUNT(*) FROM atlas_packets ap
    WHERE ap.topolog_cluster = tc.cluster_id
  );

  -- Calculate average confidence per cluster
  -- (can be extended with more metrics)

  RAISE NOTICE 'Topology cluster statistics refreshed';
END;
$$ LANGUAGE plpgsql;

-- Clear topology assignments (for re-running Phase 2A)
CREATE OR REPLACE FUNCTION clear_topology_assignments()
RETURNS TABLE(cleared_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE atlas_packets
  SET topolog_cluster = NULL,
      topolog_confidence = 0.5,
      topolog_method = 'unassigned',
      topolog_applied_at = NULL
  WHERE topolog_method = 'phase_2a_ast_kmeans';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. MIGRATION SCRIPT METADATA
-- ============================================================================

-- Track this migration
CREATE TABLE IF NOT EXISTS schema_migrations_phase2a (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO schema_migrations_phase2a (name)
  VALUES ('topological_schema_extension')
  ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 8. VALIDATION QUERIES (RUN THESE TO VERIFY)
-- ============================================================================

-- Verify columns exist
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'atlas_packets'
--   AND column_name LIKE 'topolog_%'
-- ORDER BY ordinal_position;

-- Check topology cluster coverage
-- SELECT
--   COUNT(*) as total_packets,
--   COUNT(topolog_cluster) as assigned_packets,
--   COUNT(DISTINCT topolog_cluster) as unique_clusters,
--   ROUND(100.0 * COUNT(topolog_cluster) / COUNT(*), 2) as coverage_percent
-- FROM atlas_packets;

-- Cluster size distribution
-- SELECT
--   topolog_cluster,
--   COUNT(*) as size,
--   AVG(topolog_confidence) as avg_confidence,
--   MAX(topolog_confidence) as max_confidence
-- FROM atlas_packets
-- WHERE topolog_cluster IS NOT NULL
-- GROUP BY topolog_cluster
-- ORDER BY size DESC;
