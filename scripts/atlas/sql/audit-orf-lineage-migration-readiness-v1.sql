-- READ ONLY: inspect the active packet-key ORF table before additive lineage migration.
-- Never execute the SUPERSEDED 20260819_atlas_observation_feature_rows_v1.sql.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5000ms';
WITH columns AS (
 SELECT column_name, data_type, is_nullable
 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='atlas_observation_feature_rows'
), wanted AS (
 SELECT * FROM (VALUES
  ('packet_key'),('feature_revision'),('source_revision'),
  ('registry_revision'),('workspace_revision'),('source_version_receipt_id'),
  ('producer_revision'),('input_digest')
 ) AS t(name)
), coverage AS (
 SELECT w.name,c.data_type,c.is_nullable,(c.column_name IS NOT NULL) AS present
 FROM wanted w LEFT JOIN columns c ON c.column_name=w.name
)
SELECT json_build_object(
 'schema','atlas.orf-lineage-migration-readiness.v1',
 'tablePresent',to_regclass('public.atlas_observation_feature_rows') IS NOT NULL,
 'columns',(SELECT json_agg(row_to_json(coverage) ORDER BY name) FROM coverage),
 'indexes',(SELECT json_agg(indexdef ORDER BY indexname) FROM pg_indexes
    WHERE schemaname='public' AND tablename='atlas_observation_feature_rows'),
 'legacyRowsMustRemainUnqualified',true,'migrationAuthorized',false,
 'readOnly',true
)::text;
ROLLBACK;
