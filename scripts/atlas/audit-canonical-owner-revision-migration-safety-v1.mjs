#!/usr/bin/env node

/** Read-only safety audit for the unapplied canonical-owner revision migration. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SQL_PATH = resolve(ROOT, 'sveltekit-frontend/drizzle/manual/20260907_canonical_owner_revision_axes_v1.sql');
const REPORT = resolve(ROOT, 'docs/reports/canonical-owner-revision-migration-safety-v1.json');
const sqlText = readFileSync(SQL_PATH, 'utf8');
const forbidden = ['DROP ', 'DELETE ', 'TRUNCATE ', 'UPDATE ', 'INSERT ', 'ALTER COLUMN'];
const forbiddenTokens = forbidden.filter((token) => sqlText.toUpperCase().includes(token));
const expectedColumns = [
  ['atlas_packets', 'source_revision'],
  ['atlas_ontology_concepts', 'definition_revision'],
];

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let presentColumns = [];
try {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'atlas_packets' AND column_name = 'source_revision')
        OR (table_name = 'atlas_ontology_concepts' AND column_name = 'definition_revision'))
    ORDER BY table_name, column_name
  `);
  presentColumns = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.canonical-owner-revision-migration-safety.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_MIGRATION_SAFETY_AUDIT',
  migration: 'manual/20260907_canonical_owner_revision_axes_v1.sql',
  sqlChecks: {
    additiveOnly: forbiddenTokens.length === 0,
    forbiddenTokens,
    usesIfNotExists: sqlText.includes('ADD COLUMN IF NOT EXISTS'),
  },
  databaseError,
  liveColumns: presentColumns,
  expectedColumns,
  migrationApplied: expectedColumns.every(([table, column]) => presentColumns.some((row) => row.table_name === table && row.column_name === column)),
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  promotionAllowed: false,
  reason: 'Migration remains unapplied; schema safety does not authorize application or backfill.',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, databaseError, additiveOnly: report.sqlChecks.additiveOnly, migrationApplied: report.migrationApplied, promotionAllowed: false, report: REPORT }, null, 2));
