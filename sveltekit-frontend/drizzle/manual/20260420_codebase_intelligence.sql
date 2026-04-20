-- 20260420_codebase_intelligence.sql
-- Codebase intelligence persistence layer: code_repos, enrichment_jobs,
-- repo_id FK on codebase_chunk_index, ivfflat summary-embedding index.
--
-- Prerequisite: 0016_codeintel_schema.sql must already be applied
--   (adds domain/language/extension/semantic_tags/metadata to
--    codebase_chunk_index, and creates cluster_summaries / llm_outputs /
--    llm_output_chunks).
--
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. code_repos — canonical repo registry
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS code_repos (
  repo_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  branch      text,
  commit_sha  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Insert a default "local" repo so existing rows can reference it
INSERT INTO code_repos (repo_id, name, branch, metadata)
  VALUES ('00000000-0000-0000-0000-000000000001', 'local', 'main', '{"auto_created":true}'::jsonb)
  ON CONFLICT (repo_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. codebase_chunk_index — add repo_id FK + neo4j_gpu_cluster + ivfflat index
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS repo_id           uuid
    REFERENCES code_repos(repo_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS neo4j_gpu_cluster int,
  ADD COLUMN IF NOT EXISTS content_hash      text,
  ADD COLUMN IF NOT EXISTS token_count       int;

-- Backfill existing rows to the default repo
UPDATE codebase_chunk_index
SET repo_id = '00000000-0000-0000-0000-000000000001'
WHERE repo_id IS NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_repo_id
  ON codebase_chunk_index (repo_id);

CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_neo4j_gpu_cluster
  ON codebase_chunk_index (neo4j_gpu_cluster);

-- ivfflat cosine index for summary_embedding ANN search
-- Note: requires pgvector 0.5+. summary_embedding vector(768) is added by
-- 0016_codeintel_schema.sql. Skipped gracefully if column not yet present.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'codebase_chunk_index' AND column_name = 'summary_embedding'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_codebase_chunk_index_summary_ivfflat'
    ) THEN
      EXECUTE 'CREATE INDEX idx_codebase_chunk_index_summary_ivfflat
        ON codebase_chunk_index USING ivfflat (summary_embedding vector_cosine_ops)
        WITH (lists = 100)';
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. enrichment_jobs — durable progress tracking for batch workers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrichment_jobs (
  job_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id          uuid REFERENCES code_repos(repo_id) ON DELETE SET NULL,
  job_type         text NOT NULL,  -- qdrant_mirror | gpu_cluster | cluster_summary
  status           text NOT NULL DEFAULT 'queued',  -- queued | running | completed | failed
  cursor           text,
  total_processed  int NOT NULL DEFAULT 0,
  total_upserted   int NOT NULL DEFAULT 0,
  total_failed     int NOT NULL DEFAULT 0,
  started_at       timestamptz,
  finished_at      timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error            jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status
  ON enrichment_jobs (status);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_job_type
  ON enrichment_jobs (job_type);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_repo_id
  ON enrichment_jobs (repo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cluster_summaries — add repo_id FK backfill (existing rows use text field)
-- ─────────────────────────────────────────────────────────────────────────────

-- cluster_summaries.repo_id is currently text NOT NULL DEFAULT 'default'.
-- We leave the schema as-is for backward compat; the batch worker writes
-- the UUID as a text string when using the new schema.
-- Nothing to change here.

COMMIT;
