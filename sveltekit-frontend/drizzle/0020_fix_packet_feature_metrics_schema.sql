-- Session 105: Fix atlas_packet_features and atlas_packet_metrics schema
-- Separates extraction (features) from derived metrics (trained models)

-- Step 1: Extend atlas_packet_features with all extraction columns
ALTER TABLE atlas_packet_features
ADD COLUMN IF NOT EXISTS entities text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS identifiers text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS imports text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS exports text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS functions text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS classes text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS routes text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS permissions text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS astgrep_version text,
ADD COLUMN IF NOT EXISTS langextract_version text;

-- Step 2: Rebuild atlas_packet_metrics with correct derived columns
-- (Keep old table data, add new columns)
ALTER TABLE atlas_packet_metrics
DROP COLUMN IF EXISTS feature_density,
DROP COLUMN IF EXISTS complexity_score,
DROP COLUMN IF EXISTS semantic_entropy,
DROP COLUMN IF EXISTS retrieval_relevance,
DROP COLUMN IF EXISTS authority_score,
ADD COLUMN IF NOT EXISTS kmeans_cluster int,
ADD COLUMN IF NOT EXISTS som_row int,
ADD COLUMN IF NOT EXISTS som_col int,
ADD COLUMN IF NOT EXISTS som_cluster text,
ADD COLUMN IF NOT EXISTS page_rank_score real,
ADD COLUMN IF NOT EXISTS graph_community_id int,
ADD COLUMN IF NOT EXISTS k_core_score real,
ADD COLUMN IF NOT EXISTS betweenness_centrality real,
ADD COLUMN IF NOT EXISTS closeness_centrality real,
ADD COLUMN IF NOT EXISTS eigenvector_centrality real,
ADD COLUMN IF NOT EXISTS repair_probability real,
ADD COLUMN IF NOT EXISTS latent64 real[],
ADD COLUMN IF NOT EXISTS manifold4d real[];

-- Step 3: Add missing indexes for retrieval performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_entities_gin
ON atlas_packet_features USING gin (entities);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_imports_gin
ON atlas_packet_features USING gin (imports);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_exports_gin
ON atlas_packet_features USING gin (exports);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_functions_gin
ON atlas_packet_features USING gin (functions);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_metrics_pagerank
ON atlas_packet_metrics (page_rank_score DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_metrics_som_cluster
ON atlas_packet_metrics (som_cluster);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_metrics_kmeans_cluster
ON atlas_packet_metrics (kmeans_cluster);

-- Step 4: Comment on tables for clarity
COMMENT ON TABLE atlas_packet_features IS
  'Extraction layer: append-only features from AST, lexical, semantic analysis. Written by Phase 1-3 extractors.';

COMMENT ON TABLE atlas_packet_metrics IS
  'Derived metrics layer: trained model outputs (latent64, topology, authority). Written by Phase 16 (AE/SOM/GDS).';