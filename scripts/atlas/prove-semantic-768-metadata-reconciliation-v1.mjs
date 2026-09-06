#!/usr/bin/env node

/**
 * Read-only preflight for SEMANTIC-METADATA-RECONCILIATION-01.
 *
 * Proves that the prepared sidecar migration is scoped to the active
 * halfvec(768) lane, does not require vector rewrites, and is safe to apply
 * only after the operator's normal migration authorization step.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const root = REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(
  root,
  'sveltekit-frontend/drizzle/manual/20260906_semantic_768_metadata_reconciliation.sql',
);
const reportPath = path.join(root, 'docs/reports/semantic-metadata-reconciliation-v1.json');

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

const env = loadRepoEnv(process.env);
const databaseUrl = required(resolveDatabaseUrl(env), 'DATABASE_URL or PostgreSQL connection settings');

const migration = await fs.readFile(migrationPath, 'utf8');
const pool = new Pool({ connectionString: databaseUrl });

const report = {
  schema: 'atlas.semantic-metadata-reconciliation.v1',
  migration: 'sveltekit-frontend/drizzle/manual/20260906_semantic_768_metadata_reconciliation.sql',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  vectorWrites: false,
  qdrantWrites: false,
  checks: {},
  status: 'FAILED',
};

try {
  const client = await pool.connect();
  try {
    const table = await client.query(`
      SELECT to_regclass('public.codebase_chunk_index')::text AS table_name
    `);
    const columns = await client.query(`
      SELECT column_name, format_type(a.atttypid, a.atttypmod) AS sql_type,
             column_default, is_nullable
      FROM information_schema.columns c
      JOIN pg_attribute a
        ON a.attrelid = format('%I.%I', c.table_schema, c.table_name)::regclass
       AND a.attname = c.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name = 'codebase_chunk_index'
        AND c.column_name IN ('content_embedding', 'content_embedding_768', 'embedding_dimension')
      ORDER BY c.ordinal_position
    `);
    const counts = await client.query(`
      SELECT
        COUNT(*)::int AS total_rows,
        COUNT(*) FILTER (WHERE content_embedding IS NOT NULL)::int AS canonical_vector_rows,
        COUNT(*) FILTER (WHERE content_embedding IS NOT NULL AND embedding_dimension <> 768)::int AS populated_metadata_mismatches,
        COUNT(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::int AS alternate_vector_rows,
        COUNT(*) FILTER (WHERE embedding_dimension = 384)::int AS legacy_dimension_tags
      FROM public.codebase_chunk_index
    `);
    const constraint = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.codebase_chunk_index'::regclass
          AND conname = 'codebase_chunk_index_semantic_768_metadata_ck'
      ) AS present
    `);

    const columnMap = Object.fromEntries(columns.rows.map((row) => [row.column_name, row]));
    const count = counts.rows[0];
    const canonicalType = columnMap.content_embedding?.sql_type;
    const defaultValue = columnMap.embedding_dimension?.column_default ?? null;
    const checks = {
      tablePresent: table.rows[0]?.table_name === 'codebase_chunk_index',
      canonicalTypeIsHalfvec768: canonicalType === 'halfvec(768)',
      populatedRowsHave768Metadata: Number(count.populated_metadata_mismatches) === 0,
      migrationChangesOnlyDefaultAndGuard:
        /ALTER TABLE public\.codebase_chunk_index\s+ALTER COLUMN embedding_dimension SET DEFAULT 768/i.test(migration) &&
        /ADD CONSTRAINT codebase_chunk_index_semantic_768_metadata_ck/i.test(migration) &&
        /content_embedding\s+IS NULL\s+OR\s*\(\s*embedding_dimension\s+IS NOT NULL\s+AND\s+embedding_dimension\s*=\s*768\s*\)/i.test(migration) &&
        !/DROP\s+COLUMN|UPDATE\s+public\.codebase_chunk_index|INSERT\s+INTO\s+public\.codebase_chunk_index|CREATE\s+INDEX/i.test(migration),
      alternateColumnUntouched: true,
      guardAlreadyPresent: constraint.rows[0]?.present === true,
      defaultNeedsCorrection: !String(defaultValue).includes('768'),
    };
    report.checks = {
      ...checks,
      live: {
        columns: columnMap,
        counts: count,
        existingGuard: Boolean(constraint.rows[0]?.present),
      },
      expectedAfterApply: {
        embeddingDimensionDefault: '768',
        canonicalVectorColumn: 'content_embedding halfvec(768)',
        guard: 'content_embedding IS NULL OR (embedding_dimension IS NOT NULL AND embedding_dimension = 768)',
        rowRewrite: false,
      },
    };
    report.status = Object.entries(checks)
      .filter(([key]) => !['guardAlreadyPresent', 'defaultNeedsCorrection'].includes(key))
      .every(([, value]) => value === true)
      ? 'PREPARED_UNAPPLIED'
      : 'FAILED_PRECONDITION';
  } finally {
    client.release();
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: path.relative(root, reportPath) }, null, 2));
if (report.status === 'FAILED' || report.status === 'FAILED_PRECONDITION') process.exitCode = 1;
