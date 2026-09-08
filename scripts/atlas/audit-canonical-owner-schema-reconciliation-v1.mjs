#!/usr/bin/env node

/** Read-only audit of the fields available for proposal participant owners. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/canonical-owner-schema-reconciliation-v1.json');
const requirements = {
  atlas_packets: ['packet_key', 'source_ref', 'source_revision', 'workspace_revision'],
  atlas_symbol_versions: ['symbol_version_id', 'source_ref', 'source_revision', 'workspace_revision'],
  atlas_ontology_concepts: ['concept_id', 'definition_revision', 'canonical_label'],
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let tables = {};
try {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [Object.keys(requirements)]);
  for (const row of result.rows) {
    tables[row.table_name] ??= { present: true, columns: [] };
    tables[row.table_name].columns.push(row.column_name);
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const tableResults = Object.entries(requirements).map(([table, requiredColumns]) => {
  const actual = tables[table]?.columns ?? [];
  const missing = requiredColumns.filter((column) => !actual.includes(column));
  return { table, present: actual.length > 0, actualColumns: actual, requiredColumns, missing, complete: missing.length === 0 };
});
const report = {
  schema: 'atlas.canonical-owner-schema-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SCHEMA_AUDIT',
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  databaseError,
  tables: tableResults,
  packetOwnerReady: tableResults.find((value) => value.table === 'atlas_packets')?.complete === true,
  symbolOwnerReady: tableResults.find((value) => value.table === 'atlas_symbol_versions')?.complete === true,
  conceptOwnerReady: tableResults.find((value) => value.table === 'atlas_ontology_concepts')?.complete === true,
  liveOwnerRegistryReady: databaseError === null && tableResults.every((value) => value.complete),
  promotionAllowed: false,
  reason: 'Schema availability does not prove current rows, owner uniqueness, or Graphify lineage.',
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  databaseError,
  packetOwnerReady: report.packetOwnerReady,
  symbolOwnerReady: report.symbolOwnerReady,
  conceptOwnerReady: report.conceptOwnerReady,
  liveOwnerRegistryReady: report.liveOwnerRegistryReady,
  promotionAllowed: false,
  report: REPORT,
}, null, 2));
