import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/file-exploration-projection-owner-v1.json');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const candidates = ['codebase_chunk_index', 'atlas_files', 'atlas_chunks', 'atlas_file_search_index_v1'];
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 15_000 });

try {
  const tables = {};
  for (const table of candidates) {
    const relation = await pool.query('SELECT to_regclass($1)::text AS relation', [`public.${table}`]);
    const exists = Boolean(relation.rows[0]?.relation);
    const columns = exists
      ? (await pool.query(
        `SELECT column_name, data_type, udt_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [table],
      )).rows
      : [];
    tables[table] = { exists, columns };
  }

  const codebaseColumns = new Set((tables.codebase_chunk_index.columns ?? []).map((column) => column.column_name));
  const ownerAssessment = tables.codebase_chunk_index.exists && ['source_ref', 'content_hash'].every((column) => codebaseColumns.has(column))
    ? 'USE_EXISTING_CODEBASE_CHUNK_INDEX_AS_SOURCE_JOIN_OR_DERIVED_VIEW'
    : tables.atlas_file_search_index_v1.exists
      ? 'AUDIT_EXISTING_FILE_SEARCH_PROJECTION_BEFORE_USE'
      : 'NO_PROVEN_PROJECTION_OWNER';
  const report = {
    schema: 'atlas.file-exploration-projection-owner-audit.v1',
    gate: 'ATLAS-FILE-EXPLORATION-INDEX-05',
    status: ownerAssessment,
    ownerAssessment,
    tables,
    requiredFields: ['source_ref', 'workspace_revision', 'source_revision', 'content_hash', 'search_document', 'structural_digest'],
    rule: 'reuse an existing owner or view; do not create a duplicate table in this audit',
    canonicalAuthority: false,
    readOnly: true,
    writesPerformed: false,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, report: reportPath, tables: Object.fromEntries(Object.entries(tables).map(([name, value]) => [name, value.exists])) }, null, 2));
} finally {
  await pool.end();
}
