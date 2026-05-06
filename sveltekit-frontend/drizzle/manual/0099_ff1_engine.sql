-- FF1 Deep Audit Engine — Database Migration
-- Run once against the FF1 Postgres instance.
-- Safe to re-run (all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- Prereqs: pgvector, pg_trgm, btree_gin extensions must be installed.
-- For the dev compose stack (pgvector/pgvector:pg18 image) they are available.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ── Audit runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ff1_audit_runs (
  id          BIGSERIAL    PRIMARY KEY,
  commit_sha  TEXT,
  status      TEXT         NOT NULL DEFAULT 'running',  -- running | done | failed
  summary     JSONB        NOT NULL DEFAULT '{}',
  started_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ff1_audit_runs_commit
  ON ff1_audit_runs (commit_sha);

-- ── Diagnostics ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ff1_diagnostics (
  id           BIGSERIAL   PRIMARY KEY,
  audit_run_id BIGINT      REFERENCES ff1_audit_runs(id) ON DELETE CASCADE,
  source       TEXT        NOT NULL,        -- tsgo | tsc | svelte-check | vitest
  severity     TEXT        NOT NULL,        -- error | warning | info
  file_path    TEXT,
  line         INTEGER,
  column_no    INTEGER,
  code         TEXT,
  message      TEXT        NOT NULL,
  risk_score   REAL        NOT NULL DEFAULT 0,
  graph_node_id BIGINT,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ff1_diag_run
  ON ff1_diagnostics (audit_run_id, severity);
CREATE INDEX IF NOT EXISTS idx_ff1_diag_file
  ON ff1_diagnostics (file_path, severity);
CREATE INDEX IF NOT EXISTS idx_ff1_diag_risk
  ON ff1_diagnostics (risk_score DESC);

-- ── Repair proposals ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ff1_repair_proposals (
  id             BIGSERIAL   PRIMARY KEY,
  diagnostic_id  BIGINT      REFERENCES ff1_diagnostics(id) ON DELETE CASCADE,
  model          TEXT        NOT NULL,
  confidence     REAL        NOT NULL DEFAULT 0,
  risk           TEXT        NOT NULL,        -- low | medium | high
  proposal       JSONB       NOT NULL,        -- ProposalFix JSON
  patch_hash     TEXT,
  status         TEXT        NOT NULL DEFAULT 'proposed',  -- proposed | applied | rejected | rolled_back
  needs_human    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ff1_proposals_diag
  ON ff1_repair_proposals (diagnostic_id, status);
CREATE INDEX IF NOT EXISTS idx_ff1_proposals_risk
  ON ff1_repair_proposals (risk, status);

-- ── Validation results ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ff1_validation_results (
  id                 BIGSERIAL   PRIMARY KEY,
  repair_proposal_id BIGINT      REFERENCES ff1_repair_proposals(id) ON DELETE CASCADE,
  command            TEXT        NOT NULL,
  exit_code          INTEGER     NOT NULL,
  stdout             TEXT,
  stderr             TEXT,
  duration_ms        INTEGER,
  passed             BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ff1_validation_proposal
  ON ff1_validation_results (repair_proposal_id, passed);

-- ── AST graph nodes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ff1_graph_nodes (
  id          BIGSERIAL    PRIMARY KEY,
  node_type   TEXT         NOT NULL,           -- file | route | component | function …
  label       TEXT         NOT NULL,
  ref         TEXT,                            -- workspace-relative path or symbol ref
  properties  JSONB        NOT NULL DEFAULT '{}',
  risk_score  REAL         NOT NULL DEFAULT 0,
  embedding   vector(768),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ff1_nodes_type_label
  ON ff1_graph_nodes (node_type, label);
CREATE INDEX IF NOT EXISTS idx_ff1_nodes_ref
  ON ff1_graph_nodes (ref);
CREATE INDEX IF NOT EXISTS idx_ff1_nodes_props
  ON ff1_graph_nodes USING GIN (properties jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_ff1_nodes_risk
  ON ff1_graph_nodes (risk_score DESC);
-- HNSW for vector search (requires pgvector ≥ 0.5)
CREATE INDEX IF NOT EXISTS idx_ff1_nodes_embedding
  ON ff1_graph_nodes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── AST graph edges ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ff1_graph_edges (
  id           BIGSERIAL   PRIMARY KEY,
  from_node_id BIGINT      NOT NULL REFERENCES ff1_graph_nodes(id) ON DELETE CASCADE,
  to_node_id   BIGINT      NOT NULL REFERENCES ff1_graph_nodes(id) ON DELETE CASCADE,
  edge_type    TEXT        NOT NULL,           -- imports | calls | fixed_by | fails_with …
  weight       REAL        NOT NULL DEFAULT 1.0,
  properties   JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_node_id, to_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_ff1_edges_from
  ON ff1_graph_edges (from_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_ff1_edges_to
  ON ff1_graph_edges (to_node_id, edge_type);

-- ── LLM output cache (persistent, complements Redis) ────────────────────────

CREATE TABLE IF NOT EXISTS ff1_llm_outputs (
  id              BIGSERIAL    PRIMARY KEY,
  cache_key       TEXT         NOT NULL UNIQUE,
  model           TEXT         NOT NULL,
  task            TEXT         NOT NULL,       -- propose | summarize | index | tag
  prompt_hash     TEXT         NOT NULL,
  context_hash    TEXT,
  output          JSONB        NOT NULL,
  token_input     INTEGER      NOT NULL DEFAULT 0,
  token_output    INTEGER      NOT NULL DEFAULT 0,
  latency_ms      INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ff1_llm_task_created
  ON ff1_llm_outputs (task, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ff1_llm_output
  ON ff1_llm_outputs USING GIN (output jsonb_path_ops);
