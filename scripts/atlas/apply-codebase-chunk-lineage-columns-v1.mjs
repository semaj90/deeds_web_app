#!/usr/bin/env node

/**
 * Additive schema gate for the current source/chunk lineage mirror.
 *
 * Default mode is read-only. Applying requires both --apply and the explicit
 * confirmation token. This script changes schema only; it never populates
 * lineage values or touches Qdrant.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm-codebase-chunk-lineage-columns-v1');
const reportPath = path.join(root, 'docs/reports/codebase-chunk-lineage-schema-v1.json');
const expectedColumns = [
  'workspace_revision',
  'source_revision',
  'representation_revision',
  'lineage_binding_checksum',
  'lineage_producer_revision',
];
const expectedIndexes = [
  'idx_codebase_chunk_index_workspace_source_lineage',
  'idx_codebase_chunk_index_source_revision',
  'idx_codebase_chunk_index_representation_revision',
  'idx_codebase_chunk_index_lineage_checksum',
];
const statements = [
  `ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS workspace_revision text`,
  `ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS source_revision text`,
  `ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS representation_revision text`,
  `ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS lineage_binding_checksum text`,
  `ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS lineage_producer_revision text`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_workspace_source_lineage ON codebase_chunk_index (workspace_revision, source_ref) WHERE workspace_revision IS NOT NULL AND source_ref IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_source_revision ON codebase_chunk_index (source_revision) WHERE source_revision IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_representation_revision ON codebase_chunk_index (representation_revision) WHERE representation_revision IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_lineage_checksum ON codebase_chunk_index (lineage_binding_checksum) WHERE lineage_binding_checksum IS NOT NULL`,
];

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120_000,
  application_name: 'atlas-codebase-chunk-lineage-schema-v1',
});

async function inspect() {
  const columns = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='codebase_chunk_index'
      AND column_name = ANY($1::text[])
    ORDER BY column_name
  `, [expectedColumns]);
  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename='codebase_chunk_index'
      AND indexname = ANY($1::text[])
    ORDER BY indexname
  `, [expectedIndexes]);
  return { columns: columns.rows, indexes: indexes.rows };
}

const before = await inspect();
const missingColumns = expectedColumns.filter((name) => !before.columns.some((row) => row.column_name === name));
const missingIndexes = expectedIndexes.filter((name) => !before.indexes.some((row) => row.indexname === name));
const report = {
  schema: 'atlas.codebase-chunk-lineage-schema.v1',
  mode: apply ? 'APPLY' : 'READ_ONLY_PLAN',
  migration: 'drizzle/manual/20260916_codebase_chunk_index_lineage.sql',
  expectedColumns,
  expectedIndexes,
  before,
  missingColumns,
  missingIndexes,
  writesPerformed: false,
  safeToApply: missingColumns.length > 0 || missingIndexes.length > 0,
};

try {
  if (apply && !confirmed) throw new Error('CODEBASE_CHUNK_LINEAGE_CONFIRMATION_REQUIRED');
  if (apply) {
    if (missingColumns.length > 0) {
      for (const statement of statements.slice(0, 5)) await pool.query(statement);
    }
    // CONCURRENTLY statements must execute outside an explicit transaction.
    for (const statement of statements.slice(5)) await pool.query(statement);
    const after = await inspect();
    report.after = after;
    report.writesPerformed = true;
    report.safeToApply = false;
    report.status = expectedColumns.every((name) => after.columns.some((row) => row.column_name === name))
      && expectedIndexes.every((name) => after.indexes.some((row) => row.indexname === name))
      ? 'SCHEMA_APPLY_READBACK_PROVEN'
      : 'SCHEMA_APPLY_READBACK_MISMATCH';
  } else {
    report.status = missingColumns.length === 0 && missingIndexes.length === 0
      ? 'SCHEMA_ALREADY_ALIGNED'
      : 'SCHEMA_MIGRATION_PLAN_READY';
  }
} catch (error) {
  report.status = 'SCHEMA_APPLY_FAILED';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({
  status: report.status,
  missingColumns,
  missingIndexes,
  writesPerformed: report.writesPerformed,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
}, null, 2));
