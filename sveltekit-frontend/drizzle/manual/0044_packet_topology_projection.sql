-- Packet Topology Projection Table (Secondary Index for Fast Neighborhood Lookup)
-- Enables: SOM grid queries, community clustering, 4D manifold reranking
-- Indexed for parallel retrieval, spatial queries, and fast neighbor expansion

CREATE TABLE IF NOT EXISTS packet_topology_projection (
  -- Primary identity (normalized to atlas_packets)
  packet_key text PRIMARY KEY REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,

  -- Canonical identity fields (denormalized for JOIN efficiency)
  feature_id text NOT NULL,
  source_ref text,
  domain text,

  -- Cluster assignments (K-Means, SOM, community)
  cluster_key text,                     -- domain + ':' + cluster_id
  cluster_id integer,                   -- K-Means cluster (0-399 for 20x20 grid)
  kmeans_cluster integer,               -- Redundant backup (for ordering in analytics)
  som_cluster integer,                  -- SOM cell assignment (0-399)
  som_row integer,                      -- SOM grid row (0-19)
  som_col integer,                      -- SOM grid col (0-19)

  -- Graph topology
  community_id text,                    -- Louvain/Leiden community
  topology_label text,                  -- database/source/utility/test/config
  ontology_label text,                  -- normalized feature family

  -- 4D Manifold Coordinates (for Karpathy reranking)
  manifold_x double precision,          -- semantic similarity (0-1)
  manifold_y double precision,          -- graph authority (PageRank normalized)
  manifold_z double precision,          -- recency / lifecycle depth (0-1)
  manifold_w double precision,          -- confidence blend score (0-1)

  -- Cross-store pointers (for validation)
  qdrant_point_id text,                 -- Point ID in codebase_chunks_768
  qdrant_joinable boolean DEFAULT false,-- True if point_id is in Qdrant
  redis_hot_key text,                   -- bifrost:packet:{packet_key}
  neo4j_node_key text,                  -- Neo4j node identifier

  -- Metadata envelope
  metadata jsonb DEFAULT '{}'::jsonb,   -- Flexible metadata store

  -- Audit timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT ptp_identity_not_null CHECK (packet_key IS NOT NULL AND feature_id IS NOT NULL),
  CONSTRAINT ptp_som_bounds CHECK (som_row BETWEEN 0 AND 19 AND som_col BETWEEN 0 AND 19),
  CONSTRAINT ptp_manifold_bounds CHECK (
    (manifold_x >= 0 AND manifold_x <= 1) OR manifold_x IS NULL
  ) AND (
    (manifold_y >= 0 AND manifold_y <= 1) OR manifold_y IS NULL
  ) AND (
    (manifold_z >= 0 AND manifold_z <= 1) OR manifold_z IS NULL
  ) AND (
    (manifold_w >= 0 AND manifold_w <= 1) OR manifold_w IS NULL
  )
);

-- B-Tree Indexes: Exact lookup, sorting, range queries
-- Used for: "Give me all packets in cluster X", "Find packets in SOM cell (2,7)", "Search by domain"

CREATE INDEX IF NOT EXISTS idx_ptp_feature_id
ON packet_topology_projection (feature_id ASC);
COMMENT ON INDEX idx_ptp_feature_id IS 'Fast feature_id grouping; used for feature-scoped reranking';

CREATE INDEX IF NOT EXISTS idx_ptp_domain
ON packet_topology_projection (domain ASC);
COMMENT ON INDEX idx_ptp_domain IS 'Fast domain filtering; separates source/test/config/utility retrieval';

CREATE INDEX IF NOT EXISTS idx_ptp_cluster
ON packet_topology_projection (cluster_id ASC, som_row ASC, som_col ASC);
COMMENT ON INDEX idx_ptp_cluster IS 'Compound index for SOM grid lookup and cluster membership (primary access pattern)';

