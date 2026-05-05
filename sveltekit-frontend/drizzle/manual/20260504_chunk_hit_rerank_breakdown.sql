-- Slice 4: persist RerankBreakdown scores alongside each chunk hit.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

ALTER TABLE chunk_hit_log
  ADD COLUMN IF NOT EXISTS rerank_breakdown jsonb;

COMMENT ON COLUMN chunk_hit_log.rerank_breakdown IS
  'Additive boost breakdown from ACE post-retrieval rerank pipeline: '
  '{semantic, qdrantTag, cluster, som, pagerank, bow, pairedTest, final}';
