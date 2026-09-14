#!/usr/bin/env node

/**
 * CURRENT-PACKET-CHUNK-LINEAGE-DEPLOYMENT-01
 * Read-only preflight that distinguishes a missing live lineage relation from
 * an empty/partial lineage population. It does not apply migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/current-packet-chunk-lineage-deployment-v1.json');
const migrationPath = path.join(root, 'sveltekit-frontend/drizzle/manual/20260901_atlas_packet_chunk_lineage.sql');
const migrationInventoryPath = path.join(root, 'docs/reports/migration-inventory-classification-v1.json');
const liveLineageAuditPath = path.join(root, 'docs/reports/live-source-lineage-table-audit.json');

const migrationSqlPresent = fs.existsSync(migrationPath);
const migrationInventory = fs.existsSync(migrationInventoryPath)
  ? JSON.parse(fs.readFileSync(migrationInventoryPath, 'utf8'))
  : null;
const liveLineageAudit = fs.existsSync(liveLineageAuditPath)
  ? JSON.parse(fs.readFileSync(liveLineageAuditPath, 'utf8'))
  : null;

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 1,
  statement_timeout: 60000,
  application_name: 'atlas-current-packet-chunk-lineage-deployment-v1',
});
let relationPresent = false;
let rowCount = null;
let provenRowCount = null;
let columns = [];
let constraints = [];
let databaseError = null;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    relationPresent = Boolean((await client.query(
      `SELECT to_regclass('public.atlas_packet_chunk_lineage') IS NOT NULL AS present`,
    )).rows[0]?.present);
    if (relationPresent) {
      columns = (await client.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='atlas_packet_chunk_lineage'
          ORDER BY ordinal_position`,
      )).rows;
      constraints = (await client.query(
        `SELECT conname, contype, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
          WHERE conrelid='public.atlas_packet_chunk_lineage'::regclass
          ORDER BY conname`,
      )).rows;
      const counts = (await client.query(
        `SELECT count(*)::bigint AS rows,
                count(*) FILTER (WHERE revision_status='PROVEN')::bigint AS proven_rows
           FROM public.atlas_packet_chunk_lineage`,
      )).rows[0];
      rowCount = Number(counts?.rows ?? 0);
      provenRowCount = Number(counts?.proven_rows ?? 0);
    }
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const migrationInventoryText = migrationInventory ? JSON.stringify(migrationInventory) : '';
const classifiedInInventory = migrationInventoryText.includes('20260901_atlas_packet_chunk_lineage.sql');
const inventoryMentionsUnresolved = classifiedInInventory && /UNRESOLVED|DEFERRED|UNAPPLIED/i.test(migrationInventoryText);
const liveAuditText = liveLineageAudit ? JSON.stringify(liveLineageAudit) : '';
const liveAuditSaysAbsent = /atlas_packet_chunk_lineage/i.test(liveAuditText) && /absent|missing|not present/i.test(liveAuditText);

let status = 'LINEAGE_DEPLOYMENT_PRESENT';
let firstBlocker = null;
let nextGate = 'CURRENT-PACKET-CHUNK-LINEAGE-BRIDGE-01';
if (databaseError) {
  status = 'LINEAGE_DEPLOYMENT_AUDIT_ERROR';
  firstBlocker = databaseError;
  nextGate = 'DATABASE_CONNECTIVITY_OR_CATALOG_RECHECK';
} else if (!relationPresent) {
  status = 'LINEAGE_TABLE_NOT_DEPLOYED';
  firstBlocker = 'MIGRATION_OWNER_UNRESOLVED';
  nextGate = 'PACKET-CHUNK-LINEAGE-MIGRATION-OWNER-01';
}

const report = {
  schema: 'atlas.current-packet-chunk-lineage-deployment.v1',
  gate: 'CURRENT-PACKET-CHUNK-LINEAGE-DEPLOYMENT-01',
  generatedAt: new Date().toISOString(),
  status,
  firstBlocker,
  nextGate,
  readOnly: true,
  writesPerformed: false,
  migration: {
    path: 'sveltekit-frontend/drizzle/manual/20260901_atlas_packet_chunk_lineage.sql',
    sqlPresent: migrationSqlPresent,
    classifiedInMigrationInventory: classifiedInInventory,
    inventoryMentionsUnresolvedOrDeferred: inventoryMentionsUnresolved,
  },
  liveRelation: {
    present: relationPresent,
    rowCount,
    provenRowCount,
    columns,
    constraints,
  },
  priorEvidence: {
    liveLineageAuditPresent: Boolean(liveLineageAudit),
    liveAuditSaysAbsent,
    migrationInventoryPresent: Boolean(migrationInventory),
  },
  policy: {
    migrationApplyAuthorized: false,
    lineageBackfillAuthorized: false,
    inferredLineageAuthorized: false,
  },
  databaseError,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tmp = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tmp, reportPath);
console.log(JSON.stringify({ status, firstBlocker, nextGate, relationPresent, rowCount, provenRowCount, reportPath: 'docs/reports/current-packet-chunk-lineage-deployment-v1.json' }, null, 2));
if (status !== 'LINEAGE_DEPLOYMENT_PRESENT') process.exitCode = 3;
