-- AST Graph Tables (April 21, 2026)
-- Structured sidecar for the workspace indexing pipeline.
-- ts-morph-derived for TS/JS; heuristic fallback for all other languages.
-- Feeds: 4D topology, cluster summaries, fix-recommender graph expansion, ACE context.

-- ── ast_nodes ─────────────────────────────────────────────────────────────────
-- One row per named symbol extracted from the AST.
CREATE TABLE IF NOT EXISTS ast_nodes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     TEXT        NOT NULL DEFAULT 'default',
  file_path   TEXT        NOT NULL,
  symbol      TEXT,
  kind        TEXT        NOT NULL,
  start_line  INTEGER,
  end_line    INTEGER,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ast_nodes_file_path_idx  ON ast_nodes (file_path);
CREATE INDEX IF NOT EXISTS ast_nodes_kind_idx       ON ast_nodes (kind);
CREATE INDEX IF NOT EXISTS ast_nodes_repo_file_idx  ON ast_nodes (repo_id, file_path);

-- ── ast_edges ─────────────────────────────────────────────────────────────────
-- Import, call, and type-reference edges between AST nodes.
CREATE TABLE IF NOT EXISTS ast_edges (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id        TEXT        NOT NULL DEFAULT 'default',
  source_node_id UUID        NOT NULL,
  target_node_id UUID        NOT NULL,
  edge_type      TEXT        NOT NULL,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ast_edges_source_idx    ON ast_edges (source_node_id);
CREATE INDEX IF NOT EXISTS ast_edges_target_idx    ON ast_edges (target_node_id);
CREATE INDEX IF NOT EXISTS ast_edges_type_repo_idx ON ast_edges (edge_type, repo_id);

-- ── ast_file_features ─────────────────────────────────────────────────────────
-- One row per file — aggregated feature counts plus language metadata.
-- Upserted on every pipeline run via ON CONFLICT (repo_id, file_path) DO UPDATE.
CREATE TABLE IF NOT EXISTS ast_file_features (
  repo_id        TEXT        NOT NULL DEFAULT 'default',
  file_path      TEXT        NOT NULL,
  language       TEXT,
  extension      TEXT,
  import_count   INTEGER     NOT NULL DEFAULT 0,
  export_count   INTEGER     NOT NULL DEFAULT 0,
  function_count INTEGER     NOT NULL DEFAULT 0,
  class_count    INTEGER     NOT NULL DEFAULT 0,
  call_count     INTEGER     NOT NULL DEFAULT 0,
  semantic_tags  TEXT[]      NOT NULL DEFAULT ARRAY[]::text[],
  domain         TEXT,
  parser         TEXT        NOT NULL DEFAULT 'heuristic',
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, file_path)
);

CREATE INDEX IF NOT EXISTS ast_file_features_lang_idx   ON ast_file_features (language);
CREATE INDEX IF NOT EXISTS ast_file_features_domain_idx ON ast_file_features (domain);
-- GIN index for semantic_tags array queries (e.g. WHERE 'svelte5' = ANY(semantic_tags))
CREATE INDEX IF NOT EXISTS ast_file_features_tags_gin   ON ast_file_features USING GIN (semantic_tags);
