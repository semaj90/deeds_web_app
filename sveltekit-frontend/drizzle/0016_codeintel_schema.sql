-- 0016_codeintel_schema.sql
-- Codeintel schema: evolve codebase_chunk_index, add cluster_summaries,
-- llm_outputs, llm_output_chunks.
--
-- Safe to run repeatedly (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Evolve codebase_chunk_index — add typed columns, fix tags to text[]
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS domain         varchar(50),
  ADD COLUMN IF NOT EXISTS language        varchar(20),
  ADD COLUMN IF NOT EXISTS extension       varchar(20),
  ADD COLUMN IF NOT EXISTS embedding_model varchar(100),
  ADD COLUMN IF NOT EXISTS summary_model   varchar(100),
  ADD COLUMN IF NOT EXISTS summary         text,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Migrate tags from jsonb to text[] (new column, preserve old)
-- We keep the jsonb "tags" column as-is for backward compat,
-- add "semantic_tags" as proper text[] for array ops + GIN.
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS semantic_tags   text[] NOT NULL DEFAULT '{}';

-- Backfill semantic_tags from jsonb tags where non-empty
UPDATE codebase_chunk_index
SET    semantic_tags = ARRAY(SELECT jsonb_array_elements_text(tags))
WHERE  jsonb_array_length(tags) > 0
  AND  semantic_tags = '{}';

-- Index: domain, language, extension, semantic_tags
CREATE INDEX IF NOT EXISTS codebase_chunk_index_domain_idx
  ON codebase_chunk_index (domain);
CREATE INDEX IF NOT EXISTS codebase_chunk_index_language_idx
  ON codebase_chunk_index (language);
CREATE INDEX IF NOT EXISTS codebase_chunk_index_extension_idx
  ON codebase_chunk_index (extension);
CREATE INDEX IF NOT EXISTS codebase_chunk_index_semantic_tags_gin
  ON codebase_chunk_index USING GIN (semantic_tags);

-- GIN on metadata for flexible key/value lookups
CREATE INDEX IF NOT EXISTS codebase_chunk_index_metadata_gin
  ON codebase_chunk_index USING GIN (metadata jsonb_path_ops);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. cluster_summaries — one row per (repo, cluster) with GPU-derived summary
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cluster_summaries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id                  text NOT NULL DEFAULT 'default',
  gpu_cluster              int NOT NULL,
  summary                  text NOT NULL,
  purpose                  text,
  patterns                 text[],
  warnings                 text[],
  representative_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  member_count             int NOT NULL DEFAULT 0,
  tags                     text[] NOT NULL DEFAULT '{}',
  centroid_distance_mean   real,
  summary_model            varchar(100),
  summary_embedding        vector(768),
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (repo_id, gpu_cluster)
);

CREATE INDEX IF NOT EXISTS cluster_summaries_repo_cluster
  ON cluster_summaries (repo_id, gpu_cluster);
CREATE INDEX IF NOT EXISTS cluster_summaries_tags_gin
  ON cluster_summaries USING GIN (tags);
CREATE INDEX IF NOT EXISTS cluster_summaries_embedding_hnsw
  ON cluster_summaries USING hnsw (summary_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. llm_outputs — each LLM generation tracked with provenance
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_outputs (
  output_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid,
  user_id     int REFERENCES users(id) ON DELETE SET NULL,
  pipeline    varchar(50) NOT NULL DEFAULT 'ace',
  prompt      text NOT NULL,
  response    text NOT NULL,
  model       varchar(100),
  temperature real,
  tokens_in   int,
  tokens_out  int,
  latency_ms  int,
  self_eval   real,                          -- 0.0–1.0 quality score
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_outputs_case_idx
  ON llm_outputs (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS llm_outputs_user_created
  ON llm_outputs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_outputs_pipeline_created
  ON llm_outputs (pipeline, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. llm_output_chunks — 1:N join between LLM outputs and source chunks
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_output_chunks (
  output_id  uuid NOT NULL REFERENCES llm_outputs(output_id) ON DELETE CASCADE,
  chunk_id   uuid NOT NULL REFERENCES codebase_chunk_index(id) ON DELETE CASCADE,
  rank       int NOT NULL,
  score      real,
  role       varchar(30),                    -- evidence, context, citation, support
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,

  PRIMARY KEY (output_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS llm_output_chunks_chunk_idx
  ON llm_output_chunks (chunk_id);

COMMIT;