-- Phase 20: Packet Metadata + Topology Schema Pass
-- Additive only. No drops. No rewrites of packet identity.

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pagerank real,
  ADD COLUMN IF NOT EXISTS betweenness real,
  ADD COLUMN IF NOT EXISTS eigenvector real,
  ADD COLUMN IF NOT EXISTS neo4j_node_id text,
  ADD COLUMN IF NOT EXISTS redis_centroid_key text;

ALTER TABLE nes_chrom_packets
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pagerank real,
  ADD COLUMN IF NOT EXISTS betweenness real,
  ADD COLUMN IF NOT EXISTS eigenvector real,
  ADD COLUMN IF NOT EXISTS neo4j_node_id text,
  ADD COLUMN IF NOT EXISTS redis_centroid_key text;

ALTER TABLE atlas_feature_packets
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pagerank real,
  ADD COLUMN IF NOT EXISTS betweenness real,
  ADD COLUMN IF NOT EXISTS eigenvector real,
  ADD COLUMN IF NOT EXISTS neo4j_node_id text,
  ADD COLUMN IF NOT EXISTS redis_centroid_key text;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_permissions_gin ON atlas_packets USING gin (permissions);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin ON atlas_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_topology_gin ON atlas_packets USING gin (topology);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_vectors_gin ON atlas_packets USING gin (vectors);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_pagerank ON atlas_packets (pagerank);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_betweenness ON atlas_packets (betweenness);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_eigenvector ON atlas_packets (eigenvector);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_neo4j_node_id ON atlas_packets (neo4j_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_redis_centroid_key ON atlas_packets (redis_centroid_key);

CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_permissions_gin ON nes_chrom_packets USING gin (permissions);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_metadata_gin ON nes_chrom_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_topology_gin ON nes_chrom_packets USING gin (topology);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_vectors_gin ON nes_chrom_packets USING gin (vectors);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_pagerank ON nes_chrom_packets (pagerank);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_betweenness ON nes_chrom_packets (betweenness);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_eigenvector ON nes_chrom_packets (eigenvector);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_neo4j_node_id ON nes_chrom_packets (neo4j_node_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_redis_centroid_key ON nes_chrom_packets (redis_centroid_key);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_permissions ON atlas_feature_packets USING gin (permissions);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_metadata ON atlas_feature_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_topology ON atlas_feature_packets USING gin (topology);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_vectors ON atlas_feature_packets USING gin (vectors);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_pagerank ON atlas_feature_packets (pagerank);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_betweenness ON atlas_feature_packets (betweenness);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_eigenvector ON atlas_feature_packets (eigenvector);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_neo4j_node_id ON atlas_feature_packets (neo4j_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_redis_centroid_key ON atlas_feature_packets (redis_centroid_key);

