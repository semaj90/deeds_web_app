-- Round 3: Active-consumer tables missing from DB
-- Applied 2026-06-06 via: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260606_round3_active_consumers.sql
-- All statements use IF NOT EXISTS — safe to re-run

-- Required for vector columns
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── rag_cards ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_cards (
  id            text PRIMARY KEY,
  file_path     text NOT NULL,
  feature_label text NOT NULL,
  summary       text NOT NULL,
  tags          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── rag_embeddings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_embeddings (
  id             text PRIMARY KEY,
  card_id        text REFERENCES rag_cards(id) ON DELETE CASCADE,
  embedding      vector(768),
  embedding_type text NOT NULL DEFAULT 'summary',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── legal_documents_jsonb ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_documents_jsonb (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL,
  content              text NOT NULL,
  metadata             jsonb NOT NULL,
  document_type        text,
  jurisdiction         text,
  practice_area        text,
  confidentiality_level text,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);

-- ─── evidence_jsonb ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_jsonb (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid,
  title           text NOT NULL,
  description     text,
  metadata        jsonb NOT NULL,
  file_path       text,
  file_size       integer,
  mime_type       text,
  evidence_type   text,
  authenticated   boolean,
  relevance_score real,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);

-- ─── web_search_index ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_search_index (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query           text NOT NULL,
  cluster_id      integer,
  url             text NOT NULL,
  title           text,
  content         text NOT NULL,
  snippet         text,
  provider        text NOT NULL DEFAULT 'searxng',
  content_hash    varchar(16) NOT NULL,
  embedding       vector(768),
  relevance_score real NOT NULL DEFAULT 0,
  run_id          text,
  indexed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wsi_content_hash_unique UNIQUE (content_hash)
);
CREATE INDEX IF NOT EXISTS wsi_cluster_score ON web_search_index (cluster_id, relevance_score);
CREATE INDEX IF NOT EXISTS wsi_indexed_at    ON web_search_index (indexed_at);
CREATE INDEX IF NOT EXISTS wsi_run_id        ON web_search_index (run_id);

-- ─── rg_search_results ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rg_search_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp_id  varchar(256) NOT NULL,
  query         text NOT NULL,
  file_path     text NOT NULL,
  line_number   integer NOT NULL,
  column_number integer NOT NULL,
  content       text NOT NULL,
  embedding     vector(768),
  semantic_tags jsonb DEFAULT '[]'::jsonb,
  created_at    timestamp NOT NULL DEFAULT now()
);

-- ─── search_centroids ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_centroids (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          varchar(256) NOT NULL,
  queries         jsonb NOT NULL,
  centroid_vector vector(768) NOT NULL,
  created_at      timestamp NOT NULL DEFAULT now()
);

-- ─── entities ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id               text PRIMARY KEY,
  type             text NOT NULL,
  name             text NOT NULL,
  description      text,
  centrality_score real DEFAULT 0.0,
  metadata         jsonb DEFAULT '{}'::jsonb,
  last_active_at   timestamp DEFAULT now()
);

-- ─── entity_edges ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_edges (
  source_id     text NOT NULL REFERENCES entities(id),
  target_id     text NOT NULL REFERENCES entities(id),
  relation_type text NOT NULL,
  weight        real DEFAULT 1.0,
  metadata      jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (source_id, target_id, relation_type)
);

-- ─── ast_file_features ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ast_file_features (
  repo_id        text NOT NULL DEFAULT 'default',
  file_path      text NOT NULL,
  language       text,
  extension      text,
  import_count   integer NOT NULL DEFAULT 0,
  export_count   integer NOT NULL DEFAULT 0,
  function_count integer NOT NULL DEFAULT 0,
  class_count    integer NOT NULL DEFAULT 0,
  call_count     integer NOT NULL DEFAULT 0,
  semantic_tags  text[] NOT NULL DEFAULT ARRAY[]::text[],
  domain         text,
  parser         text NOT NULL DEFAULT 'heuristic',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, file_path)
);
CREATE INDEX IF NOT EXISTS ast_file_features_lang_idx   ON ast_file_features (language);
CREATE INDEX IF NOT EXISTS ast_file_features_domain_idx ON ast_file_features (domain);

-- ─── model_artifacts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_artifacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  path         text NOT NULL,
  sha256       text UNIQUE NOT NULL,
  source_url   text,
  backend      text,
  weight_quant text,
  approved     boolean NOT NULL DEFAULT false,
  scan_result  text,
  created_at   timestamp NOT NULL DEFAULT now(),
  activated_at timestamp
);

-- ─── conversations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL DEFAULT 'New Conversation',
  user_id       integer NOT NULL,
  model         varchar(64) NOT NULL DEFAULT 'gpt-4o',
  system_prompt text,
  context_ids   jsonb DEFAULT '[]'::jsonb,
  tags          jsonb DEFAULT '[]'::jsonb,
  is_archived   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            varchar(32) NOT NULL,
  content         text NOT NULL,
  model           varchar(64),
  tokens_used     integer,
  finish_reason   varchar(32),
  citations       jsonb DEFAULT '[]'::jsonb,
  tool_calls      jsonb,
  parent_id       uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id);
