ALTER TABLE atlas_retrieval_eval_times
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS accelerator text,
  ADD COLUMN IF NOT EXISTS cuda_available boolean,
  ADD COLUMN IF NOT EXISTS cuvs_enabled boolean,
  ADD COLUMN IF NOT EXISTS matmul_ms real,
  ADD COLUMN IF NOT EXISTS embedding_ms real,
  ADD COLUMN IF NOT EXISTS verdict text;

CREATE INDEX IF NOT EXISTS idx_eval_times_protocol
  ON atlas_retrieval_eval_times (protocol);

CREATE INDEX IF NOT EXISTS idx_eval_times_accelerator
  ON atlas_retrieval_eval_times (accelerator);

CREATE INDEX IF NOT EXISTS idx_eval_times_verdict
  ON atlas_retrieval_eval_times (verdict);
