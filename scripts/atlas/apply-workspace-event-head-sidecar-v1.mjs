#!/usr/bin/env node
/**
 * Guarded, transactional apply for the incremental workspace event/head sidecar.
 * Dry-run is the default. This script never invents event identity and does not
 * write any event rows; it only installs the reviewed storage schema.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const migrationPath = resolve(ROOT, 'sveltekit-frontend/drizzle/manual/20260916_workspace_event_head_v1.sql');
const reportPath = resolve(ROOT, 'docs/reports/workspace-event-head-sidecar-apply-v1.json');
const tables = ['atlas_workspace_events', 'atlas_workspace_event_participants', 'atlas_workspace_heads'];
const applyRequested = process.argv.includes('--apply');
const rollbackCanaryRequested = process.argv.includes('--rollback-canary');
const authorized = process.env.ATLAS_AUTHORIZE_WORKSPACE_EVENT_HEAD_SIDECAR === '1';
const migration = readFileSync(migrationPath);
const migrationChecksum = `sha256:${createHash('sha256').update(migration).digest('hex')}`;
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 5000,
});

function atomicReport(report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  const tmp = `${reportPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(tmp, reportPath);
}

async function readback(client) {
  const relationResult = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name
  `, [tables]);
  const constraintResult = await client.query(`
    SELECT conname
      FROM pg_constraint
     WHERE conname = ANY($1::text[])
     ORDER BY conname
  `, [[
    'atlas_workspace_event_participants_event_id_fkey',
    'atlas_workspace_heads_last_event_id_fkey',
    'atlas_workspace_events_workspace_snapshot_sequence_key',
    'atlas_workspace_events_event_checksum_key',
  ]]);
  const triggerResult = await client.query(`
    SELECT trigger_name
      FROM information_schema.triggers
     WHERE trigger_schema = 'public'
       AND event_object_table = ANY($1::text[])
     ORDER BY trigger_name
  `, [tables]);
  const present = relationResult.rows.map((row) => row.table_name);
  const constraints = constraintResult.rows.map((row) => row.conname);
  const triggers = triggerResult.rows.map((row) => row.trigger_name);
  return {
    tables,
    tablesPresent: present,
    requiredConstraintsPresent: constraints,
    immutableTriggersPresent: triggers,
    complete: tables.every((table) => present.includes(table))
      && constraints.includes('atlas_workspace_event_participants_event_id_fkey')
      && constraints.includes('atlas_workspace_heads_last_event_id_fkey')
      && constraints.includes('atlas_workspace_events_workspace_snapshot_sequence_key')
      && constraints.includes('atlas_workspace_events_event_checksum_key')
      && triggers.includes('atlas_workspace_events_immutable_v1')
      && triggers.includes('atlas_workspace_event_participants_immutable_v1'),
  };
}

async function main() {
  const report = {
    schema: 'atlas.workspace-event-head-sidecar-apply.v1',
    migrationFile: 'sveltekit-frontend/drizzle/manual/20260916_workspace_event_head_v1.sql',
    migrationChecksum,
    mode: applyRequested && authorized
      ? (rollbackCanaryRequested ? 'ROLLBACK_CANARY' : 'APPLY')
      : 'DRY_RUN',
    authorization: {
      applyFlag: applyRequested,
      rollbackCanaryFlag: rollbackCanaryRequested,
      environmentPresent: authorized,
      required: 'ATLAS_AUTHORIZE_WORKSPACE_EVENT_HEAD_SIDECAR=1',
    },
    writesPerformed: false,
    readbackProven: false,
    canonicalAuthority: false,
  };
  if (!applyRequested || !authorized) {
    report.status = applyRequested ? 'BLOCKED_EXPLICIT_AUTHORIZATION_REQUIRED' : 'READY_FOR_AUTHORIZATION';
    report.note = 'No DDL was executed. Supply --apply and the exact authorization environment variable only after migration-owner review.';
    atomicReport(report);
    console.log(JSON.stringify({ status: report.status, writesPerformed: false, reportPath }, null, 2));
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL lock_timeout = \'5s\'');
    await client.query('SET LOCAL statement_timeout = \'30s\'');
    await client.query(migration.toString('utf8'));
    const readbackResult = await readback(client);
    if (!readbackResult.complete) throw new Error('WORKSPACE_EVENT_HEAD_SIDECAR_READBACK_INCOMPLETE');
    report.readback = readbackResult;
    report.readbackProven = true;
    if (rollbackCanaryRequested) {
      await client.query('ROLLBACK');
      report.status = 'ROLLBACK_CANARY_READBACK_PROVEN';
      report.rolledBack = true;
    } else {
      await client.query('COMMIT');
      report.status = 'APPLIED_READBACK_PROVEN';
      report.writesPerformed = true;
      report.rolledBack = false;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    report.status = 'APPLY_ROLLED_BACK';
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    client.release();
  }
  atomicReport(report);
  console.log(JSON.stringify({ status: report.status, writesPerformed: report.writesPerformed, readbackProven: report.readbackProven, reportPath }, null, 2));
  if (!['APPLIED_READBACK_PROVEN', 'ROLLBACK_CANARY_READBACK_PROVEN'].includes(report.status)) process.exitCode = 1;
}

try { await main(); } finally { await pool.end(); }
