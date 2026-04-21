-- ── web_search_index ──────────────────────────────────────────────────────
-- Agentic deep-research web search results.
-- Stage 10 of the codebase orchestration pipeline populates this table by
-- using cluster_summaries as query seeds, fetching web pages, embedding them
-- via embeddinggemma (768-dim), and upserting here + to Qdrant knowledge_base.

CREATE TABLE IF NOT EXISTS web_search_index (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query            TEXT NOT NULL,
  cluster_id       INTEGER,
  url              TEXT NOT NULL,
  title            TEXT,
  content          TEXT NOT NULL,
  snippet          TEXT,
  provider         TEXT NOT NULL DEFAULT 'searxng',
  content_hash     VARCHAR(16) NOT NULL,
  embedding        vector(768),
  relevance_score  REAL NOT NULL DEFAULT 0,
  run_id           TEXT,
  indexed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplication index (unique)
CREATE UNIQUE INDEX IF NOT EXISTS wsi_content_hash_unique ON web_search_index (content_hash);

-- Query performance indexes
CREATE INDEX IF NOT EXISTS wsi_cluster_score ON web_search_index (cluster_id, relevance_score);
CREATE INDEX IF NOT EXISTS wsi_indexed_at    ON web_search_index (indexed_at);
CREATE INDEX IF NOT EXISTS wsi_run_id        ON web_search_index (run_id);

-- HNSW index for RAG vector similarity search
CREATE INDEX IF NOT EXISTS wsi_embedding_hnsw
  ON web_search_index
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- pipeline index on research_summaries (only if the table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'research_summaries') THEN
    CREATE INDEX IF NOT EXISTS rs_pipeline_created ON research_summaries (pipeline, created_at DESC);
  END IF;
END$$;
