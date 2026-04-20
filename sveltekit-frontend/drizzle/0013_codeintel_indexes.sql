-- Migration: code-intel GIN / HNSW / IVFFlat indexes
-- These operator-class indexes cannot be expressed in Drizzle schema definitions.
-- Apply manually: psql $DATABASE_URL -f drizzle/0013_codeintel_indexes.sql

-- Requires pgvector extension (already installed if embeddinggemma vectors exist)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── enrichment_jobs (CREATE if not exists) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  job_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       text,
  job_type      varchar(64)  NOT NULL,
  status        varchar(32)  NOT NULL DEFAULT 'pending',
  cursor        text,
  total_processed  integer NOT NULL DEFAULT 0,
  total_upserted   integer NOT NULL DEFAULT 0,
  total_failed     integer NOT NULL DEFAULT 0,
  started_at    timestamptz,
  finished_at   timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}',
  error         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── codebase_chunk_index: GIN on semantic_tags, jsonb columns ───────────────
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_semantic_tags_gin
  ON codebase_chunk_index USING gin(semantic_tags);

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_tags_gin
  ON codebase_chunk_index USING gin(tags jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_metadata_gin
  ON codebase_chunk_index USING gin(metadata jsonb_path_ops);

-- IVFFlat on summary_embedding (vector) for cluster-level semantic search
-- lists = ceil(sqrt(16626)) ≈ 130; round to 100 for stability
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_summary_embedding_ivfflat
  ON codebase_chunk_index
  USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── cluster_summaries: GIN + IVFFlat ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cluster_summaries_tags_gin
  ON cluster_summaries USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_cluster_summaries_metadata_gin
  ON cluster_summaries USING gin(metadata jsonb_path_ops);

-- IVFFlat on summary_embedding (20 clusters → lists = 5 is fine)
CREATE INDEX IF NOT EXISTS idx_cluster_summaries_embedding_ivfflat
  ON cluster_summaries
  USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = 5);

-- ── enrichment_jobs: plain btree ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status
  ON enrichment_jobs (status);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_job_type
  ON enrichment_jobs (job_type);
