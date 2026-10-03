#!/usr/bin/env node

/** Read-only live catalog/readback for migration-critical lineage tables. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/critical-lineage-live-readback-v1.json');
const tables = [
  'atlas_packet_chunk_lineage',
  'atlas_packets',
  'codebase_chunk_index',
  'graphify_execution_files',
  'graphify_executions',
  'graphify_files',
  'workflow_events',
  'outbox_events',
];

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 60000,
});

const readback = [];
let canonicalEventReadback = {
  workflowEvents: null,
  outboxEvents: null,
  pairedCanonicalPayloads: null,
  status: 'NOT_EVALUATED',
};
try {
  await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await pool.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0].snapshot;
  for (const table of tables) {
    const columnsResult = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    const columns = columnsResult.rows.map((row) => row.column_name);
    if (columns.length === 0) {
      readback.push({ table, status: 'LIVE_SCHEMA_ABSENT', columns: [], rowCount: null });
      continue;
    }
    const quotedTable = `public."${table}"`;
    const rowCount = Number((await pool.query(`SELECT count(*)::bigint AS count FROM ${quotedTable}`)).rows[0].count);
    const revisionCount = {};
    for (const column of ['source_revision', 'workspace_revision', 'code_source_revision']) {
      if (!columns.includes(column)) continue;
      revisionCount[column] = Number((await pool.query(
        `SELECT count(*)::bigint AS count FROM ${quotedTable} WHERE "${column}" IS NOT NULL`,
      )).rows[0].count);
    }
    readback.push({ table, status: 'LIVE_SCHEMA_PRESENT', columns, rowCount, nonNullRevisionCounts: revisionCount });
  }

  const workflowTable = readback.find((row) => row.table === 'workflow_events');
  const outboxTable = readback.find((row) => row.table === 'outbox_events');
  if (workflowTable?.status === 'LIVE_SCHEMA_PRESENT' && outboxTable?.status === 'LIVE_SCHEMA_PRESENT') {
    const workflowPayload = workflowTable.columns.includes('payload')
      ? `"payload"::jsonb`
      : null;
    const outboxPayload = outboxTable.columns.includes('payload')
      ? `"payload"::jsonb`
      : null;
    const workflowActionId = workflowTable.columns.includes('action_id');
    const outboxAggregateId = outboxTable.columns.includes('aggregate_id');
    if (workflowPayload && outboxPayload && workflowActionId && outboxAggregateId) {
      const workflowCanonical = Number((await pool.query(
        `SELECT count(*)::bigint AS count FROM public."workflow_events"
         WHERE ${workflowPayload} ? 'canonicalEvent'`,
      )).rows[0].count);
      const outboxCanonical = Number((await pool.query(
        `SELECT count(*)::bigint AS count FROM public."outbox_events"
         WHERE ${outboxPayload} ? 'canonicalEvent'`,
      )).rows[0].count);
      const paired = Number((await pool.query(
        `SELECT count(*)::bigint AS count
           FROM public."workflow_events" w
           JOIN public."outbox_events" o
             ON o.aggregate_id::text = w.action_id::text
            AND o.payload::jsonb ? 'canonicalEvent'
          WHERE w.payload::jsonb ? 'canonicalEvent'`,
      )).rows[0].count);
      canonicalEventReadback = {
        workflowEvents: { canonicalPayloadRows: workflowCanonical },
        outboxEvents: { canonicalPayloadRows: outboxCanonical },
        pairedCanonicalPayloads: paired,
        status: workflowCanonical > 0 && outboxCanonical > 0 && paired > 0
          ? 'CANONICAL_PAYLOADS_PRESENT_PAIRED_READBACK_REQUIRED'
          : 'CANONICAL_PAYLOADS_NOT_PRESENT',
      };
    } else {
      canonicalEventReadback.status = 'CANONICAL_JOIN_COLUMNS_UNAVAILABLE';
    }
  } else {
    canonicalEventReadback.status = 'EVENT_TABLE_SCHEMA_UNAVAILABLE';
  }
  await pool.query('ROLLBACK');
  const report = {
    schema: 'atlas.critical-lineage-live-readback.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_REPEATABLE_READ',
    databaseSnapshot: snapshot,
    tables: readback,
    canonicalEventReadback,
    allTablesPresent: readback.every((row) => row.status === 'LIVE_SCHEMA_PRESENT'),
    writesPerformed: false,
    migrationAuthorized: false,
  };
  const temporaryPath = `${reportPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, reportPath);
  console.log(JSON.stringify({ reportPath: path.relative(root, reportPath), ...report }, null, 2));
} catch (error) {
  try { await pool.query('ROLLBACK'); } catch {}
  console.error(JSON.stringify({ schema: 'atlas.critical-lineage-live-readback.v1', status: 'READBACK_FAILED', error: String(error?.message ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
