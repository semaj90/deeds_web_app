-- Migration: Create atlas_feature_packets table
-- Drizzle schema: src/lib/server/db/schema/atlas-feature-packets.ts
-- Date: 2026-07-21
-- Purpose: Canonical feature-level packet storage with identity, topology, and graph metrics

CREATE TABLE IF NOT EXISTS atlas_feature_packets (
  packet_key VARCHAR(255) PRIMARY KEY NOT NULL,
  source_ref VARCHAR(512) NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  feature_label VARCHAR(512) NOT NULL,
  packet_type VARCHAR(50) NOT NULL,
  community_id INTEGER,
  community_source VARCHAR(100),
  community_confidence DOUBLE PRECISION,
  file_path TEXT,
  tree_node_id UUID REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL,
  som_cluster INTEGER,
  permissions JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  topology JSONB NOT NULL DEFAULT '{}',
  vectors JSONB NOT NULL DEFAULT '{}',
  pagerank REAL,
  betweenness REAL,
  eigenvector REAL,
  lineage_version VARCHAR(50) NOT NULL DEFAULT 'packet-identity-v2',
  ledger_type VARCHAR(50) NOT NULL DEFAULT 'atlas:feature',
  neo4j_node_id VARCHAR(255),
  redis_centroid_key VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Identity index: (packet_key, source_ref, feature_id)
CREATE INDEX IF NOT EXISTS atlas_feature_packets_identity_idx
  ON atlas_feature_packets (packet_key, source_ref, feature_id);

-- Single-column lookup indexes
CREATE INDEX IF NOT EXISTS idx_atlas_feature_source_ref
  ON atlas_feature_packets (source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_feature_id
  ON atlas_feature_packets (feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_type
  ON atlas_feature_packets (packet_type);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_lineage
  ON atlas_feature_packets (lineage_version);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_atlas_feature_permissions
  ON atlas_feature_packets USING GIN (permissions);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_metadata
  ON atlas_feature_packets USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_topology
  ON atlas_feature_packets USING GIN (topology);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors
  ON atlas_feature_packets USING GIN (vectors);

-- Graph metric indexes
CREATE INDEX IF NOT EXISTS idx_atlas_feature_pagerank
  ON atlas_feature_packets (pagerank);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_betweenness
  ON atlas_feature_packets (betweenness);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_eigenvector
  ON atlas_feature_packets (eigenvector);

-- Structural indexes
CREATE INDEX IF NOT EXISTS idx_atlas_feature_file_path
  ON atlas_feature_packets (file_path);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_tree_node_id
  ON atlas_feature_packets (tree_node_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_som_cluster
  ON atlas_feature_packets (som_cluster);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_neo4j_node_id
  ON atlas_feature_packets (neo4j_node_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_redis_centroid_key
  ON atlas_feature_packets (redis_centroid_key);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_atlas_feature_feature_source
  ON atlas_feature_packets (feature_id, source_ref);

-- Partial index for SOM/tree topology correlations (both NOT NULL)
CREATE INDEX IF NOT EXISTS idx_atlas_feature_tree_som_cluster
  ON atlas_feature_packets (tree_node_id, som_cluster)
  WHERE tree_node_id IS NOT NULL AND som_cluster IS NOT NULL;
