BEGIN;

CREATE TABLE IF NOT EXISTS token_map_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  query text NOT NULL,
  model text NOT NULL,
  feature_key text NOT NULL,
  packet_state text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  compressed_tokens integer NOT NULL DEFAULT 0,
  bpe_waste_score real NOT NULL DEFAULT 0,
  chunk_ids text[] NOT NULL DEFAULT '{}'::text[],
  feature_keys text[] NOT NULL DEFAULT '{}'::text[],
  graph_paths text[] NOT NULL DEFAULT '{}'::text[],
  source_refs text[] NOT NULL DEFAULT '{}'::text[],
  tool_policy text NOT NULL DEFAULT 'read_only',
  answer_summary text NOT NULL,
  answer_hash text,
  qdrant_point_id text,
  turbovec_code text,
  next_actions text[] NOT NULL DEFAULT '{}'::text[],
  cacheable boolean NOT NULL DEFAULT true,
  degraded boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE token_map_cards
  ADD CONSTRAINT token_map_cards_cache_key_uq UNIQUE (cache_key);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_query
  ON token_map_cards (query);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_model
  ON token_map_cards (model);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_feature_key
  ON token_map_cards (feature_key);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_packet_state
  ON token_map_cards (packet_state);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_created_at
  ON token_map_cards (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_source_refs_gin
  ON token_map_cards USING gin (source_refs);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_chunk_ids_gin
  ON token_map_cards USING gin (chunk_ids);

CREATE INDEX IF NOT EXISTS idx_token_map_cards_feature_keys_gin
  ON token_map_cards USING gin (feature_keys);

COMMIT;
