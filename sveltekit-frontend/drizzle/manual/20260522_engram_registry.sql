-- 2026-05-22 Engram durable registry tables
-- Safe manual migration (never use drizzle-kit push on live DB)

CREATE TABLE IF NOT EXISTS memory_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  chunk_id text,
  summary_id text,
  embedding_id text,
  cluster_id text,
  packet_id text,
  memory_id text,
  feature_family text NOT NULL,
  user_intent text NOT NULL,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  hotness real NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_registry_source_idx ON memory_registry (source_id);
CREATE INDEX IF NOT EXISTS memory_registry_memory_idx ON memory_registry (memory_id);
CREATE INDEX IF NOT EXISTS memory_registry_feature_intent_idx ON memory_registry (feature_family, user_intent);
CREATE INDEX IF NOT EXISTS memory_registry_hotness_idx ON memory_registry (hotness);
CREATE INDEX IF NOT EXISTS memory_registry_updated_idx ON memory_registry (updated_at);
CREATE INDEX IF NOT EXISTS memory_registry_tags_gin_idx ON memory_registry USING gin (tags);

CREATE TABLE IF NOT EXISTS engram_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id text NOT NULL UNIQUE,
  scope text NOT NULL,
  summary text NOT NULL,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  did_you_mean jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding_id text,
  qdrant_point_id text,
  ttl_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engram_cards_scope_idx ON engram_cards (scope);
CREATE INDEX IF NOT EXISTS engram_cards_embedding_idx ON engram_cards (embedding_id);
CREATE INDEX IF NOT EXISTS engram_cards_qdrant_idx ON engram_cards (qdrant_point_id);
CREATE INDEX IF NOT EXISTS engram_cards_created_idx ON engram_cards (created_at);
CREATE INDEX IF NOT EXISTS engram_cards_labels_gin_idx ON engram_cards USING gin (labels);
CREATE INDEX IF NOT EXISTS engram_cards_dym_gin_idx ON engram_cards USING gin (did_you_mean);
CREATE INDEX IF NOT EXISTS engram_cards_source_refs_gin_idx ON engram_cards USING gin (source_refs);

CREATE TABLE IF NOT EXISTS intent_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  user_query text NOT NULL,
  predicted_intent text NOT NULL,
  confidence real NOT NULL DEFAULT 0,
  selected_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  cache_hit boolean NOT NULL DEFAULT false,
  user_accepted boolean,
  correction_label text,
  reward real,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intent_eval_runs_run_idx ON intent_eval_runs (run_id);
CREATE INDEX IF NOT EXISTS intent_eval_runs_intent_idx ON intent_eval_runs (predicted_intent);
CREATE INDEX IF NOT EXISTS intent_eval_runs_confidence_idx ON intent_eval_runs (confidence);
CREATE INDEX IF NOT EXISTS intent_eval_runs_created_idx ON intent_eval_runs (created_at);
CREATE INDEX IF NOT EXISTS intent_eval_runs_selected_cards_gin_idx ON intent_eval_runs USING gin (selected_cards);
CREATE INDEX IF NOT EXISTS intent_eval_runs_selected_clusters_gin_idx ON intent_eval_runs USING gin (selected_clusters);