CREATE INDEX IF NOT EXISTS idx_ptp_som_grid
ON packet_topology_projection (som_row ASC, som_col ASC);
COMMENT ON INDEX idx_ptp_som_grid IS 'SOM grid spatial queries; enables "find neighbors of (2,7)"';

CREATE INDEX IF NOT EXISTS idx_ptp_community
ON packet_topology_projection (community_id ASC);
COMMENT ON INDEX idx_ptp_community IS 'Community clustering; fast Louvain community expansion';

CREATE INDEX IF NOT EXISTS idx_ptp_topology_label
ON packet_topology_projection (topology_label ASC);
COMMENT ON INDEX idx_ptp_topology_label IS 'Filter by topology type (database/source/utility/test/config)';

CREATE INDEX IF NOT EXISTS idx_ptp_qdrant_point
ON packet_topology_projection (qdrant_point_id ASC) WHERE qdrant_joinable = true;
COMMENT ON INDEX idx_ptp_qdrant_point IS 'Partial index for Qdrant-joinable points; used for cross-store validation';

-- GIN Index: Flexible JSONB metadata containment
-- Used for: "Find packets where metadata.qdrant_coarse_feature = 'database'"

CREATE INDEX IF NOT EXISTS idx_ptp_metadata_gin
ON packet_topology_projection USING gin (metadata);
COMMENT ON INDEX idx_ptp_metadata_gin IS 'JSONB flexible metadata queries; enables arbitrary property search';

-- Compound Index: Manifold coordinates + cluster for reranking
-- Used for: "Top-10 by blend score within cluster X"

CREATE INDEX IF NOT EXISTS idx_ptp_manifold_blend_cluster
ON packet_topology_projection (cluster_id ASC, manifold_w DESC)
WHERE manifold_w IS NOT NULL;
COMMENT ON INDEX idx_ptp_manifold_blend_cluster IS 'Karpathy blend reranking within cluster; ordered by confidence DESC for fast top-K';

-- Compound Index: Fast neighborhood search in SOM grid
-- Used for: "Expand SOM neighborhood (row ±1, col ±1) around (2,7)"

CREATE INDEX IF NOT EXISTS idx_ptp_som_neighborhood
ON packet_topology_projection (
  som_row ASC, som_col ASC,
  manifold_w DESC NULLS LAST  -- Order by confidence within neighborhood
)
WHERE som_row IS NOT NULL AND som_col IS NOT NULL;
COMMENT ON INDEX idx_ptp_som_neighborhood IS 'SOM neighborhood expansion with blend ordering; O(1) lookup + O(9) neighborhood scan';

-- Audit Index: Fast UPDATE/INSERT performance
-- Used for: Bulk update of topology fields

CREATE INDEX IF NOT EXISTS idx_ptp_updated_at
ON packet_topology_projection (updated_at DESC);
COMMENT ON INDEX idx_ptp_updated_at IS 'Audit trail; find recently updated packets';

-- Stats: Estimate query costs before full execution
ANALYZE packet_topology_projection;

-- View: Fast Packet Topology Summary (for dashboard/monitoring)
CREATE OR REPLACE VIEW packet_topology_summary AS
SELECT
  COUNT(*) as total_packets,
  COUNT(DISTINCT cluster_id) as unique_clusters,
  COUNT(DISTINCT community_id) as unique_communities,
  COUNT(CASE WHEN qdrant_joinable = true THEN 1 END) as qdrant_joinable_count,
  COUNT(CASE WHEN manifold_w IS NOT NULL THEN 1 END) as scored_packets,
  AVG(CASE WHEN manifold_w IS NOT NULL THEN manifold_w ELSE NULL END) as avg_blend_score,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY manifold_w) FILTER (WHERE manifold_w IS NOT NULL) as p95_blend_score
FROM packet_topology_projection;

COMMENT ON VIEW packet_topology_summary IS 'Real-time packet topology health check; use for dashboards and validation gates';
