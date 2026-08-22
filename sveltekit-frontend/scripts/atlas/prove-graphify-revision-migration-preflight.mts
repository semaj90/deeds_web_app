#!/usr/bin/env tsx

import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const requiredColumns: Record<string, Record<string, string>> = {
  graphify_runs: {
    run_id: 'uuid',
    workspace_id: 'uuid',
    repository_revision: 'text',
    parser_contract_version: 'text',
    extraction_contract_version: 'text',
    started_at: 'timestamp with time zone',
    status: 'text',
    dry_run: 'boolean',
    configuration: 'jsonb',
  },
  graphify_files: {
    file_id: 'uuid',
    workspace_id: 'uuid',
    source_ref: 'text',
    source_revision: 'text',
    content_hash: 'text',
    byte_length: 'bigint',
    first_seen_run_id: 'uuid',
    last_seen_run_id: 'uuid',
  },
};

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

await pool.query('BEGIN READ ONLY');
try {
  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('graphify_runs', 'graphify_files')
    ORDER BY table_name
  `);
  const presentTables = new Set(tablesResult.rows.map((row) => String(row.table_name)));

  const columnsResult = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('graphify_runs', 'graphify_files')
    ORDER BY table_name, ordinal_position
  `);

  const observed = new Map<string, Map<string, { dataType: string; nullable: boolean }>>();
  for (const row of columnsResult.rows) {
    const table = String(row.table_name);
    const columns = observed.get(table) ?? new Map();
    columns.set(String(row.column_name), {
      dataType: String(row.data_type),
      nullable: String(row.is_nullable) === 'YES',
    });
    observed.set(table, columns);
  }

  const baseSchemaConflicts: Array<Record<string, unknown>> = [];
  for (const [table, expectedColumns] of Object.entries(requiredColumns)) {
    if (!presentTables.has(table)) continue;
    const actualColumns = observed.get(table) ?? new Map();
    for (const [column, expectedType] of Object.entries(expectedColumns)) {
      const actual = actualColumns.get(column);
      if (!actual) {
        baseSchemaConflicts.push({ table, column, reason: 'MISSING_REQUIRED_BASE_COLUMN', expectedType });
      } else if (actual.dataType !== expectedType) {
        baseSchemaConflicts.push({
          table,
          column,
          reason: 'INCOMPATIBLE_BASE_COLUMN_TYPE',
          expectedType,
          actualType: actual.dataType,
        });
      }
    }
  }

  const constraints = await pool.query(`
    SELECT
      c.conname,
      rel.relname AS table_name,
      c.contype,
      pg_get_constraintdef(c.oid, true) AS definition
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname IN ('graphify_runs', 'graphify_files')
    ORDER BY rel.relname, c.conname
  `);

  const indexes = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('graphify_runs', 'graphify_files')
    ORDER BY tablename, indexname
  `);

  const v2Columns = {
    workspaceRevision: observed.get('graphify_runs')?.has('workspace_revision') ?? false,
    sourceManifestDigest: observed.get('graphify_runs')?.has('source_manifest_digest') ?? false,
    codeSourceRevision: observed.get('graphify_files')?.has('code_source_revision') ?? false,
  };

  const status = baseSchemaConflicts.length > 0
    ? 'GRAPHIFY_REVISION_MIGRATION_PREFLIGHT_BLOCKED_SCHEMA_DRIFT'
    : presentTables.size === 0
      ? 'GRAPHIFY_REVISION_MIGRATION_PREFLIGHT_NEW_TABLES_SAFE'
      : 'GRAPHIFY_REVISION_MIGRATION_PREFLIGHT_COMPATIBLE';

  console.log(JSON.stringify({
    schema: 'atlas.graphify-revision-migration-preflight.v1',
    status,
    readOnly: true,
    canonicalWriteAttempted: false,
    presentTables: [...presentTables].sort(),
    missingTables: ['graphify_runs', 'graphify_files'].filter((table) => !presentTables.has(table)),
    v2Columns,
    baseSchemaConflicts,
    constraints: constraints.rows,
    indexes: indexes.rows,
    migrationMayBeApplied: baseSchemaConflicts.length === 0,
    fanoutMayConsumeAsCanonical: false,
    note: 'This preflight authorizes no FANOUT and performs no migration. It only detects whether the additive migration would encounter incompatible existing base schema.',
  }, null, 2));

  if (baseSchemaConflicts.length > 0) process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
