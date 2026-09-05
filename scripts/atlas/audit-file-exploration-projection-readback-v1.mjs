import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/file-exploration-projection-readback-v1.json');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 20_000 });

try {
  const columns = (await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
      ORDER BY ordinal_position`,
  )).rows;
  const names = new Set(columns.map((column) => column.column_name));
  const counts = (await pool.query(
    `SELECT COUNT(*)::int AS rows,
            COUNT(*) FILTER (WHERE source_ref IS NOT NULL)::int AS source_ref_rows,
            COUNT(*) FILTER (WHERE content_hash IS NOT NULL)::int AS content_hash_rows,
            COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND content_hash IS NOT NULL)::int AS joinable_rows,
            COUNT(*) FILTER (WHERE embedding_dimension = 768)::int AS semantic_768_rows,
            COUNT(*) FILTER (WHERE search_vector IS NOT NULL)::int AS fts_rows
       FROM public.codebase_chunk_index`,
  )).rows[0];
  const metadataKeys = names.has('output_meta')
    ? (await pool.query(
      `SELECT DISTINCT jsonb_object_keys(output_meta) AS key
         FROM public.codebase_chunk_index
        WHERE output_meta IS NOT NULL AND jsonb_typeof(output_meta) = 'object'
        ORDER BY key`,
    )).rows.map((row) => row.key)
    : [];
  const sample = (await pool.query(
    `SELECT source_ref, content_hash, embedding_dimension, embedding_version,
            CASE WHEN output_meta IS NULL THEN NULL ELSE output_meta::text END AS output_meta
       FROM public.codebase_chunk_index
      WHERE source_ref IS NOT NULL
      ORDER BY id
      LIMIT 5`,
  )).rows;
  const required = ['source_ref', 'source_revision', 'workspace_revision', 'content_hash', 'search_vector', 'ast_symbols'];
  const missingRequired = required.filter((column) => !names.has(column));
  const report = {
    schema: 'atlas.file-exploration-projection-readback.v1',
    gate: 'ATLAS-FILE-EXPLORATION-INDEX-06',
    status: missingRequired.includes('source_revision') || missingRequired.includes('workspace_revision')
      ? 'PROJECTION_OWNER_FOUND_LINEAGE_COLUMNS_MISSING'
      : 'PROJECTION_READBACK_READY_FOR_BOUNDED_IDEMPOTENCY',
    owner: 'public.codebase_chunk_index',
    columns,
    requiredColumns: required,
    missingRequired,
    counts,
    metadataKeys,
    sample,
    policy: 'readback only; no schema migration or projection writes in this gate',
    canonicalAuthority: false,
    readOnly: true,
    writesPerformed: false,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, missingRequired, counts, report: reportPath }, null, 2));
} finally {
  await pool.end();
}
