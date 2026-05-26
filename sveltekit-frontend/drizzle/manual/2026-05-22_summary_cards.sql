-- Summary cards storage for codebase-map -> top-N TOON packet pipeline
-- Phase: 2026-05-22 summary-card normalization lane

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS summary_cards (
  id text PRIMARY KEY,
  path text NOT NULL,
  summary_type text NOT NULL,
  summary text NOT NULL,
  symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  routes jsonb NOT NULL DEFAULT '[]'::jsonb,
  tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_summary_cards_path ON summary_cards(path);
CREATE INDEX IF NOT EXISTS idx_summary_cards_type ON summary_cards(summary_type);
CREATE INDEX IF NOT EXISTS idx_summary_cards_created_at ON summary_cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_summary_cards_labels_gin ON summary_cards USING gin (labels jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_summary_cards_tables_gin ON summary_cards USING gin (tables jsonb_path_ops);

-- Optional vector index; requires pgvector HNSW support.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_summary_cards_embedding_hnsw
      ON summary_cards
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    EXCEPTION WHEN OTHERS THEN
      -- Keep migration non-fatal in environments without HNSW support.
      RAISE NOTICE 'Skipping HNSW index creation for summary_cards.embedding';
    END;
  END IF;
END $$;
