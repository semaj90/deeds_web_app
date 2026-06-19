ALTER TABLE atlas_retrieval_eval_times
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS bm25_ms real,
  ADD COLUMN IF NOT EXISTS result_count integer,
  ADD COLUMN IF NOT EXISTS error text;

CREATE INDEX IF NOT EXISTS idx_eval_times_route
  ON atlas_retrieval_eval_times (route);

CREATE INDEX IF NOT EXISTS idx_eval_times_result_count
  ON atlas_retrieval_eval_times (result_count);
