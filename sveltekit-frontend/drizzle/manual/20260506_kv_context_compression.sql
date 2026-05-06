-- 3-level KV context compression tables for Gemma4 agent memory
-- Level 2: compressed file/trace/research cards (durable cache)
-- Level 3: attention TOC packets per task (durable cache)

CREATE TABLE IF NOT EXISTS compressed_context_cards (
  id              BIGSERIAL PRIMARY KEY,
  stable_key      TEXT NOT NULL,
  card_type       TEXT NOT NULL,  -- 'file' | 'trace' | 'research' | 'directory'
  source_hash     TEXT NOT NULL,
  one_line_summary TEXT NOT NULL,
  important_symbols JSONB NOT NULL DEFAULT '[]',
  known_risks     JSONB NOT NULL DEFAULT '[]',
  retrieval_reasons JSONB NOT NULL DEFAULT '[]',
  score           DOUBLE PRECISION NOT NULL DEFAULT 0,
  embedding       vector(768),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stable_key, card_type, source_hash)
);

CREATE INDEX IF NOT EXISTS compressed_context_cards_type_idx
  ON compressed_context_cards (card_type);
CREATE INDEX IF NOT EXISTS compressed_context_cards_stable_key_idx
  ON compressed_context_cards (stable_key);
CREATE INDEX IF NOT EXISTS compressed_context_cards_metadata_gin
  ON compressed_context_cards USING gin (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS compressed_context_cards_score_idx
  ON compressed_context_cards (score DESC);

CREATE TABLE IF NOT EXISTS kv_context_packets (
  task_id             TEXT PRIMARY KEY,
  stable_prefix_hash  TEXT NOT NULL,
  level2_compressed   JSONB NOT NULL DEFAULT '{}',
  level3_attention_toc JSONB NOT NULL DEFAULT '{}',
  token_budget        JSONB NOT NULL DEFAULT '{}',
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kv_context_packets_updated_idx
  ON kv_context_packets (updated_at DESC);
