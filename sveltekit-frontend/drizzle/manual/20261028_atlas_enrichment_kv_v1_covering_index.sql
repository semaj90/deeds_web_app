-- Additive v1 covering index for numeric hint lookups.
-- Run outside a transaction because CREATE INDEX CONCURRENTLY is used.
-- Existing v1 rows remain unchanged; do not reload or delete them.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_enrichment_kv_v1_key_num_covering
  ON atlas_enrichment_kv_v1 (key, value_num)
  INCLUDE (subject_kind, subject_id)
  WHERE value_type = 'number';
