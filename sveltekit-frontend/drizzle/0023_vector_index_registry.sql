-- Step 5: Vector Index Registry table
-- Tracks all vector indexes (Qdrant, TurboVec, K-means, SOM)
-- One row per index type, updated as indexes are rebuilt

CREATE TABLE IF NOT EXISTS vector_index_registry (
  id SERIAL PRIMARY KEY,
  index_name VARCHAR(100) NOT NULL UNIQUE,
  index_type VARCHAR(50) NOT NULL,
  index_backend VARCHAR(50) NOT NULL,
  vector_dimension INT NOT NULL,
  total_points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_validation TIMESTAMP WITH TIME ZONE,
  validation_status VARCHAR(50) DEFAULT 'not_validated',
  config JSONB NOT NULL,
  CHECK (index_type IN ('dense_vector', 'quantized_vector', 'clustering', 'topology'))
);

-- Index types:
-- 1. Qdrant HNSW (dense_vector) — 384-dim, m=16, ef_construct=200
-- 2. TurboVec 4-bit (quantized_vector) — 384→64, prefilter
-- 3. K-means (clustering) — K=32, centroids, assignments
-- 4. SOM (topology) — 20×20 grid, centroids, BMU mapping

INSERT INTO vector_index_registry (
  index_name,
  index_type,
  index_backend,
  vector_dimension,
  config
) VALUES
  (
    'qdrant_codebase_chunks_384',
    'dense_vector',
    'qdrant',
    384,
    '{
      "collection": "codebase_chunks_384",
      "metric": "cosine",
      "index_type": "hnsw",
      "hnsw_config": {
        "m": 16,
        "ef_construct": 200
      },
      "status": "pending_build"
    }'::JSONB
  ),
  (
    'turbovec_quantized_4bit',
    'quantized_vector',
    'turbovec',
    64,
    '{
      "source_dim": 384,
      "target_dim": 64,
      "quantization": "4-bit",
      "prefilter": true,
      "status": "pending_build"
    }'::JSONB
  ),
  (
    'kmeans_k32',
    'clustering',
    'gpu',
    384,
    '{
      "k": 32,
      "init_method": "k-means++",
      "max_iter": 300,
      "convergence_threshold": 0.001,
      "status": "pending_train"
    }'::JSONB
  ),
  (
    'som_20x20',
    'topology',
    'gpu',
    384,
    '{
      "grid_width": 20,
      "grid_height": 20,
      "total_cells": 400,
      "init_method": "pca",
      "learning_rate": 0.5,
      "sigma": 5.0,
      "status": "pending_train"
    }'::JSONB
  )
ON CONFLICT (index_name) DO NOTHING;

-- Update trigger to set updated_at
CREATE OR REPLACE FUNCTION update_vector_index_registry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_vector_index_registry_timestamp ON vector_index_registry;

CREATE TRIGGER update_vector_index_registry_timestamp
BEFORE UPDATE ON vector_index_registry
FOR EACH ROW
EXECUTE FUNCTION update_vector_index_registry_timestamp();
