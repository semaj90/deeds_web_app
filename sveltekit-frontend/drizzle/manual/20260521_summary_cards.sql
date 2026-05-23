CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS summary_cards (
  id bigserial PRIMARY KEY,
  card_key text NOT NULL UNIQUE,
  path text NOT NULL,
  summary_type text NOT NULL,
  summary text NOT NULL,
  symbols text[] NOT NULL DEFAULT '{}'::text[],
  routes text[] NOT NULL DEFAULT '{}'::text[],
  tables text[] NOT NULL DEFAULT '{}'::text[],
  tools text[] NOT NULL DEFAULT '{}'::text[],
  dependencies text[] NOT NULL DEFAULT '{}'::text[],
  labels text[] NOT NULL DEFAULT '{}'::text[],
  source_refs text[] NOT NULL DEFAULT '{}'::text[],
  search_tsv tsvector NOT NULL DEFAULT ''::tsvector,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE summary_cards
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_summary_cards_path
  ON summary_cards (path);

CREATE INDEX IF NOT EXISTS idx_summary_cards_summary_type
  ON summary_cards (summary_type);

CREATE INDEX IF NOT EXISTS idx_summary_cards_search_tsv
  ON summary_cards USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS idx_summary_cards_labels
  ON summary_cards USING gin (labels);

CREATE INDEX IF NOT EXISTS idx_summary_cards_tables
  ON summary_cards USING gin (tables);

CREATE INDEX IF NOT EXISTS idx_summary_cards_embedding_hnsw
  ON summary_cards USING hnsw (embedding vector_cosine_ops);
