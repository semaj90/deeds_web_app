-- Session 105: GIN indexes for array columns (concept_ids, used_concepts)
-- These enable fast filtering on array membership: WHERE concept_ids @> ARRAY['statute']

-- GIN index on atlas_packets.concept_ids (packet-level concepts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_concept_ids_gin
ON atlas_packets USING gin (concept_ids);

-- GIN index on atlas_packet_features.used_concepts (feature-level semantic tags)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_used_concepts_gin
ON atlas_packet_features USING gin (used_concepts);

-- Partial index: packets with tree_node_id populated (for structural queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_tree_node_id_partial
ON atlas_packets (tree_node_id)
WHERE tree_node_id IS NOT NULL;

-- Partial index: packets with page_rank_score (for topology queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_pagerank_partial
ON atlas_packets (page_rank_score)
WHERE page_rank_score IS NOT NULL AND page_rank_score > 0;

-- Partial index: packets with som_cluster (for spatial queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_som_cluster_partial
ON atlas_packets (som_cluster)
WHERE som_cluster IS NOT NULL;