-- Migration: 0048_topology_vector_storage_lookup.sql
-- Create lookup tables for topology, GDS scores, vector mapping, and centroids

CREATE TABLE IF NOT EXISTS atlas_topology_evidence (
  id SERIAL PRIMARY KEY,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  weight DOUBLE PRECISION DEFAULT 1.0,
  properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_topology_evidence UNIQUE (source_key, target_key, rel_type)
);

CREATE INDEX IF NOT EXISTS idx_topology_evidence_source ON atlas_topology_evidence(source_key);
CREATE INDEX IF NOT EXISTS idx_topology_evidence_target ON atlas_topology_evidence(target_key);

CREATE TABLE IF NOT EXISTS atlas_topology_scores (
  packet_key TEXT PRIMARY KEY,
  pagerank REAL DEFAULT 0.0,
  degree INTEGER DEFAULT 0,
  community_id INTEGER,
  betweenness REAL DEFAULT 0.0,
  eigenvector REAL DEFAULT 0.0,
  score_version TEXT DEFAULT 'gds-v1',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_topology_scores_packet ON atlas_topology_scores(packet_key);
CREATE INDEX IF NOT EXISTS idx_topology_scores_community ON atlas_topology_scores(community_id);

CREATE TABLE IF NOT EXISTS atlas_vector_lookup (
  qdrant_point_id UUID PRIMARY KEY,
  packet_key TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  vector_source TEXT NOT NULL DEFAULT 'gemma4_summary',
  vector_dim INTEGER NOT NULL DEFAULT 768,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_vector_lookup UNIQUE (packet_key, collection_name, vector_source)
);

CREATE INDEX IF NOT EXISTS idx_vector_lookup_packet ON atlas_vector_lookup(packet_key);

CREATE TABLE IF NOT EXISTS atlas_centroid_lookup (
  centroid_id INTEGER PRIMARY KEY,
  kmeans_cluster INTEGER NOT NULL,
  som_row INTEGER NOT NULL,
  som_col INTEGER NOT NULL,
  som_index INTEGER NOT NULL,
  centroid_vector REAL[],
  cluster_label TEXT,
  cluster_size INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_centroid_lookup_cluster ON atlas_centroid_lookup(kmeans_cluster);
