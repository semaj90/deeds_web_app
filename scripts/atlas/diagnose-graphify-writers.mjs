#!/usr/bin/env node
/**
 * Phase 5 of the Graphify recovery proof ladder
 * (openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md):
 * read-only diagnostic of competing writers against atlas_packets / graphify
 * activity. Never claims duplicate script invocation without application_name
 * or command-line evidence — reports what pg_stat_activity actually shows.
 *
 * Strictly read-only: two SELECT queries, no writes, no mutation guard needed
 * because no mutating statement exists in this file.
 *
 * Usage: node scripts/atlas/diagnose-graphify-writers.mjs [--json]
 */
import { Pool } from 'pg';

const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434', 10),
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  database: POSTGRES_DB,
  max: 2,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000,
  allowExitOnIdle: true,
});
pool.on('error', (err) => {
  console.error('[diagnose-graphify-writers] pg pool error:', err?.message || err);
});

const ACTIVITY_QUERY = `
  SELECT pid, application_name, usename, state, wait_event_type, wait_event,
         xact_start, query_start, LEFT(query, 500) AS query
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND (query ILIKE '%atlas_packets%' OR application_name ILIKE '%graphify%')
  ORDER BY query_start;
`;

const BLOCKERS_QUERY = `
  SELECT blocked.pid AS blocked_pid,
         blocked.application_name AS blocked_application,
         blocker.pid AS blocker_pid,
         blocker.application_name AS blocker_application,
         LEFT(blocked.query, 500) AS blocked_query,
         LEFT(blocker.query, 500) AS blocker_query
  FROM pg_stat_activity AS blocked
  CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS blocker_pid
  JOIN pg_stat_activity AS blocker ON blocker.pid = blocker_pid;
`;

const RETRYABLE_CODES = new Set(['40P01', '40001', '55P03']);

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const report = {
    generatedAt: new Date().toISOString(),
    activity: [],
    blockers: [],
    errors: [],
    interpretation: {
      duplicateInvocationEvidence: 'NOT_CLAIMED',
      note: 'Never claims duplicate script invocation without application_name/command-line evidence in the activity rows below.',
    },
  };

  try {
    const activityRes = await pool.query(ACTIVITY_QUERY);
    report.activity = activityRes.rows;
  } catch (err) {
    report.errors.push({ query: 'activity', code: err.code, message: err.message });
  }

  try {
    const blockersRes = await pool.query(BLOCKERS_QUERY);
    report.blockers = blockersRes.rows;
  } catch (err) {
    report.errors.push({ query: 'blockers', code: err.code, message: err.message });
  }

  for (const err of report.errors) {
    if (RETRYABLE_CODES.has(err.code)) {
      err.retryable = true;
    }
  }

  const graphifyRows = report.activity.filter((r) => (r.application_name || '').toLowerCase().includes('graphify'));
  if (graphifyRows.length > 1) {
    const distinctPids = new Set(graphifyRows.map((r) => r.pid));
    report.interpretation.duplicateInvocationEvidence =
      distinctPids.size > 1
        ? `CONCURRENT_GRAPHIFY_ACTIVITY_FOUND: ${distinctPids.size} distinct PIDs with graphify-tagged application_name`
        : 'SINGLE_PID_MULTIPLE_ROWS: not concurrent invocation';
  } else {
    report.interpretation.duplicateInvocationEvidence = 'NO_CONCURRENT_GRAPHIFY_ACTIVITY_AT_QUERY_TIME';
  }

  await pool.end();

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[diagnose-graphify-writers] atlas_packets/graphify activity rows: ${report.activity.length}`);
    for (const row of report.activity) {
      console.log(`  pid=${row.pid} app=${row.application_name} state=${row.state} wait=${row.wait_event_type ?? '-'}/${row.wait_event ?? '-'} query="${(row.query || '').slice(0, 80)}"`);
    }
    console.log(`[diagnose-graphify-writers] blocking relationships: ${report.blockers.length}`);
    for (const row of report.blockers) {
      console.log(`  blocked_pid=${row.blocked_pid} (${row.blocked_application}) blocked_by pid=${row.blocker_pid} (${row.blocker_application})`);
    }
    console.log(`[diagnose-graphify-writers] interpretation: ${report.interpretation.duplicateInvocationEvidence}`);
    if (report.errors.length > 0) {
      console.log('[diagnose-graphify-writers] errors:', JSON.stringify(report.errors, null, 2));
    }
  }

  process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[diagnose-graphify-writers] FATAL:', err.message);
  process.exit(1);
});
