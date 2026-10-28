-- Additive: semantic_768 vector for error_logs.message so "Index Errors" (api/indexing, action=errors) can use
-- pgvector instead of the legacy Qdrant collection phase79_error_analysis + the empty error_cluster table.
-- Pre-image: error_logs has no vector column (1,598 rows at 2026-10-28). Nothing is dropped or rewritten.
-- Embedder: Ollama embeddinggemma:latest (768-d, canonical). message_embedding_model records it per row.
-- Post-check: SELECT count(*) FROM error_logs WHERE message_embedding IS NOT NULL;  -- 0 until the button runs
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS message_embedding vector(768);
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS message_embedding_model text;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS message_embedded_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_error_logs_message_embedding_hnsw
  ON error_logs USING hnsw (message_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
