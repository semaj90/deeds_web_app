\pset tuples_only off
\pset format aligned
SET statement_timeout = '20s';
BEGIN TRANSACTION READ ONLY;

-- Server identity
SELECT
  current_database() AS database_name,
  current_user AS user_name,
  current_setting('server_version') AS server_version,
  inet_server_addr() AS server_address,
  inet_server_port() AS server_port;

-- Tables with JSON/JSONB columns
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns AS c
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND c.data_type IN ('json', 'jsonb')
ORDER BY
  c.table_schema,
  c.table_name,
  c.ordinal_position;

-- All indexes associated with tables that contain JSON/JSONB columns
WITH json_tables AS (
  SELECT DISTINCT table_schema, table_name
  FROM information_schema.columns
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND data_type IN ('json', 'jsonb')
)
SELECT
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes AS i
JOIN json_tables AS j
  ON j.table_schema = i.schemaname
 AND j.table_name = i.tablename
ORDER BY
  i.schemaname,
  i.tablename,
  i.indexname;

-- Expression indexes and operator classes useful for JSONB review
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS table_name,
  idx.relname AS index_name,
  am.amname AS access_method,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_index AS ix
JOIN pg_class AS idx ON idx.oid = ix.indexrelid
JOIN pg_class AS tbl ON tbl.oid = ix.indrelid
JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
JOIN pg_am AS am ON am.oid = idx.relam
WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_get_indexdef(ix.indexrelid) ILIKE '%json%'
ORDER BY
  ns.nspname,
  tbl.relname,
  idx.relname;

-- Candidate identity columns for reconciliation
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND column_name IN (
    'packet_key',
    'qdrant_point_id',
    'workspace_id',
    'workspace_revision',
    'source_ref',
    'source_revision',
    'content_hash',
    'representation_id',
    'representation_revision',
    'chunk_id',
    'symbol_id',
    'symbol_version_id',
    'tree_node_id',
    'metadata',
    'payload'
  )
ORDER BY
  table_schema,
  table_name,
  column_name;

-- Estimated table sizes, sorted largest first
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS estimated_rows,
  pg_total_relation_size(relid) AS total_bytes,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY
  pg_total_relation_size(relid) DESC,
  schemaname,
  relname;

ROLLBACK;
