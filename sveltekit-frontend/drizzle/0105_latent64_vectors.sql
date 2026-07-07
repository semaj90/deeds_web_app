-- Migration 0105: Add latent64 vector columns for autoencoder routing prefilter
-- Purpose: Store 64-dimensional latent vectors for fast ANN prefiltering
-- Schema: latent_64 vector(64) for Postgres/HNSW, latent64_model metadata, latent64_msgpack for cache

BEGIN;

-- Add latent64 vector column (for Postgres HNSW indexing)
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS latent_64 vector(64);

-- Add model metadata (tracks which autoencoder version)
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS latent64_model text DEFAULT 'packet-autoencoder-768-64';

-- Add metadata envelope (gates, validation status)
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS latent64_meta jsonb DEFAULT '{"gates": {}, "validated_at": null}'::jsonb;

-- Add validation timestamp
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS latent64_validated_at timestamptz DEFAULT NULL;

-- Add compact msgpack encoding for Valkey cache
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS latent64_msgpack bytea DEFAULT NULL;

-- Create GiST index for latent64 vector search (HNSW for ANN)
-- Only index non-null vectors (avoids sparse index bloat)
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_latent64_gist
ON codebase_chunk_index USING gist(latent_64)
WHERE latent_64 IS NOT NULL;

-- Track coverage via materialized view (updated on demand)
-- SELECT COUNT(*) total, COUNT(latent_64) with_latent64 FROM codebase_chunk_index
-- Expected: 100% coverage after backfill

COMMIT;
