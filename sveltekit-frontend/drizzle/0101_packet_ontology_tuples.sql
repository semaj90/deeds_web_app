-- Phase 3b: Packet Ontology Tuples
-- Adds rich typed metadata to atlas_packets for multi-vector retrieval

-- 1. Add ontology JSONB column to atlas_packets
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS ontology JSONB
  DEFAULT NULL::jsonb
  CHECK (ontology IS NULL OR jsonb_typeof(ontology) = 'object');

-- 2. Create index on ontology node_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_atlas_packets_ontology_node_type
ON atlas_packets USING GIN (ontology -> 'node_type');

-- 3. Create index on ontology keywords for full-text search
CREATE INDEX IF NOT EXISTS idx_atlas_packets_ontology_keywords
ON atlas_packets USING GIN (ontology -> 'keywords');

-- 4. Create index on ontology calls[] for graph traversal
CREATE INDEX IF NOT EXISTS idx_atlas_packets_ontology_calls
ON atlas_packets USING GIN (ontology -> 'calls');

-- 5. Table: ontology_edges
-- Stores relationships between packets for Neo4j import
CREATE TABLE IF NOT EXISTS ontology_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_packet_key VARCHAR(255) NOT NULL,
  target_packet_key VARCHAR(255) NOT NULL,
  edge_type VARCHAR(50) NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.9 CHECK (confidence >= 0 AND confidence <= 1),
  extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (source_packet_key, target_packet_key, edge_type),
  FOREIGN KEY (source_packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,
  FOREIGN KEY (target_packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ontology_edges_source
ON ontology_edges (source_packet_key);

CREATE INDEX IF NOT EXISTS idx_ontology_edges_target
ON ontology_edges (target_packet_key);

CREATE INDEX IF NOT EXISTS idx_ontology_edges_type
ON ontology_edges (edge_type);

-- 6. Table: packet_vector_bundles
-- Stores all 8 embeddings per packet (after multi-vector enrichment)
CREATE TABLE IF NOT EXISTS packet_vector_bundles (
  packet_key VARCHAR(255) PRIMARY KEY,
  content_vector VECTOR(384) NOT NULL,
  title_vector VECTOR(384),
  summary_vector VECTOR(384),
  keyword_vector VECTOR(384),
  api_vector VECTOR(384),
  topology_vector VECTOR(384),
  latent64_vector VECTOR(64),
  graph_vector VECTOR(384),
  enriched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_packet_vector_bundles_enriched
ON packet_vector_bundles (enriched_at);

-- 7. View: ontology_coverage
-- Tracks enrichment progress
CREATE OR REPLACE VIEW ontology_coverage AS
SELECT
  COUNT(*) FILTER (WHERE ontology IS NOT NULL) AS packets_with_ontology,
  COUNT(*) FILTER (WHERE ontology->'node_type' IS NOT NULL) AS packets_with_node_type,
  COUNT(*) FILTER (WHERE ontology->>'title' IS NOT NULL) AS packets_with_title,
  COUNT(*) FILTER (WHERE ontology->>'summary' IS NOT NULL) AS packets_with_summary,
  COUNT(*) FILTER (WHERE ontology->'keywords' IS NOT NULL AND jsonb_array_length(ontology->'keywords') > 0) AS packets_with_keywords,
  COUNT(*) FILTER (WHERE ontology->'parameters' IS NOT NULL) AS packets_with_parameters,
  COUNT(*) AS total_packets,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ontology IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS enrichment_pct
FROM atlas_packets;

-- 8. View: edge_coverage
-- Tracks relationship extraction
CREATE OR REPLACE VIEW edge_coverage AS
SELECT
  edge_type,
  COUNT(*) AS edge_count,
  COUNT(DISTINCT source_packet_key) AS source_packets,
  COUNT(DISTINCT target_packet_key) AS target_packets,
  ROUND(AVG(confidence), 3) AS avg_confidence
FROM ontology_edges
GROUP BY edge_type
ORDER BY edge_count DESC;

-- 9. Utility: refresh_ontology_coverage
-- Call periodically to update stats
CREATE OR REPLACE FUNCTION refresh_ontology_stats()
RETURNS TABLE (
  packets_with_ontology BIGINT,
  packets_with_node_type BIGINT,
  enrichment_pct NUMERIC,
  edge_count BIGINT,
  edge_types INT
) AS $$
SELECT
  COUNT(*) FILTER (WHERE ontology IS NOT NULL),
  COUNT(*) FILTER (WHERE ontology->'node_type' IS NOT NULL),
  ROUND(100.0 * COUNT(*) FILTER (WHERE ontology IS NOT NULL) / NULLIF(COUNT(*), 0), 2),
  (SELECT COUNT(*) FROM ontology_edges),
  (SELECT COUNT(DISTINCT edge_type) FROM ontology_edges)
FROM atlas_packets;
$$ LANGUAGE SQL;
