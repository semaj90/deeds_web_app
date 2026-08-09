-- Model Analysis Run/Promotion Contract — sibling lane to graph analysis.
-- HMM / Viterbi / Baum-Welch / recommendation-model results live here.

CREATE TABLE IF NOT EXISTS model_analysis_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  algorithm text NOT NULL,
  algorithm_revision text NOT NULL,
  parameter_revision text NOT NULL,
  workspace_revision text NOT NULL,
  source_revision text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  backend_preference text NOT NULL DEFAULT 'native-ts',
  backend_actual text NOT NULL DEFAULT 'offline',
  gpu_accelerated boolean NOT NULL DEFAULT false,
  sidecar_url text,
  input_hash text,
  output_hash text,
  model_family text NOT NULL,
  model_revision text NOT NULL,
  corpus_revision text,
  sequence_length integer,
  observation_count integer,
  state_count integer,
  decoder_revision text,
  trainable boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS model_analysis_runs_algorithm_idx ON model_analysis_runs (algorithm, started_at);
CREATE INDEX IF NOT EXISTS model_analysis_runs_model_family_idx ON model_analysis_runs (model_family);
CREATE INDEX IF NOT EXISTS model_analysis_runs_status_idx ON model_analysis_runs (status);

CREATE TABLE IF NOT EXISTS model_analysis_results (
  run_id uuid NOT NULL,
  sequence_id text NOT NULL,
  decoded_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  log_probability double precision,
  confidence double precision,
  recommendation text,
  gpu_accelerated boolean NOT NULL DEFAULT false,
  sidecar_used boolean NOT NULL DEFAULT false,
  model_revision text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS model_analysis_results_run_idx ON model_analysis_results (run_id);
CREATE INDEX IF NOT EXISTS model_analysis_results_sequence_idx ON model_analysis_results (sequence_id);
