-- 0016: gpu_cluster_centroids — persistent 768-dim cluster centroid vectors
-- Run: psql $DATABASE_URL -f drizzle/manual/0016_cluster_centroids.sql

CREATE TABLE IF NOT EXISTS gpu_cluster_centroids (
  cluster_id    integer       PRIMARY KEY,
  cluster_type  text          NOT NULL DEFAULT 'gpu',
  centroid_vec  real[]        NOT NULL,
  chunk_count   integer       NOT NULL DEFAULT 0,
  dominant_tags text[]        NOT NULL DEFAULT '{}',
  purpose       text,
  metadata      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  computed_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_cluster_centroids_type
  ON gpu_cluster_centroids (cluster_type);

-- Optional: pgvector HNSW for ANN centroid lookup (requires pgvector extension)
-- Enable with: CREATE EXTENSION IF NOT EXISTS vector;
-- ALTER TABLE gpu_cluster_centroids ADD COLUMN centroid_hv halfvec(768);
-- CREATE INDEX idx_gpu_cluster_centroids_hnsw ON gpu_cluster_centroids
--   USING hnsw (centroid_hv halfvec_cosine_ops) WITH (m=8, ef_construction=32);