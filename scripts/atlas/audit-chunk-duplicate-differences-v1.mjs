#!/usr/bin/env node

import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env.local'), override: true, quiet: true });

const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
if (!outputArg) throw new Error('EXPLICIT_SCRATCH_OUTPUT_REQUIRED');
const outputPath = resolve(root, outputArg);
if (!outputPath.startsWith(`${resolve(root, '.tmp')}/`) && !outputPath.startsWith(`${resolve(root, '.tmp')}\\`)) {
  throw new Error('OUTPUT_MUST_BE_UNDER_TMP');
}

const config = {
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15_000,
};
if (!config.password) throw new Error('POSTGRES_PASSWORD_NOT_CONFIGURED');

const pool = new pg.Pool(config);
const client = await pool.connect();
let rows;
let summary;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '90000ms'");
  summary = (await client.query(`
    WITH duplicate_groups AS (
      SELECT chunk_id, content_hash, count(*)::int AS row_count
      FROM public.codebase_chunk_index
      WHERE chunk_id IS NOT NULL AND content_hash IS NOT NULL
      GROUP BY chunk_id, content_hash
      HAVING count(*) > 1
    )
    SELECT count(*)::int AS duplicate_groups,
      sum(row_count - 1)::int AS excess_rows,
      max(row_count)::int AS max_group_size,
      count(*) FILTER (WHERE row_count = 2)::int AS two_row_groups,
      count(*) FILTER (WHERE row_count = 3)::int AS three_row_groups
    FROM duplicate_groups
  `)).rows[0];
  rows = (await client.query(`
    WITH duplicate_groups AS (
      SELECT chunk_id, content_hash
      FROM public.codebase_chunk_index
      WHERE chunk_id IS NOT NULL AND content_hash IS NOT NULL
      GROUP BY chunk_id, content_hash
      HAVING count(*) > 1
    ), per_column AS (
      SELECT d.chunk_id, d.content_hash, e.key AS column_name,
        count(DISTINCT e.value) AS distinct_values
      FROM duplicate_groups d
      JOIN public.codebase_chunk_index c USING (chunk_id, content_hash)
      CROSS JOIN LATERAL jsonb_each(to_jsonb(c)) AS e(key, value)
      WHERE e.key <> 'id'
      GROUP BY d.chunk_id, d.content_hash, e.key
    )
    SELECT column_name,
      count(*) FILTER (WHERE distinct_values > 1)::int AS differing_groups,
      max(distinct_values)::int AS max_distinct_values
    FROM per_column
    GROUP BY column_name
    HAVING count(*) FILTER (WHERE distinct_values > 1) > 0
    ORDER BY differing_groups DESC, column_name
  `)).rows;
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}

const timestampOnly = rows.filter((row) => /(?:_at|_date)$/i.test(row.column_name));
const otherDifferences = rows.filter((row) => !/(?:_at|_date)$/i.test(row.column_name));
const body = {
  schema: 'atlas.chunk-duplicate-differences.v1',
  generatedAt: new Date().toISOString(),
  mode: 'REPEATABLE_READ_READ_ONLY',
  identityGroup: ['chunk_id', 'content_hash'],
  summary,
  differingColumns: rows,
  timestampOnlyDifferences: timestampOnly,
  nonTimestampDifferences: otherDifferences,
  canonicalAuthority: false,
  writesPerformed: false,
};
body.receiptChecksum = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ ...body, reportPath: outputArg }, null, 2)}\n`);
