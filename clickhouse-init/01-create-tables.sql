-- ClickHouse initialization script for legal analytics
-- Auto-executed on first container start

-- Create database
CREATE DATABASE IF NOT EXISTS legal_analytics;

USE legal_analytics;

-- Error embeddings mirror table (synced from PostgreSQL)
CREATE TABLE IF NOT EXISTS error_embeddings (
    id UUID DEFAULT generateUUIDv4(),
    error_id String,
    file_path String,
    error_message String,
    error_type String,
    severity String,
    line_number UInt32,
    column_number UInt32,
    embedding Array(Float32),  -- 768-dim from embeddinggemma
    source String,
    timestamp DateTime64(3) DEFAULT now64(),

    -- Auto-generated tags from Ollama gemma3-legal
    auto_tags Array(String),
    confidence_score Float32,

    -- Metadata
    cluster_id Nullable(Int32),
    impact_score Nullable(Float32),

    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_file_path file_path TYPE bloom_filter GRANULARITY 1,
    INDEX idx_error_type error_type TYPE set(100) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, error_id)
TTL timestamp + INTERVAL 90 DAY  -- Keep 90 days of error history
SETTINGS index_granularity = 8192;

-- Vector search results cache (synced from Qdrant)
CREATE TABLE IF NOT EXISTS vector_search_cache (
    query_id UUID DEFAULT generateUUIDv4(),
    query_text String,
    query_embedding Array(Float32),
    result_ids Array(String),
    result_scores Array(Float32),
    result_metadata String,  -- JSON
    timestamp DateTime64(3) DEFAULT now64(),

    -- Cache metadata
    collection_name String,
    top_k UInt16,
    cache_hit Boolean,
    latency_ms UInt32,

    INDEX idx_query_text query_text TYPE bloom_filter GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, query_id)
TTL timestamp + INTERVAL 7 DAY  -- Keep 7 days of search cache
SETTINGS index_granularity = 8192;

-- GPU artifact cache hits (synced from Redis)
CREATE TABLE IF NOT EXISTS gpu_cache_hits (
    cache_key String,
    cache_value String,  -- Could be embedding, tag, or model output
    cache_type String,  -- 'embedding', 'tag', 'completion'
    model_name String,
    hit_count UInt32,
    last_access DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(),

    -- Performance metrics
    avg_latency_ms Float32,
    total_tokens UInt32,

    INDEX idx_cache_key cache_key TYPE bloom_filter GRANULARITY 1,
    INDEX idx_model_name model_name TYPE set(10) GRANULARITY 1
) ENGINE = SummingMergeTree(hit_count)
PARTITION BY toYYYYMM(created_at)
ORDER BY (cache_key, model_name)
SETTINGS index_granularity = 8192;

-- LLM traces (for Langfuse integration)
CREATE TABLE IF NOT EXISTS llm_traces (
    trace_id UUID,
    parent_trace_id Nullable(UUID),
    name String,
    user_id Nullable(String),
    session_id Nullable(String),
    timestamp DateTime64(3) DEFAULT now64(),

    -- LLM call details
    model String,
    input String,
    output String,
    metadata String,  -- JSON

    -- Metrics
    latency_ms UInt32,
    input_tokens UInt32,
    output_tokens UInt32,
    total_cost Float32,

    -- Quality
    error Nullable(String),
    score Nullable(Float32),

    INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_model model TYPE set(50) GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, trace_id)
TTL timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- AutoGen agent runs (for multi-agent workflow tracking)
CREATE TABLE IF NOT EXISTS agent_runs (
    run_id UUID DEFAULT generateUUIDv4(),
    agent_name String,
    task_type String,  -- 'case_analysis', 'error_fixing', 'legal_research'
    input_data String,  -- JSON
    output_data String,  -- JSON
    status String,  -- 'success', 'failed', 'timeout'

    -- Timing
    started_at DateTime64(3),
    completed_at DateTime64(3),
    duration_ms UInt32,

    -- Resources
    llm_calls UInt16,
    tool_calls UInt16,
    total_tokens UInt32,

    -- Results
    confidence_score Float32,
    fix_applied Boolean DEFAULT false,

    INDEX idx_agent_name agent_name TYPE set(20) GRANULARITY 1,
    INDEX idx_task_type task_type TYPE set(10) GRANULARITY 1,
    INDEX idx_started_at started_at TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (started_at, run_id)
SETTINGS index_granularity = 8192;

-- Materialized view for real-time analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS error_stats_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, error_type, file_path)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    error_type,
    file_path,
    count() AS error_count,
    avg(confidence_score) AS avg_confidence,
    uniqExact(error_id) AS unique_errors
FROM error_embeddings
GROUP BY hour, error_type, file_path;

-- Materialized view for GPU cache performance
CREATE MATERIALIZED VIEW IF NOT EXISTS gpu_cache_stats_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (day, model_name, cache_type)
AS SELECT
    toDate(created_at) AS day,
    model_name,
    cache_type,
    sum(hit_count) AS total_hits,
    avg(avg_latency_ms) AS avg_latency,
    sum(total_tokens) AS total_tokens
FROM gpu_cache_hits
GROUP BY day, model_name, cache_type;

-- Grant permissions
GRANT ALL ON legal_analytics.* TO user;
