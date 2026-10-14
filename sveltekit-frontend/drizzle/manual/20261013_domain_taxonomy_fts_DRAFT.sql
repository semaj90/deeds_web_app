-- DRAFT — NOT APPLIED. Requires operator approval; nothing here has been rehearsed.
--
-- Purpose: full-text search over taxonomy terms (domain_taxonomy_v1 and atlas_domain_ontology).
-- Additive only. No row data is written; generated columns are computed from existing columns.
--
-- Live state 2026-10-13: domain_taxonomy_v1 has 0 rows; atlas_domain_ontology has 17 rows.
-- Both tables are small, so plain CREATE INDEX is acceptable, but CONCURRENTLY is used anyway
-- so the draft is safe if the tables grow before it runs. CONCURRENTLY cannot run inside a
-- transaction block, so the index statements below are separate.
--
-- Note: ADD COLUMN ... GENERATED ALWAYS AS (...) STORED rewrites the table. Fine at 0/17 rows.
-- Revisit before running on a large table.

BEGIN;

ALTER TABLE domain_taxonomy_v1
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(label, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(domain_id, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

ALTER TABLE atlas_domain_ontology
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(group_label, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(group_id, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

COMMIT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS domain_taxonomy_v1_search_tsv_gin
  ON domain_taxonomy_v1 USING gin (search_tsv);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_domain_ontology_search_tsv_gin
  ON atlas_domain_ontology USING gin (search_tsv);

-- Verification (read-only, after the indexes exist):
--   EXPLAIN (VERBOSE, SETTINGS) SELECT domain_id FROM domain_taxonomy_v1
--     WHERE search_tsv @@ websearch_to_tsquery('english', 'machine learning') AND is_active;
--   Expect a Bitmap Index Scan on domain_taxonomy_v1_search_tsv_gin once the table has enough rows.
--   Small tables may still use a seq scan; that is a planner choice, not a failure.

-- Rollback (owner decision only):
--   DROP INDEX CONCURRENTLY IF EXISTS domain_taxonomy_v1_search_tsv_gin;
--   DROP INDEX CONCURRENTLY IF EXISTS atlas_domain_ontology_search_tsv_gin;
--   ALTER TABLE domain_taxonomy_v1 DROP COLUMN IF EXISTS search_tsv;
--   ALTER TABLE atlas_domain_ontology DROP COLUMN IF EXISTS search_tsv;
