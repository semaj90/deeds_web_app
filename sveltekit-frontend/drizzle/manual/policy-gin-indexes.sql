-- GIN indexes on JSONB columns for policy_reranker_metadata table
-- These cannot be created via Drizzle ORM API, so using raw SQL

CREATE INDEX IF NOT EXISTS idx_policy_metadata_gin 
  ON policy_reranker_metadata USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_policy_inference_stats_gin 
  ON policy_reranker_metadata USING gin (inference_stats jsonb_path_ops);
