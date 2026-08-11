-- PF4B current-eligible materialization for analysis pass history.
-- This view selects one row per logical pass identity using the most recent
-- successful receipt as the current materialization. It keeps the execution
-- ledger append-only and moves "current" semantics to a separate projection.

CREATE OR REPLACE VIEW analysis_pass_current AS
SELECT DISTINCT ON (packet_key, source_revision, pass_type, pass_revision, input_hash)
  id,
  packet_key,
  source_revision,
  pass_type,
  pass_revision,
  input_hash,
  status,
  output,
  scores,
  provenance,
  model_name,
  prompt_hash,
  temperature,
  created_at,
  updated_at
FROM analysis_pass_results
WHERE status = 'succeeded'
ORDER BY packet_key, source_revision, pass_type, pass_revision, input_hash, created_at DESC, id DESC;
