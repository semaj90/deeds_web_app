-- Experiment Analysis Run/Promotion Contract — ablation / parity lane.
-- This compares graph and model runs; it does not own their lineage.

CREATE TABLE IF NOT EXISTS experiment_analysis_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  algorithm text NOT NULL DEFAULT 'experiment',
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
  experiment_kind text NOT NULL,
  baseline_run_id uuid,
  candidate_run_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metric_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  pass_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparison_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS experiment_analysis_runs_algorithm_idx ON experiment_analysis_runs (algorithm, started_at);
CREATE INDEX IF NOT EXISTS experiment_analysis_runs_kind_idx ON experiment_analysis_runs (experiment_kind);
CREATE INDEX IF NOT EXISTS experiment_analysis_runs_status_idx ON experiment_analysis_runs (status);

CREATE TABLE IF NOT EXISTS experiment_analysis_results (
  run_id uuid NOT NULL,
  metric_name text NOT NULL,
  baseline_value double precision,
  candidate_value double precision,
  delta double precision,
  passed boolean NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, metric_name)
);

CREATE INDEX IF NOT EXISTS experiment_analysis_results_run_idx ON experiment_analysis_results (run_id);
CREATE INDEX IF NOT EXISTS experiment_analysis_results_metric_idx ON experiment_analysis_results (metric_name);
