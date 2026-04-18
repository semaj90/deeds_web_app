-- Search Intelligence — QLoRA examples table + analytics query indexes
-- Safe: CREATE TABLE IF NOT EXISTS + CREATE INDEX CONCURRENTLY IF NOT EXISTS
-- Run: psql $DATABASE_URL -f drizzle/manual/search_intelligence.sql

-- ── 1. pg_trgm extension (required for "did you mean" similarity scan) ────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. qlora_examples — QLoRA training dataset (distilled from RAG interactions) ─
CREATE TABLE IF NOT EXISTS qlora_examples (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query_hash       VARCHAR(16)  NOT NULL,
    instruction      TEXT         NOT NULL,
    context_chunks   JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- retrieved chunks as Alpaca input
    graph_summary    TEXT,                                         -- cluster narrative from Redis
    response         TEXT         NOT NULL,                       -- LLM output
    quality_tier     VARCHAR(20),                                  -- 'platinum' | 'gold' | 'silver'
    response_score   REAL,                                         -- ACE self-eval score (0-1)
    avg_rerank_score REAL,                                         -- avg rerank across context chunks
    gpu_clusters     JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- [clusterId, ...]
    pipeline_hits    JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- { rag: 3, kag: 1, ... }
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qlora_examples_query_hash
    ON qlora_examples (query_hash);

CREATE INDEX IF NOT EXISTS idx_qlora_examples_quality
    ON qlora_examples (quality_tier, response_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_qlora_examples_created
    ON qlora_examples (created_at DESC);

-- Prevent duplicate distillation of the same query_hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_qlora_examples_unique_query
    ON qlora_examples (query_hash);

-- ── 3. chunk_hit_log — covering index for Search Intelligence analytics ────────
-- Covers: pipelineMemory, crossPipelineChamps, trendingQueries, clusterHeat
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunk_hit_log_analytics
    ON chunk_hit_log (hit_at DESC, pipeline, gpu_cluster, chunk_id)
    INCLUDE (query_hash, rerank_score, score, relative_path);

-- Covers: trending 24h vs prior window query (separate time buckets)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunk_hit_log_trending
    ON chunk_hit_log (query_hash, hit_at DESC);

-- ── 4. query_variance_pairs — GiST trigram indexes for "did you mean" ─────────
-- Required: pg_trgm (enabled above)
-- Enables: similarity(inputQuery, query_a) / similarity(inputQuery, query_b) scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qvp_query_a_trgm
    ON query_variance_pairs USING GiST (query_a gist_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qvp_query_b_trgm
    ON query_variance_pairs USING GiST (query_b gist_trgm_ops);

-- Covers: hit_count + similarity combined sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qvp_hit_count
    ON query_variance_pairs (hit_count DESC, similarity DESC);
