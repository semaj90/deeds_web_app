-- Read-only inspection of the active packet-key ORF table before any additive lineage migration.
-- Never apply the superseded 20260819_atlas_observation_feature_rows_v1.sql migration.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5000ms';

WITH columns AS (
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'atlas_observation_feature_rows'
), wanted AS (
  SELECT *
  FROM (VALUES
    ('packet_key'),
    ('feature_revision'),
    ('source_revision'),
    ('registry_revision'),
    ('workspace_revision'),
    ('source_version_receipt_id'),
    ('producer_revision'),
    ('input_digest')
  ) AS requested(name)
), coverage AS (
  SELECT wanted.name, columns.data_type, columns.is_nullable,
         (columns.column_name IS NOT NULL) AS present
  FROM wanted
  LEFT JOIN columns ON columns.column_name = wanted.name
)
SELECT json_build_object(
  'schema', 'atlas.orf-lineage-migration-readiness.v1',
  'tablePresent', to_regclass('public.atlas_observation_feature_rows') IS NOT NULL,
  'columns', (SELECT json_agg(row_to_json(coverage) ORDER BY name) FROM coverage),
  'indexes', (
    SELECT json_agg(indexdef ORDER BY indexname)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'atlas_observation_feature_rows'
  ),
  'legacyRowsMustRemainUnqualified', true,
  'migrationAuthorized', false,
  'readOnly', true
)::text;

ROLLBACK;
