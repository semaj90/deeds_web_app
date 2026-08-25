import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildDatabaseConnectionFingerprint, connectionSource } from './lib/database-connection-fingerprint.mjs';

const reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'live-source-lineage-table-audit.json');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});

const report = {
  schema: 'atlas.live-source-lineage-table-audit.v1',
  generatedAt: new Date().toISOString(),
  status: 'BLOCKED',
  canonicalWrites: false,
  tables: [],
  candidateColumns: [],
  candidateTableEvidence: [],
  lineageOwner: {
    relation: 'public.graphify_files',
    requiredColumns: ['source_ref', 'source_revision', 'content_hash', 'workspace_revision'],
    missingColumns: [],
    rowCount: null,
    status: 'NOT_READ',
  },
  diagnostics: [],
  databaseConnection: {
    source: connectionSource(env),
    fingerprint: null,
    status: 'NOT_READ',
  },
};

const CANDIDATE_TABLES = [
  'atlas_packets',
  'atlas_ast_nodes',
  'atlas_source_refs',
  'atlas_source_revisions',
  'analysis_pass_results',
  'codebase_chunk_index',
  'file_index',
  'storage_files',
  'uploaded_files',
  'graphify_files',
];

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

try {
  const context = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS current_user,
      session_user AS session_user,
      current_schema() AS current_schema,
      current_schemas(true) AS effective_search_path,
      current_setting('search_path') AS configured_search_path,
      current_setting('server_version') AS server_version,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      to_regclass('atlas_packets')::text AS atlas_packets_visible,
      to_regclass('public.atlas_packets')::text AS public_atlas_packets,
      to_regclass('atlas_ast_nodes')::text AS atlas_ast_nodes_visible,
      to_regclass('public.atlas_ast_nodes')::text AS public_atlas_ast_nodes,
      to_regclass('graphify_files')::text AS graphify_files_visible,
      to_regclass('public.graphify_files')::text AS public_graphify_files,
      has_schema_privilege(current_user, 'public', 'USAGE') AS public_schema_usage
  `);
  const relationRows = await pool.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           c.relkind, pg_table_is_visible(c.oid) AS visible_in_search_path,
           has_table_privilege(current_user, c.oid, 'SELECT') AS selectable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ANY($1::text[])
    ORDER BY c.relname, n.nspname
  `, [CANDIDATE_TABLES]);
  report.databaseConnection.fingerprint = buildDatabaseConnectionFingerprint(
    context.rows[0], relationRows.rows,
  );
  report.databaseConnection.status = 'READBACK_PROVEN';
  const tables = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND (
        table_name ILIKE '%graph%'
        OR table_name ILIKE '%source%'
        OR table_name ILIKE '%file%'
        OR table_name ILIKE '%inventory%'
        OR table_name ILIKE '%revision%'
        OR table_name = ANY($1::text[])
      )
    ORDER BY table_schema, table_name
  `, [CANDIDATE_TABLES]);
  report.tables = tables.rows;
  const columns = await pool.query(`
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND column_name IN (
        'source_ref', 'source_revision', 'content_hash', 'content_digest',
        'workspace_revision', 'repository_revision', 'source_content', 'content'
      )
    ORDER BY table_schema, table_name, ordinal_position
  `);
  report.candidateColumns = columns.rows;
  const availableTables = new Set(
    tables.rows
      .filter((row) => row.table_schema === 'public')
      .map((row) => row.table_name),
  );
  for (const tableName of CANDIDATE_TABLES) {
    if (!availableTables.has(tableName)) {
      report.candidateTableEvidence.push({ tableName, present: false });
      continue;
    }
    const tableColumns = new Set(
      columns.rows
        .filter((row) => row.table_schema === 'public' && row.table_name === tableName)
        .map((row) => row.column_name),
    );
    const countExpr = (column) => tableColumns.has(column)
      ? `count(*) FILTER (WHERE ${quoteIdent(column)} IS NOT NULL)`
      : '0';
    const counts = await pool.query(`
      SELECT
        count(*)::integer AS row_count,
        ${countExpr('source_ref')}::integer AS source_ref_count,
        ${countExpr('source_revision')}::integer AS source_revision_count,
        ${countExpr('workspace_revision')}::integer AS workspace_revision_count,
        ${countExpr('content_hash')}::integer AS content_hash_count,
        ${countExpr('content_digest')}::integer AS content_digest_count,
        ${countExpr('source_content')}::integer AS source_content_count,
        ${countExpr('content')}::integer AS content_count
      FROM public.${quoteIdent(tableName)}
    `);
    report.candidateTableEvidence.push({
      tableName,
      present: true,
      columns: [...tableColumns].sort(),
      ...counts.rows[0],
    });
  }
  const graphifyFiles = tables.rows.some((row) => row.table_schema === 'public' && row.table_name === 'graphify_files');
  const sourceRevisionOwner = columns.rows.some((row) =>
    row.column_name === 'source_revision' && ['graphify_files', 'source_revisions', 'atlas_source_revisions'].includes(row.table_name),
  );
  const graphifyEvidence = report.candidateTableEvidence.find((row) => row.tableName === 'graphify_files');
  const requiredColumns = report.lineageOwner.requiredColumns;
  const missingColumns = requiredColumns.filter((column) => !(graphifyEvidence?.columns ?? []).includes(column));
  report.lineageOwner.missingColumns = missingColumns;
  report.lineageOwner.rowCount = graphifyEvidence?.row_count ?? null;
  report.lineageOwner.status = !graphifyFiles || !sourceRevisionOwner
    ? 'OWNER_NOT_FOUND'
    : missingColumns.length
      ? 'SCHEMA_INCOMPLETE'
      : Number(graphifyEvidence?.row_count ?? 0) === 0
        ? 'SCHEMA_READY_EMPTY'
        : 'SCHEMA_READY';
  report.status = report.lineageOwner.status === 'SCHEMA_READY' || report.lineageOwner.status === 'SCHEMA_READY_EMPTY'
    ? 'SOURCE_LINEAGE_OWNER_SCHEMA_READY'
    : report.lineageOwner.status === 'SCHEMA_INCOMPLETE'
      ? 'SOURCE_LINEAGE_OWNER_SCHEMA_INCOMPLETE'
      : 'SOURCE_LINEAGE_OWNER_NOT_FOUND';
} catch (error) {
  report.status = 'READBACK_BLOCKED';
  report.databaseConnection.status = 'READBACK_BLOCKED';
  report.diagnostics = [error instanceof Error ? error.message : String(error)];
} finally {
  await pool.end();
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath), canonicalWrites: false }, null, 2));
