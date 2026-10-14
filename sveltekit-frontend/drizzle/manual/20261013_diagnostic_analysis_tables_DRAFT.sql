-- DRAFT — NOT APPLIED. For review only.
-- Purpose: persist diagnostic analysis outputs that do not belong in error_logs:
--   1. diagnostic_ast_facts        structural facts from ast-grep / ts-morph / Tree-sitter / Svelte compiler
--   2. diagnostic_dag_runs         deterministic repair-DAG synthesis runs (one per log checksum)
--   3. diagnostic_recommendations  ranked proposals (rule, AST, or low-rank), always PROPOSED on insert
-- Rules applied: all keys are text checksums or fingerprints (no bulk vectors); low-rank factors
-- are references to external artifacts, never inline arrays; new rows are proposals only.
-- Target: PostgreSQL 18.4, legal_ai_db. All statements are CREATE ... IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS diagnostic_ast_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  log_sha256 text,
  source_ref text NOT NULL,
  source_sha256 text NOT NULL,
  analyzer text NOT NULL CHECK (analyzer IN ('ast-grep', 'ts-morph', 'tree-sitter', 'svelte-compiler')),
  analyzer_version text NOT NULL,
  node_kind text,
  span_start integer,
  span_end integer,
  symbol_name text,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (span_start IS NULL OR span_end IS NULL OR span_end >= span_start)
);

-- Idempotent per (diagnostic, source bytes, analyzer, span). Null spans map to -1 for uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_ast_facts_identity_uidx
  ON diagnostic_ast_facts (fingerprint, analyzer, analyzer_version, source_sha256,
                           (coalesce(span_start, -1)), (coalesce(span_end, -1)));
CREATE INDEX IF NOT EXISTS diagnostic_ast_facts_fingerprint_idx ON diagnostic_ast_facts (fingerprint);
CREATE INDEX IF NOT EXISTS diagnostic_ast_facts_source_idx ON diagnostic_ast_facts (source_ref);

CREATE TABLE IF NOT EXISTS diagnostic_dag_runs (
  run_id text PRIMARY KEY,
  log_sha256 text NOT NULL,
  synthesizer_version text NOT NULL,
  node_count integer NOT NULL CHECK (node_count >= 0),
  edge_count integer NOT NULL CHECK (edge_count >= 0),
  dag jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnostic_dag_runs_log_idx ON diagnostic_dag_runs (log_sha256);

CREATE TABLE IF NOT EXISTS diagnostic_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_run_id text NOT NULL REFERENCES diagnostic_dag_runs (run_id),
  fingerprint text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 1),
  method text NOT NULL CHECK (method IN ('rule', 'ast', 'low-rank')),
  score double precision,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'REJECTED', 'ACCEPTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dag_run_id, fingerprint, method, rank)
);

CREATE INDEX IF NOT EXISTS diagnostic_recommendations_fingerprint_idx ON diagnostic_recommendations (fingerprint);

COMMIT;

-- Rollback (owner decision only; valid while the tables are empty):
--   DROP TABLE IF EXISTS diagnostic_recommendations, diagnostic_dag_runs, diagnostic_ast_facts;
