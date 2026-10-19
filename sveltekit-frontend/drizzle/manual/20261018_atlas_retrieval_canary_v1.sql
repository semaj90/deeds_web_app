-- Retrieval canary registry (2026-10-18). ADDITIVE and idempotent. EVIDENCE ONLY: canonical = false.
-- Records a frozen-canary run (header) and its ordered hyperparameter sweep (one row per sequence_id,
-- e.g. 'turbovec-http-ann:k=100') so retrieval hyperparameters can be compared and chosen procedurally.
-- Why not reuse existing tables: model_analysis_runs/model_analysis_results (PK run_id+sequence_id) are the
-- HMM/Viterbi decoder tables (decoded_path/log_probability NOT NULL, 0 rows); benchmark_results is fixed to
-- full-vs-latent64 top-k (0 rows). Same (run, sequence_id) convention is reused here, not those tables.
-- A canary never mints identity, never writes retrieval state, and never adds a retrieval vote.

CREATE TABLE IF NOT EXISTS atlas_retrieval_canary_runs_v1 (
  canary_id             uuid PRIMARY KEY DEFAULT uuidv7(),
  canary_name           text    NOT NULL,
  executor              text    NOT NULL,
  logical_lane          text    NOT NULL DEFAULT 'semantic_768',
  representation_id     text    NOT NULL,
  dim                   integer NOT NULL CHECK (dim > 0),
  bits                  integer,
  corpus_rows           bigint  NOT NULL CHECK (corpus_rows > 0),
  query_count           integer NOT NULL CHECK (query_count > 0),
  query_set_rule        text    NOT NULL,
  truth_oracle          text    NOT NULL,
  truth_checksum        text    NOT NULL,
  script_sha256         text,
  oracle_total_s        numeric,
  oracle_ms_per_query   numeric,
  load_s                numeric,
  errors                integer NOT NULL DEFAULT 0,
  workspace_revision    text,
  source_revision       text,
  sidecar_health        jsonb   NOT NULL DEFAULT '{}'::jsonb,
  receipt_checksum      text    NOT NULL UNIQUE,
  canary_writes_performed boolean NOT NULL DEFAULT false CHECK (canary_writes_performed = false),
  canonical             boolean NOT NULL DEFAULT false CHECK (canonical = false),
  recorded_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_retrieval_canary_sequence_v1 (
  canary_id        uuid    NOT NULL REFERENCES atlas_retrieval_canary_runs_v1 (canary_id) ON DELETE RESTRICT,
  sequence_no      integer NOT NULL CHECK (sequence_no >= 0),
  sequence_id      text    NOT NULL,
  hyperparameters  jsonb   NOT NULL,
  recall_top10     numeric NOT NULL CHECK (recall_top10 BETWEEN 0 AND 1),
  mrr_exact_nn1    numeric CHECK (mrr_exact_nn1 BETWEEN 0 AND 1),
  p50_ms           numeric,
  p95_ms           numeric,
  canonical        boolean NOT NULL DEFAULT false CHECK (canonical = false),
  PRIMARY KEY (canary_id, sequence_id),
  UNIQUE (canary_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_retrieval_canary_sequence_v1_hyper
  ON atlas_retrieval_canary_sequence_v1 USING gin (hyperparameters jsonb_path_ops);
