#!/usr/bin/env node
/**
 * Applies drizzle/manual/20260915_codebase_chunk_index_whole_file_hash.sql
 * by hand (this file lives under drizzle/manual/, not the drizzle-kit
 * journal, per this repo's established convention -- see
 * 20260909_atlas_packets_source_revision.sql for the precedent).
 *
 * Statements run individually via separate pool.query() calls, never as one
 * combined multi-statement string. This matters specifically for
 * CREATE INDEX CONCURRENTLY, which cannot run inside ANY transaction block,
 * including the implicit one Postgres opens for a multi-statement simple-query
 * string -- sending the whole file as one query would fail.
 *
 * Owner: openspec/changes/parent-atlas-chunk-index-whole-file-hash (task 3.3
 * follow-up, explicitly human-authorized 2026-09-15).
 *
 * Usage: node scripts/atlas/apply-codebase-chunk-index-whole-file-hash-columns-v1.mjs
 */
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  statement_timeout: 300_000,
  application_name: 'apply-codebase-chunk-index-whole-file-hash-columns-v1',
});

const NEW_COLUMNS = [
  'file_content_hash text',
  'content_hash_scope text',
  'content_hash_algorithm text',
  'content_hash_length integer',
  'content_hash_version integer',
];

const CONSTRAINT_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'codebase_chunk_index_content_hash_scope_check'
  ) THEN
    ALTER TABLE codebase_chunk_index
      ADD CONSTRAINT codebase_chunk_index_content_hash_scope_check
      CHECK (content_hash_scope IS NULL OR content_hash_scope IN ('chunk', 'whole_file'));
  END IF;
END $$;
`;

const INDEX_SQL = `
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_file_content_hash
  ON codebase_chunk_index (source_ref, file_content_hash)
  WHERE file_content_hash IS NOT NULL;
`;

const results = { columns: [], constraint: null, index: null, error: null };

try {
  for (const columnDef of NEW_COLUMNS) {
    const [name] = columnDef.split(' ');
    await pool.query(`ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS ${columnDef}`);
    results.columns.push({ name, status: 'ADDED_OR_ALREADY_PRESENT' });
    console.log(`  + column ${name}: OK`);
  }

  await pool.query(CONSTRAINT_SQL);
  results.constraint = 'ADDED_OR_ALREADY_PRESENT';
  console.log('  + constraint codebase_chunk_index_content_hash_scope_check: OK');

  await pool.query(INDEX_SQL);
  results.index = 'CREATED_OR_ALREADY_PRESENT';
  console.log('  + index idx_codebase_chunk_index_file_content_hash: OK');

  // Read-back verification: confirm all 5 columns, the constraint, and the index now exist live.
  const colCheck = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='codebase_chunk_index'
       AND column_name IN ('file_content_hash','content_hash_scope','content_hash_algorithm','content_hash_length','content_hash_version')
     ORDER BY column_name`,
  );
  const constraintCheck = await pool.query(
    `SELECT conname FROM pg_constraint WHERE conname = 'codebase_chunk_index_content_hash_scope_check'`,
  );
  const indexCheck = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename='codebase_chunk_index' AND indexname='idx_codebase_chunk_index_file_content_hash'`,
  );
  const nullCountCheck = await pool.query(
    `SELECT count(*)::int AS total,
            count(file_content_hash)::int AS file_content_hash_populated,
            count(content_hash_scope)::int AS content_hash_scope_populated
       FROM codebase_chunk_index`,
  );

  console.log('\n--- Readback verification ---');
  console.log('Columns:', JSON.stringify(colCheck.rows));
  console.log('Constraint:', JSON.stringify(constraintCheck.rows));
  console.log('Index:', JSON.stringify(indexCheck.rows));
  console.log('Row counts (must show 0 populated -- no backfill performed):', JSON.stringify(nullCountCheck.rows[0]));

  results.readback = {
    columnsFound: colCheck.rows.length,
    constraintFound: constraintCheck.rows.length === 1,
    indexFound: indexCheck.rows.length === 1,
    totalRows: nullCountCheck.rows[0].total,
    fileContentHashPopulated: nullCountCheck.rows[0].file_content_hash_populated,
    contentHashScopePopulated: nullCountCheck.rows[0].content_hash_scope_populated,
  };
} catch (caught) {
  results.error = caught instanceof Error ? caught.message : String(caught);
  console.error('ERROR:', results.error);
} finally {
  await pool.end();
}

console.log('\n=== Final result ===');
console.log(JSON.stringify(results, null, 2));
process.exit(results.error ? 1 : 0);
