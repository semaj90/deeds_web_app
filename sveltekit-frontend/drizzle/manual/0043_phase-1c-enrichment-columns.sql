-- Phase 1c: Add Enrichment Columns to atlas_codebase_packets
-- Purpose: Store higher-hop enrichment fields (somCluster, glyphRecord, qdrantHit, redisHotKey, neo4jNode)
-- Dependencies: atlas_codebase_packets exists (Phase 1a/1b)
-- Backfill: populate via phase-1c-backfill-*.mjs scripts

ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS som_cluster_bmu_row INTEGER;
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS som_cluster_bmu_col INTEGER;

-- glyphRecord: metadata from Phase 2a (atlas_svg_glyphs)
-- Stores glyph_name, color, complexity, etc. for quick UI rendering
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS glyph_record JSONB;

-- qdrant_hit: best Qdrant match metadata
-- Stores {point_id, distance, payload_hash} for canonical vector link
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS qdrant_hit JSONB;

-- redis_hot_key: Redis cache path if packet is frequently accessed
-- Stores {key: "bifrost:packet:...", ttl: 300, hit_count: N}
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS redis_hot_key JSONB;

-- neo4j_node: Neo4j graph node reference
-- Stores {node_id: "...", degree: N, pagerank: X, concepts: [...]}
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS neo4j_node JSONB;

-- Enrichment metadata: track which enrichment fields are populated
-- {som_cluster: true/false, glyph: true/false, qdrant: true/false, redis: true/false, neo4j: true/false}
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS enrichment_status JSONB DEFAULT '{"som_cluster": false, "glyph": false, "qdrant": false, "redis": false, "neo4j": false}'::jsonb;

-- Last enrichment run timestamp
ALTER TABLE atlas_codebase_packets ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for enrichment lookups
CREATE INDEX IF NOT EXISTS idx_atlas_packets_som_bmu ON atlas_codebase_packets(som_cluster_bmu_row, som_cluster_bmu_col);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_enrichment_status ON atlas_codebase_packets USING GIN(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_enriched_at ON atlas_codebase_packets(enriched_at DESC);

-- Sparse index: only packets with qdrant hits (speeds up lookups for high-cardinality enrichment)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_hit_sparse ON atlas_codebase_packets USING GIN(qdrant_hit) WHERE qdrant_hit IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_packets_neo4j_node_sparse ON atlas_codebase_packets USING GIN(neo4j_node) WHERE neo4j_node IS NOT NULL;
