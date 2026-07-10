CREATE TABLE IF NOT EXISTS cache_probe_runs (
  run_id UUID PRIMARY KEY,
  context_hash VARCHAR(64) NOT NULL,
  context_chars INT NOT NULL,
  iterations INT NOT NULL,
  source_file TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cache_probe_results (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES cache_probe_runs(run_id) ON DELETE CASCADE,
  case_id VARCHAR(32) NOT NULL,
  iteration INT NOT NULL,
  layer VARCHAR(64) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  total_ms INT,
  prompt_tokens INT,
  completion_tokens INT,
  prompt_eval_tokens INT,
  prompt_eval_ms INT,
  generation_ms INT,
  ttft_ms INT,
  reused_prefix_tokens INT,
  slot_id INT,
  lookup_ms INT,
  cache_hit BOOLEAN,
  inferred_cache_hit BOOLEAN,
  reason TEXT,
  error TEXT,
  context_hash VARCHAR(64) NOT NULL,
  execution_order INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_probe_runs_created_at ON cache_probe_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_probe_results_run ON cache_probe_results(run_id);
CREATE INDEX IF NOT EXISTS idx_cache_probe_results_case ON cache_probe_results(case_id);
CREATE INDEX IF NOT EXISTS idx_cache_probe_results_layer ON cache_probe_results(layer);
