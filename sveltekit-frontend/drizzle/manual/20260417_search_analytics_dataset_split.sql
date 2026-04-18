-- Search Analytics: add dataset_split to qlora_examples + ensure all analytics tables exist
-- Safe: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS throughout
-- Run: psql $DATABASE_URL -f drizzle/manual/20260417_search_analytics_dataset_split.sql

-- ── 1. dataset_split column on qlora_examples ─────────────────────────────────
-- Stratified 80/10/10 split. Frozen after first assignment (P4-C).
ALTER TABLE qlora_examples
    ADD COLUMN IF NOT EXISTS dataset_split VARCHAR(10) DEFAULT NULL;

-- ── 2. Ensure response_feedback table exists ──────────────────────────────────
-- Created by feedback API on first use, but make it schema-tracked.
CREATE TABLE IF NOT EXISTS response_feedback (
    id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    query_hash   TEXT         NOT NULL,
    user_id      UUID,
    rating       VARCHAR(4)   NOT NULL,   -- 'up' | 'down'
    pipeline     TEXT,
    chunk_ids    TEXT[],
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS response_feedback_hash_user_idx
    ON response_feedback (query_hash, user_id);

CREATE INDEX IF NOT EXISTS response_feedback_hash_idx
    ON response_feedback (query_hash);

-- ── 3. Ensure chunk_hit_log table exists ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunk_hit_log (
    id             BIGSERIAL    PRIMARY KEY,
    chunk_id       TEXT         NOT NULL,
    relative_path  TEXT         NOT NULL DEFAULT '',
    gpu_cluster    INTEGER,
    som_cluster    INTEGER,
    pipeline       TEXT         NOT NULL,
    query_hash     VARCHAR(16)  NOT NULL,
    score          REAL,
    rerank_score   REAL,
    user_id        UUID,
    case_id        UUID,
    hit_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chunk_hit_pipeline_cluster_idx
    ON chunk_hit_log (pipeline, gpu_cluster, hit_at);

CREATE INDEX IF NOT EXISTS chunk_hit_query_hash_idx
    ON chunk_hit_log (query_hash, hit_at);

-- ── 4. Ensure rag_query_log table exists ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_query_log (
    id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID,
    case_id             UUID,
    query               TEXT         NOT NULL,
    query_hash          VARCHAR(16)  NOT NULL,
    entity_statutes     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    entity_cases        JSONB        NOT NULL DEFAULT '[]'::jsonb,
    total_entity_tags   INTEGER      NOT NULL DEFAULT 0,
    total_found         INTEGER      NOT NULL DEFAULT 0,
    search_time_ms      INTEGER,
    rerank_time_ms      INTEGER,
    rerank_l0_hit       BOOLEAN      NOT NULL DEFAULT false,
    rerank_l1_hits      INTEGER      NOT NULL DEFAULT 0,
    rerank_fresh_scored INTEGER      NOT NULL DEFAULT 0,
    top_chunk_id        VARCHAR(255),
    top_chunk_score     REAL,
    top_rerank_score    REAL,
    dag_enabled         BOOLEAN      NOT NULL DEFAULT true,
    dag_status          VARCHAR(20),
    hybrid_search       BOOLEAN      NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rag_query_log_user_created_idx
    ON rag_query_log (user_id, created_at);

CREATE INDEX IF NOT EXISTS rag_query_log_hash_idx
    ON rag_query_log (query_hash);

-- ── 5. Ensure query_variance_pairs table exists ───────────────────────────────
CREATE TABLE IF NOT EXISTS query_variance_pairs (
    id             BIGSERIAL    PRIMARY KEY,
    query_hash_a   VARCHAR(16)  NOT NULL,
    query_hash_b   VARCHAR(16)  NOT NULL,
    query_a        TEXT         NOT NULL,
    query_b        TEXT         NOT NULL,
    similarity     REAL         NOT NULL,
    hit_count      INTEGER      NOT NULL DEFAULT 1,
    pipeline       TEXT,
    last_seen      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS query_variance_pairs_pair_idx
    ON query_variance_pairs (
        LEAST(query_hash_a, query_hash_b),
        GREATEST(query_hash_a, query_hash_b)
    );

CREATE INDEX IF NOT EXISTS query_variance_pairs_a_idx
    ON query_variance_pairs (query_hash_a);
