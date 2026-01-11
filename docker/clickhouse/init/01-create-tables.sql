-- ClickHouse Initialization: Phase 96 Analytics Tables
-- Auto-executed on first startup
-- Integrates with: Langfuse traces, Postgres data, Qdrant vectors

-- Create databases first
CREATE DATABASE IF NOT EXISTS langfuse;
CREATE DATABASE IF NOT EXISTS analytics;

-- 1. LLM Trace Analytics (from Langfuse)
CREATE TABLE IF NOT EXISTS langfuse.trace_analytics
(
    trace_id String,
    timestamp DateTime64(3),
    user_id Nullable(String),
    session_id Nullable(String),
    name String,
    metadata JSON,
    input String,
    output String,
    tokens_input UInt32,
    tokens_output UInt32,
    cost_usd Float64,
    latency_ms UInt32,
    model String,
    status String,
    tags Array(String),
    INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 8192,
    INDEX idx_model model TYPE set(100) GRANULARITY 8192
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, trace_id)
TTL timestamp + INTERVAL 90 DAY;

-- 2. Legal Case Analytics (mirrored from Postgres)
CREATE TABLE IF NOT EXISTS analytics.legal_cases
(
    case_id UUID,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    case_number String,
    title String,
    status String,
    category String,
    metadata JSON,
    ai_tags Array(String),  -- Auto-tagged by Ollama
    evidence_count UInt32,
    document_count UInt32,
    query_count UInt32,
    last_activity DateTime64(3),
    INDEX idx_case_id case_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_status status TYPE set(20) GRANULARITY 8192
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (case_id, created_at);

-- 3. RAG Query Analytics (from Qdrant)
CREATE TABLE IF NOT EXISTS analytics.rag_queries
(
    query_id UUID,
    timestamp DateTime64(3),
    case_id Nullable(UUID),
    query_text String,
    query_embedding Array(Float32),  -- For similarity search
    results_count UInt16,
    relevance_scores Array(Float32),
    latency_ms UInt32,
    model String,
    ai_tags Array(String),  -- Auto-tagged by Ollama
    INDEX idx_query_id query_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 8192
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, query_id);

-- 4. Document Processing Analytics
CREATE TABLE IF NOT EXISTS analytics.documents
(
    document_id UUID,
    case_id Nullable(UUID),
    filename String,
    file_type String,
    file_size UInt64,
    uploaded_at DateTime64(3),
    processed_at Nullable(DateTime64(3)),
    ocr_completed Boolean,
    embedding_completed Boolean,
    ai_summary String,
    ai_tags Array(String),  -- Auto-tagged by Ollama
    processing_time_ms UInt32,
    INDEX idx_document_id document_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_case_id case_id TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(uploaded_at)
ORDER BY (document_id, uploaded_at);

-- 5. Neo4j Graph Metrics (synced from your knowledge graph)
CREATE TABLE IF NOT EXISTS analytics.graph_metrics
(
    timestamp DateTime64(3),
    metric_type String,  -- 'node_count', 'edge_count', 'centrality', etc.
    entity_type String,  -- 'case', 'evidence', 'person', 'document'
    entity_id String,
    metric_value Float64,
    metadata JSON,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 8192,
    INDEX idx_entity_type entity_type TYPE set(50) GRANULARITY 8192
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, metric_type, entity_id);

-- 6. GPU PyTorch Analytics Results
CREATE TABLE IF NOT EXISTS analytics.pytorch_predictions
(
    prediction_id UUID,
    timestamp DateTime64(3),
    model_name String,
    input_case_id Nullable(UUID),
    input_features Array(Float32),
    prediction_label String,
    prediction_confidence Float64,
    gpu_time_ms UInt32,
    batch_size UInt16,
    metadata JSON,
    INDEX idx_prediction_id prediction_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 8192,
    INDEX idx_model_name model_name TYPE set(20) GRANULARITY 8192
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, prediction_id);

-- 7. CrewAI Agent Executions
CREATE TABLE IF NOT EXISTS analytics.agent_executions
(
    execution_id UUID,
    timestamp DateTime64(3),
    agent_name String,
    crew_name String,
    task_description String,
    input_data String,
    output_data String,
    status String,  -- 'success', 'failed', 'timeout'
    duration_ms UInt32,
    llm_calls UInt16,
    total_tokens UInt32,
    cost_usd Float64,
    ai_tags Array(String),
    INDEX idx_execution_id execution_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 8192,
    INDEX idx_agent_name agent_name TYPE set(50) GRANULARITY 8192
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, execution_id);

-- 8. Materialized Views for Real-Time Dashboards

-- Daily LLM usage by model
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.daily_llm_usage
ENGINE = SummingMergeTree()
ORDER BY (date, model)
AS SELECT
    toDate(timestamp) AS date,
    model,
    count() AS request_count,
    sum(tokens_input) AS total_input_tokens,
    sum(tokens_output) AS total_output_tokens,
    sum(cost_usd) AS total_cost,
    avg(latency_ms) AS avg_latency_ms
FROM langfuse.trace_analytics
GROUP BY date, model;

-- Case activity metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.case_activity_metrics
ENGINE = SummingMergeTree()
ORDER BY (date, case_id)
AS SELECT
    toDate(last_activity) AS date,
    case_id,
    count() AS activity_count,
    max(evidence_count) AS evidence_count,
    max(document_count) AS document_count,
    max(query_count) AS query_count
FROM analytics.legal_cases
GROUP BY date, case_id;

-- PyTorch model performance
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.model_performance
ENGINE = SummingMergeTree()
ORDER BY (date, model_name)
AS SELECT
    toDate(timestamp) AS date,
    model_name,
    count() AS prediction_count,
    avg(prediction_confidence) AS avg_confidence,
    avg(gpu_time_ms) AS avg_gpu_time_ms,
    sum(batch_size) AS total_predictions
FROM analytics.pytorch_predictions
GROUP BY date, model_name;
