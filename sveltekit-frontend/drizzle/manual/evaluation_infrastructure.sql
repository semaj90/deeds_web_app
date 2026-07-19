-- Evaluation infrastructure for atlas benchmark runs.
-- Applied manually (not in drizzle journal).

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type     TEXT NOT NULL,
  benchmark_name TEXT NOT NULL,
  dataset_version TEXT,
  implementation_version TEXT,
  config       JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'running',
  passed       BOOLEAN,
  artifact_path TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_type
  ON evaluation_runs (run_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_benchmark
  ON evaluation_runs (benchmark_name, created_at DESC);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  query_id     TEXT,
  result_scope TEXT NOT NULL DEFAULT 'per_query',  -- 'per_query' | 'aggregate'
  metrics      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_results_run
  ON evaluation_results (run_id);

CREATE INDEX IF NOT EXISTS idx_evaluation_results_scope
  ON evaluation_results (run_id, result_scope);
