-- fixer_memory: GPU-indexed behavior store for the agentic error-fix loop
-- Pairs with schema-postgres.ts fixer_patterns + fixer_run_log tables.
-- Run: psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f drizzle/manual/20260510_fixer_memory.sql

-- 1. fixer_patterns — reusable fix templates keyed by error fingerprint
CREATE TABLE IF NOT EXISTS fixer_patterns (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  error_hash       text        NOT NULL,
  error_code       text,
  fix_template     text        NOT NULL,
  fix_kind         text        NOT NULL DEFAULT 'instruction',
  success_count    int         NOT NULL DEFAULT 0,
  failure_count    int         NOT NULL DEFAULT 0,
  last_verified_at timestamptz,
  qdrant_point_id  text,
  trust_score      real        NOT NULL DEFAULT 0.5,
  top_files        text[]      NOT NULL DEFAULT '{}',
  tags             text[]      NOT NULL DEFAULT '{}',
  embedding        vector(768),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. fixer_run_log — audit log per fix cycle
CREATE TABLE IF NOT EXISTS fixer_run_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            text        NOT NULL,
  error_hash        text        NOT NULL,
  pattern_id        uuid,
  file              text        NOT NULL,
  error_code        text,
  attempt           int         NOT NULL DEFAULT 1,
  outcome           text        NOT NULL,
  lines_changed     int,
  duration_ms       int,
  langfuse_trace_id text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 3. B-tree indexes
CREATE INDEX IF NOT EXISTS fp_error_hash_idx  ON fixer_patterns (error_hash);
CREATE INDEX IF NOT EXISTS fp_error_code_idx  ON fixer_patterns (error_code);
CREATE INDEX IF NOT EXISTS fp_trust_idx       ON fixer_patterns (trust_score DESC);
CREATE INDEX IF NOT EXISTS fp_tags_gin_idx    ON fixer_patterns USING gin (tags);
CREATE INDEX IF NOT EXISTS frl_run_idx        ON fixer_run_log  (run_id);
CREATE INDEX IF NOT EXISTS frl_hash_idx       ON fixer_run_log  (error_hash);
CREATE INDEX IF NOT EXISTS frl_outcome_idx    ON fixer_run_log  (outcome, created_at DESC);

-- 4. HNSW index on embedding for Postgres-side vector search
--    (mirror of Qdrant fixer_memory_768 collection — used for fallback / audit)
CREATE INDEX IF NOT EXISTS fp_embedding_hnsw_idx
  ON fixer_patterns
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. pg_trgm index on fix_template for similarity fallback
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS fp_template_trgm_idx
  ON fixer_patterns
  USING gin (fix_template gin_trgm_ops);
