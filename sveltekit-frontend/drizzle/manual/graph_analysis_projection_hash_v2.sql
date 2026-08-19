-- Parent Atlas graph analysis lineage hardening.
-- Additive and legacy-safe: historical runs may not have enough projection
-- information to reconstruct a truthful hash, so projection_hash remains NULL
-- for those rows. New GraphAnalysisRunV2 writers must provide a non-null value.

ALTER TABLE graph_analysis_runs
  ADD COLUMN IF NOT EXISTS projection_hash text;

CREATE INDEX IF NOT EXISTS graph_analysis_runs_projection_hash_idx
  ON graph_analysis_runs (projection_hash);

COMMENT ON COLUMN graph_analysis_runs.projection_hash IS
  'Canonical hash of the complete graph projection semantics. Required by GraphAnalysisRunV2; NULL means legacy/unqualified run and must not be promoted through V2 lineage gates.';
