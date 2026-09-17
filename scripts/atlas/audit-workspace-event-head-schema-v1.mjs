#!/usr/bin/env node
/** Read-only audit for the planned incremental workspace event/head sidecar. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/workspace-event-head-schema-audit-v1.json');
const ADAPTER = resolve(ROOT, 'sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-head-postgres-adapter-v1.ts');
const MIGRATION = resolve(ROOT, 'sveltekit-frontend/drizzle/manual/20260916_workspace_event_head_v1.sql');
const DRIZZLE_MIRROR = resolve(ROOT, 'sveltekit-frontend/src/lib/server/db/schema/workspace-events.ts');
const TABLES = ['atlas_workspace_events', 'atlas_workspace_event_participants', 'atlas_workspace_heads'];
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 5000,
});

async function main() {
  const relationResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [TABLES]);
  const columnResult = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [TABLES]);
  const triggerResult = await pool.query(`
    SELECT event_object_table AS table_name, trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND event_object_table = ANY($1::text[])
    ORDER BY event_object_table, trigger_name
  `, [TABLES]);
  const migrationChecksum = `sha256:${createHash('sha256').update(readFileSync(MIGRATION)).digest('hex')}`;
  const migrationText = readFileSync(MIGRATION, 'utf8');
  const mirrorText = readFileSync(DRIZZLE_MIRROR, 'utf8');
  const mirrorChecks = {
    participantForeignKey: migrationText.includes('atlas_workspace_event_participants_event_id_fkey')
      && mirrorText.includes("name: 'atlas_workspace_event_participants_event_id_fkey'"),
    participantCascadeParity: !migrationText.includes('ON DELETE CASCADE')
      && !mirrorText.includes(".onDelete('cascade')"),
    headForeignKey: migrationText.includes('atlas_workspace_heads_last_event_id_fkey')
      && mirrorText.includes("name: 'atlas_workspace_heads_last_event_id_fkey'"),
    headRestrictParity: migrationText.includes('ON DELETE RESTRICT')
      && mirrorText.includes(".onDelete('restrict')"),
  };
  const mirrorParityProven = Object.values(mirrorChecks).every(Boolean);
  const adapterImplemented = readFileSync(ADAPTER, 'utf8').includes('createPostgresWorkspaceEventHeadStoreV1')
    && readFileSync(ADAPTER, 'utf8').includes('writeWorkspaceEventHeadToPostgresV1');
  const report = {
    schema: 'atlas.workspace-event-head-schema-audit.v1',
    status: relationResult.rows.length === 0 ? 'NOT_APPLIED_PLANNED_SIDECAR' : 'SCHEMA_READBACK',
    tablesExpected: TABLES,
    tablesPresent: relationResult.rows.map((row) => row.table_name),
    columns: columnResult.rows,
    immutableTriggers: triggerResult.rows,
    migrationFile: 'sveltekit-frontend/drizzle/manual/20260916_workspace_event_head_v1.sql',
    migrationChecksum,
    adapterFile: 'sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-head-postgres-adapter-v1.ts',
    adapterImplemented,
    drizzleMirror: {
      file: 'sveltekit-frontend/src/lib/server/db/schema/workspace-events.ts',
      parityChecks: mirrorChecks,
      parityProven: mirrorParityProven,
    },
    storageReady: relationResult.rows.length === TABLES.length,
    liveReadbackProven: false,
    canonicalAuthority: false,
    writesPerformed: false,
    note: 'This audit never applies DDL and never mutates the database.'
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  const temporaryReport = `${REPORT}.${process.pid}.tmp`;
  writeFileSync(temporaryReport, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporaryReport, REPORT);
  console.log(JSON.stringify({ status: report.status, tablesPresent: report.tablesPresent, writesPerformed: false, reportPath: REPORT }, null, 2));
}

try { await main(); } finally { await pool.end(); }
