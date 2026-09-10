#!/usr/bin/env node

/** Read-only inventory of temporal/supersession storage surfaces. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/temporal-schema-surfaces-v1.json');
const requirements = {
  atlas_agent_action_events: ['event_id', 'ledger_sequence', 'workflow_id', 'action_id', 'workspace_revision', 'source_revision', 'event_checksum'],
  semantic_lifecycle_events: ['entity_id', 'previous_state', 'new_state', 'created_at'],
  atlas_packets: ['packet_key', 'source_ref', 'source_revision', 'workspace_revision'],
  atlas_symbol_versions: ['symbol_version_id', 'source_revision', 'workspace_revision'],
  graphify_runs: ['run_id', 'workspace_revision', 'status'],
  atlas_workspace_source_bindings: ['repo_id', 'workspace_revision', 'canonical_source_ref', 'source_revision', 'binding_checksum'],
};
const expectedIndexes = {
  atlas_agent_action_events: ['idx_atlas_agent_action_events_execution', 'idx_atlas_agent_action_events_target', 'idx_atlas_agent_action_events_revisions'],
  semantic_lifecycle_events: ['idx_semantic_lifecycle_events_entity', 'idx_semantic_lifecycle_events_created_at'],
  atlas_packets: ['atlas_packets_pkey'],
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
const report = {
  schema: 'atlas.temporal-schema-surfaces.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  workspaceRevisionPolicy: 'NULL_ALLOWED_UNTIL_SNAPSHOT_TOURNAMENT_ADMISSION', writesPerformed: false,
  tables: {}, indexes: {}, databaseError: null, status: 'UNKNOWN', promotionAllowed: false,
};
try {
  const tableRows = await pool.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position`, [Object.keys(requirements)]);
  const byTable = {};
  for (const row of tableRows.rows) (byTable[row.table_name] ??= []).push(row);
  const indexRows = await pool.query(`SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename = ANY($1::text[]) ORDER BY tablename, indexname`, [Object.keys(requirements)]);
  const byIndex = {};
  for (const row of indexRows.rows) (byIndex[row.tablename] ??= []).push(row);
  for (const [table, required] of Object.entries(requirements)) {
    const columns = byTable[table] ?? [];
    const names = new Set(columns.map((row) => row.column_name));
    const indexes = byIndex[table] ?? [];
    const indexNames = new Set(indexes.map((row) => row.indexname));
    report.tables[table] = { present: columns.length > 0, requiredColumns: required, missingColumns: required.filter((column) => !names.has(column)), columns };
    report.indexes[table] = { expected: expectedIndexes[table] ?? [], missing: (expectedIndexes[table] ?? []).filter((name) => !indexNames.has(name)), actual: indexes };
  }
  const missingRequired = Object.values(report.tables).reduce((n, table) => n + table.missingColumns.length, 0);
  const missingTables = Object.values(report.tables).filter((table) => !table.present).length;
  report.status = missingTables || missingRequired ? 'SCHEMA_SURFACES_PARTIAL' : 'SCHEMA_SURFACES_PRESENT';
  report.summary = { tableCount: Object.keys(requirements).length, presentTables: Object.values(report.tables).filter((table) => table.present).length, missingTables, missingRequiredColumns: missingRequired, workspaceRevisionNullsAccepted: true };
} catch (error) {
  report.databaseError = error instanceof Error ? error.message : String(error);
  report.status = 'DATABASE_UNAVAILABLE';
} finally { await pool.end(); }
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, summary: report.summary ?? null, databaseError: report.databaseError, reportPath }, null, 2));
