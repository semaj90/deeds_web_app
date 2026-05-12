-- Hermes / ACE durable truth tables
-- Apply: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/20260511_hermes_ace_tables.sql

CREATE TABLE IF NOT EXISTS cluster_summaries (
  cluster_id       integer        NOT NULL,
  encoder_version  text           NOT NULL DEFAULT 'v1',
  label            text           NOT NULL DEFAULT '',
  summary          text           NOT NULL DEFAULT '',
  aliases          jsonb          NOT NULL DEFAULT '[]',
  representative_chunk_ids jsonb  NOT NULL DEFAULT '[]',
  token_count      integer        NOT NULL DEFAULT 0,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, encoder_version)
);

CREATE TABLE IF NOT EXISTS graph_expansion_cache (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash     text        UNIQUE NOT NULL,
  start_node_ids jsonb       NOT NULL DEFAULT '[]',
  max_hops       integer     NOT NULL DEFAULT 2,
  graph_json     jsonb       NOT NULL DEFAULT '{}',
  triples        jsonb       NOT NULL DEFAULT '[]',
  token_count    integer     NOT NULL DEFAULT 0,
  redis_key      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_expansion_cache_hash_idx ON graph_expansion_cache (query_hash);
CREATE INDEX IF NOT EXISTS graph_expansion_cache_created_idx ON graph_expansion_cache (created_at DESC);

CREATE TABLE IF NOT EXISTS ace_context_packets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   text        NOT NULL DEFAULT '',
  query        text        NOT NULL DEFAULT '',
  context_hash text        NOT NULL DEFAULT '',
  context_json jsonb       NOT NULL DEFAULT '{}',
  token_count  integer     NOT NULL DEFAULT 0,
  model        text        NOT NULL DEFAULT 'gemma4-legal',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ace_context_packets_session_idx  ON ace_context_packets (session_id);
CREATE INDEX IF NOT EXISTS ace_context_packets_hash_idx     ON ace_context_packets (context_hash);
CREATE INDEX IF NOT EXISTS ace_context_packets_created_idx  ON ace_context_packets (created_at DESC);

CREATE TABLE IF NOT EXISTS hermes_dag_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_name    text        NOT NULL DEFAULT '',
  input_json  jsonb       NOT NULL DEFAULT '{}',
  output_json jsonb       NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'running', 'success', 'failed')),
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS hermes_dag_runs_status_idx    ON hermes_dag_runs (status);
CREATE INDEX IF NOT EXISTS hermes_dag_runs_dag_name_idx  ON hermes_dag_runs (dag_name);
CREATE INDEX IF NOT EXISTS hermes_dag_runs_started_idx   ON hermes_dag_runs (started_at DESC);
