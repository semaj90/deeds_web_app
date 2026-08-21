import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { loadRuntimeEnv } from '../../sveltekit-frontend/src/lib/server/config/load-runtime-env.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });
loadRuntimeEnv({ cwd: process.cwd(), mode: 'development' });

const reportPath = path.join(process.cwd(), 'docs', 'reports', 'live-source-lineage-table-audit.json');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
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
  diagnostics: [],
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
      )
    ORDER BY table_schema, table_name
  `);
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
  report.status = graphifyFiles && sourceRevisionOwner
    ? 'SOURCE_LINEAGE_OWNER_CANDIDATE_PRESENT'
    : 'SOURCE_LINEAGE_OWNER_NOT_FOUND';
} catch (error) {
  report.status = 'READBACK_BLOCKED';
  report.diagnostics = [error instanceof Error ? error.message : String(error)];
} finally {
  await pool.end();
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath), canonicalWrites: false }, null, 2));
