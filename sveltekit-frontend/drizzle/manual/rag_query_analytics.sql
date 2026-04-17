-- RAG Query Analytics + Codebase Chunk pgvector Mirror
-- Safe: CREATE TABLE IF NOT EXISTS + CREATE INDEX CONCURRENTLY IF NOT EXISTS
-- Run: psql $DATABASE_URL -f drizzle/manual/rag_query_analytics.sql

-- ── 1. Enable halfvec extension (pgvector 0.7+ required) ─────────────────────
-- halfvec = 2 bytes per dimension (vs 4 for vector) — 50% RAM savings for HNSW
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 2. Codebase Chunk Index (pgvector mirror of Qdrant codebase_chunks_768) ──
CREATE TABLE IF NOT EXISTS codebase_chunk_index (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    qdrant_id        VARCHAR(64),
    relative_path    TEXT NOT NULL,
    symbol           VARCHAR(255),
    kind             VARCHAR(50),
    line_start       INTEGER,
    line_end         INTEGER,
    content_embedding halfvec(768),
    gpu_cluster      INTEGER,
    som_cluster      INTEGER,
    page_rank_score  REAL,
    community_id     INTEGER,
    tags             JSONB DEFAULT '[]'::jsonb,
    neo4j_meta       JSONB DEFAULT '{}'::jsonb,
    indexed_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    enriched_at      TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- HNSW for ANN search (m=16, ef=200 — same as Qdrant config)
CREATE INDEX CONCURRENTLY IF NOT EXISTS codebase_chunk_index_content_hnsw
    ON codebase_chunk_index
    USING hnsw (content_embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS codebase_chunk_index_path_idx
    ON codebase_chunk_index (relative_path);

CREATE INDEX IF NOT EXISTS codebase_chunk_index_gpu_cluster_idx
    ON codebase_chunk_index (gpu_cluster);

CREATE INDEX IF NOT EXISTS codebase_chunk_index_som_cluster_idx
    ON codebase_chunk_index (som_cluster);

CREATE INDEX IF NOT EXISTS codebase_chunk_index_tags_idx
    ON codebase_chunk_index USING gin (tags);

CREATE INDEX IF NOT EXISTS codebase_chunk_index_qdrant_id_idx
    ON codebase_chunk_index (qdrant_id);

-- ── 3. RAG Query Log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_query_log (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              UUID,
    case_id              UUID,
    -- Query
    query                TEXT NOT NULL,
    query_hash           VARCHAR(16) NOT NULL,  -- SHA256 prefix (matches reranker rr:* keys)
    query_embedding      halfvec(768),           -- populated async after insert
    -- Entity extraction
    entity_statutes      JSONB DEFAULT '[]'::jsonb,
    entity_cases         JSONB DEFAULT '[]'::jsonb,
    entity_ca_codes      JSONB DEFAULT '[]'::jsonb,
    total_entity_tags    INTEGER DEFAULT 0,
    -- Retrieval stats
    total_found          INTEGER DEFAULT 0,
    search_time_ms       INTEGER,
    rerank_time_ms       INTEGER,
    -- Rerank cache breakdown
    rerank_l0_hit        BOOLEAN DEFAULT FALSE,
    rerank_l1_hits       INTEGER DEFAULT 0,
    rerank_fresh_scored  INTEGER DEFAULT 0,
    -- Top result snapshot
    top_chunk_id         VARCHAR(255),
    top_chunk_score      REAL,
    top_rerank_score     REAL,
    -- Pipeline flags
    dag_enabled          BOOLEAN DEFAULT TRUE,
    dag_status           VARCHAR(20),
    hybrid_search        BOOLEAN DEFAULT FALSE,
    -- Timestamp
    created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- HNSW on query embedding for "did you mean" ANN
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_query_log_embedding_hnsw
    ON rag_query_log
    USING hnsw (query_embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS rag_query_log_user_created_idx
    ON rag_query_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rag_query_log_case_created_idx
    ON rag_query_log (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rag_query_log_query_hash_idx
    ON rag_query_log (query_hash);

-- ── 4. Chunk Hit Log — cross-pipeline retrieval analytics ─────────────────
-- Records every RAG/KAG/DAG/ACE/reranker hit for cluster heat-map analytics
CREATE TABLE IF NOT EXISTS chunk_hit_log (
    id            BIGSERIAL PRIMARY KEY,
    chunk_id      TEXT NOT NULL,          -- Qdrant point ID or pgvector id
    relative_path TEXT NOT NULL,
    gpu_cluster   INTEGER,
    som_cluster   INTEGER,
    pipeline      TEXT NOT NULL,          -- 'ace' | 'kag' | 'dag' | 'rag' | 'reranker' | 'codebase'
    query_hash    VARCHAR(16) NOT NULL,   -- SHA-256 prefix (matches rr:* keys)
    score         REAL,                   -- cosine / fuse score at hit time
    rerank_score  REAL,                   -- Gemma4 rerank score (null if not reranked)
    user_id       UUID,
    case_id       UUID,
    hit_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS chunk_hit_pipeline_cluster_idx
    ON chunk_hit_log (pipeline, gpu_cluster, hit_at DESC);

CREATE INDEX IF NOT EXISTS chunk_hit_query_hash_idx
    ON chunk_hit_log (query_hash, hit_at DESC);

-- ── 5. Query Variance Pairs — Bifrost semantic similarity pairs ───────────
-- Populated when Bifrost L2 cache matches a prior query (similarity >= 0.8)
-- Drives "did you mean" suggestions and predictive to-do generation
CREATE TABLE IF NOT EXISTS query_variance_pairs (
    id          BIGSERIAL PRIMARY KEY,
    query_hash_a  VARCHAR(16) NOT NULL,   -- incoming query hash
    query_hash_b  VARCHAR(16) NOT NULL,   -- cached query that matched
    query_a       TEXT NOT NULL,
    query_b       TEXT NOT NULL,
    similarity    REAL NOT NULL,          -- Bifrost cosine similarity (0.8–1.0)
    hit_count     INTEGER DEFAULT 1,
    pipeline      TEXT,
    last_seen     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS query_variance_pairs_pair_idx
    ON query_variance_pairs (LEAST(query_hash_a, query_hash_b), GREATEST(query_hash_a, query_hash_b));

CREATE INDEX IF NOT EXISTS query_variance_pairs_a_idx ON query_variance_pairs (query_hash_a);

-- ── 6. QLoRA Training Examples — distilled from high-quality RAG hits ─────
-- Populated async when: rerank_score >= 0.80 + ACE confidence >= 0.85
-- Format: instruction (query) + context (top chunks) + response (LLM output)
-- Used to fine-tune smaller local models (Gemma 270M → Gemma 4B QLoRA)
CREATE TABLE IF NOT EXISTS qlora_examples (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query           TEXT NOT NULL,
    query_hash      VARCHAR(16) NOT NULL,
    -- Structured training record
    instruction     TEXT NOT NULL,         -- cleaned query as instruction
    context_chunks  JSONB NOT NULL,        -- top-K chunks with scores (UnifiedRetrievalResult[])
    graph_summary   TEXT,                  -- cluster narrative prefix (from CouchDB)
    response        TEXT NOT NULL,         -- LLM output that passed quality gate
    response_score  REAL NOT NULL,         -- self-eval score (0–1)
    -- Provenance signals for curriculum filtering
    pipeline_hits   JSONB DEFAULT '{}'::jsonb,  -- { rag: 3, kag: 2, dag: 1 }
    gpu_clusters    JSONB DEFAULT '[]'::jsonb,  -- cluster IDs involved
    avg_rerank_score REAL,
    entity_tags     JSONB DEFAULT '[]'::jsonb,  -- statutes, cases, codes
    -- Dataset metadata
    dataset_split   TEXT DEFAULT 'train',  -- 'train' | 'val' | 'test'
    quality_tier    TEXT DEFAULT 'silver', -- 'gold' (>0.90) | 'silver' (>0.80) | 'bronze' (>0.70)
    model_version   TEXT,                  -- model that generated the response
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    used_in_run     INTEGER DEFAULT 0      -- how many fine-tune runs included this example
);

CREATE INDEX IF NOT EXISTS qlora_examples_quality_idx
    ON qlora_examples (quality_tier, response_score DESC);

CREATE INDEX IF NOT EXISTS qlora_examples_dataset_split_idx
    ON qlora_examples (dataset_split, created_at DESC);

CREATE INDEX IF NOT EXISTS qlora_examples_clusters_idx
    ON qlora_examples USING gin (gpu_clusters);

-- ── 7. Predictive Todos — AI-generated maintenance actions ────────────────
-- Written by POST /api/analytics/generate-todos (Gemma4 gap analysis)
CREATE TABLE IF NOT EXISTS predictive_todos (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    todo_type        TEXT NOT NULL,        -- 'add_cluster_summary' | 'reindex_cluster' | 'add_kb_article' | 'fix_collection' | 'qlora_retrain'
    gpu_cluster      INTEGER,
    reason           TEXT NOT NULL,
    suggested_action TEXT NOT NULL,
    estimated_impact TEXT NOT NULL,        -- 'high' | 'medium' | 'low'
    status           TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'done' | 'dismissed'
    generated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    resolved_at      TIMESTAMPTZ,
    metadata         JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS predictive_todos_status_impact_idx
    ON predictive_todos (status, estimated_impact, generated_at DESC);