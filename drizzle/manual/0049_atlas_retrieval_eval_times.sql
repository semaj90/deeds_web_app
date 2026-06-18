-- Migration: 0049_atlas_retrieval_eval_times.sql
-- Create lookup table for retrieval evaluation times and latency tracking

CREATE TABLE IF NOT EXISTS atlas_retrieval_eval_times (
  id bigserial PRIMARY KEY,
  query_hash text,
  packet_key text,
  feature_id text,
  source_ref text,
  qdrant_ms real,
  pg_bm25_ms real,
  pgvector_ms real,
  redis_ms real,
  bitfrost_ms real,
  neo4j_ms real,
  turbovec_ms real,
  rerank_ms real,
  gemma4_ms real,
  total_ms real,
  cache_hit_source text,
  ttl_remaining int,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_times_query_hash
ON atlas_retrieval_eval_times (query_hash);
CREATE INDEX IF NOT EXISTS idx_eval_times_packet_key
ON atlas_retrieval_eval_times (packet_key);
CREATE INDEX IF NOT EXISTS idx_eval_times_feature_id
ON atlas_retrieval_eval_times (feature_id);
CREATE INDEX IF NOT EXISTS idx_eval_times_payload_gin
ON atlas_retrieval_eval_times USING gin (payload jsonb_path_ops);
