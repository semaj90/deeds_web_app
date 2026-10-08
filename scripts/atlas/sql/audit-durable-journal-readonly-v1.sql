-- Read-only inventory; does not assert that any run is safe to claim.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3000ms';
WITH expected(t) AS (
 VALUES ('execution_runs'),('execution_journal_steps'),('execution_dependencies'),('execution_side_effects')
), actual AS (
 SELECT e.t, to_regclass('public.' || e.t) IS NOT NULL AS present FROM expected e
), columns AS (
 SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS names
 FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN (SELECT t FROM expected)
 GROUP BY table_name
), indexes AS (
 SELECT tablename, count(*) AS index_count
 FROM pg_indexes WHERE schemaname='public' AND tablename IN (SELECT t FROM expected)
 GROUP BY tablename
)
SELECT json_build_object(
 'schema','atlas.durable-journal-readback.v1',
 'tables', (SELECT json_agg(json_build_object('name',a.t,'present',a.present,'columns',coalesce(c.names,ARRAY[]::text[]),'indexCount',coalesce(i.index_count,0)) ORDER BY a.t)
            FROM actual a LEFT JOIN columns c ON c.table_name=a.t LEFT JOIN indexes i ON i.tablename=a.t),
 'allTablesPresent',(SELECT bool_and(present) FROM actual),
 'fencingColumnsPresent', (
   SELECT coalesce(bool_and(x.column_name IS NOT NULL),false)
   FROM (VALUES ('lease_id'),('lease_expires_at'),('generation'),('state_version')) AS req(column_name)
   LEFT JOIN information_schema.columns x
   ON x.table_schema='public' AND x.table_name='execution_journal_steps' AND x.column_name=req.column_name
 ),
 'readOnly',true
)::text;
ROLLBACK;
