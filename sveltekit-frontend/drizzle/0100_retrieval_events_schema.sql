-- Phase 2F Task 1.3: Retrieval Events Schema
--
-- Core table for storing retrieval pipeline telemetry
-- Captures per-stage latencies: vector → BM25 → AST → RRF → rerank → selection
--
-- Strategy: Single JSONB column for complete envelope + denormalized columns for common queries
-- This allows both fast indexed lookups AND full event reconstruction
--
-- Created: 2026-07-11
-- Phase: 2F (Event Writer Foundation)

CREATE TABLE IF NOT EXISTS retrieval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL UNIQUE,

  -- Timing
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_id UUID,

  -- Complete event envelope (JSONB for flexibility and future schema evolution)
  envelope JSONB NOT NULL,

  -- Denormalized columns for fast queries (avoid JSONB extraction in WHERE clauses)
  query_text TEXT,
  vector_lane_latency_ms REAL,
  bm25_latency_ms REAL,
  ast_latency_ms REAL,
  rrf_latency_ms REAL,
  rerank_latency_ms REAL,
  total_latency_ms REAL,

  -- Final result
  selected_packet_key TEXT,

  -- Cache metrics
  cache_hit BOOLEAN,
  cache_type VARCHAR(20),  -- 'L1_exact' | 'L2_semantic' | 'none'

  -- System metrics
  gpu_memory_used_mb REAL,

  -- Indexing
  CONSTRAINT fk_session_id
    FOREIGN KEY (session_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX idx_retrieval_events_timestamp ON retrieval_events(timestamp DESC);
CREATE INDEX idx_retrieval_events_session_id ON retrieval_events(session_id);
CREATE INDEX idx_retrieval_events_selected_packet ON retrieval_events(selected_packet_key);
CREATE INDEX idx_retrieval_events_cache_hit ON retrieval_events(cache_hit);
CREATE INDEX idx_retrieval_events_total_latency ON retrieval_events(total_latency_ms DESC);

-- Full-text search index for queries
CREATE INDEX idx_retrieval_events_query_text ON retrieval_events
  USING GIN(to_tsvector('english', query_text));

-- JSONB path index for fast envelope lookups
CREATE INDEX idx_retrieval_events_envelope_vector
  ON retrieval_events USING GIN(envelope);

-- Materialized view for per-hour statistics
-- Refresh hourly via cron or application job scheduler
CREATE MATERIALIZED VIEW IF NOT EXISTS retrieval_event_stats AS
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as total_events,
  COUNT(DISTINCT session_id) as unique_sessions,

  -- Per-lane latency statistics
  AVG(vector_lane_latency_ms) as avg_vector_latency,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vector_lane_latency_ms) as p50_vector_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY vector_lane_latency_ms) as p95_vector_latency,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY vector_lane_latency_ms) as p99_vector_latency,

  AVG(bm25_latency_ms) as avg_bm25_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY bm25_latency_ms) as p95_bm25_latency,

  AVG(ast_latency_ms) as avg_ast_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ast_latency_ms) as p95_ast_latency,

  AVG(rrf_latency_ms) as avg_rrf_latency,

  -- Total pipeline latency
  AVG(total_latency_ms) as avg_total_latency,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_latency_ms) as p50_total_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms) as p95_total_latency,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms) as p99_total_latency,
  MAX(total_latency_ms) as max_total_latency,

  -- Cache effectiveness
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as cache_hit_rate,

  -- GPU utilization
  AVG(gpu_memory_used_mb) as avg_gpu_memory,
  MAX(gpu_memory_used_mb) as max_gpu_memory

FROM retrieval_events
GROUP BY DATE_TRUNC('hour', timestamp);

-- Index for materialized view
CREATE INDEX idx_retrieval_event_stats_hour ON retrieval_event_stats(hour DESC);

-- View for recent performance (last 24 hours)
CREATE OR REPLACE VIEW retrieval_events_24h AS
SELECT * FROM retrieval_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- View for cache hit analysis
CREATE OR REPLACE VIEW retrieval_cache_analysis AS
SELECT
  cache_type,
  COUNT(*) as total_queries,
  COUNT(DISTINCT session_id) as unique_sessions,
  AVG(total_latency_ms) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms) as p95_latency,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM retrieval_events
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY cache_type;
