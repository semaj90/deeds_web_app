-- Read-only topology ownership inventory.
-- Run only with a read-only PostgreSQL role against legal_ai_db on loopback.
-- This script refuses any other database name or PostgreSQL major version.
\set ON_ERROR_STOP on

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '2s';

SELECT current_database() = 'legal_ai_db'
         AND inet_server_port() = 5432
         AND host(inet_client_addr()) IN ('127.0.0.1', '::1') AS target_db_ok,
       current_setting('server_version_num')::integer >= 180000
         AND current_setting('server_version_num')::integer < 190000 AS pg18_ok
\gset

\if :target_db_ok
\else
  \echo 'REFUSED: connected database is not legal_ai_db'
  ROLLBACK;
  \quit 3
\endif

\if :pg18_ok
\else
  \echo 'REFUSED: server is not PostgreSQL 18.x'
  ROLLBACK;
  \quit 3
\endif

SELECT jsonb_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'serverVersionNum', current_setting('server_version_num'),
  'serverAddress', inet_server_addr(),
  'serverPort', inet_server_port(),
  'clientAddress', inet_client_addr(),
  'role', current_user,
  'transactionReadOnly', current_setting('transaction_read_only')
) AS target_identity;

SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind AS relation_kind,
       pg_get_userbyid(c.relowner) AS owner,
       c.reltuples::bigint AS estimated_rows,
       pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('atlas_topology_index', 'tensor_analysis_cache')
ORDER BY c.relname;

SELECT table_name,
       ordinal_position,
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('atlas_topology_index', 'tensor_analysis_cache')
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('atlas_topology_index', 'tensor_analysis_cache')
ORDER BY tablename, indexname;

SELECT c.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('atlas_topology_index', 'tensor_analysis_cache')
ORDER BY c.relname, con.conname;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('atlas_topology_index', 'tensor_analysis_cache')
  AND column_name ~* '(source|workspace|representation|model|cohort|snapshot|revision|checksum|hash|run_id|computed_at|updated_at|source_ref|packet_key)'
ORDER BY table_name, column_name;

SELECT to_regclass('public.atlas_topology_index') IS NOT NULL AS topology_present,
       to_regclass('public.tensor_analysis_cache') IS NOT NULL AS tensor_cache_present
\gset

\if :topology_present
  SELECT 'atlas_topology_index' AS relation_name, count(*) AS exact_rows
  FROM public.atlas_topology_index;

  -- Exact null/non-null coverage for revision and provenance fields actually
  -- present in this relation. No row payloads are returned.
  SELECT field_name,
         count(*) FILTER (WHERE field_value <> 'null'::jsonb) AS populated_rows,
         count(*) FILTER (WHERE field_value = 'null'::jsonb) AS null_rows
  FROM public.atlas_topology_index AS t
  CROSS JOIN LATERAL jsonb_each(to_jsonb(t)) AS f(field_name, field_value)
  WHERE field_name ~* '(source|workspace|representation|model|cohort|snapshot|revision|checksum|hash|run_id|computed_at|updated_at|source_ref|packet_key)'
  GROUP BY field_name
  ORDER BY field_name;
\else
  \echo 'MISSING: public.atlas_topology_index'
\endif

\if :tensor_cache_present
  SELECT 'tensor_analysis_cache' AS relation_name,
         c.reltuples::bigint AS estimated_rows,
         pg_total_relation_size(c.oid) AS total_bytes
  FROM pg_class AS c
  WHERE c.oid = 'public.tensor_analysis_cache'::regclass;
\else
  \echo 'MISSING: public.tensor_analysis_cache'
\endif

ROLLBACK;
