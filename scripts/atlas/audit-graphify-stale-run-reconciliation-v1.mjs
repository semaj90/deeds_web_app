#!/usr/bin/env node
/**
 * GRAPHIFY-STALE-RUN-RECON-01 -- read-only stale-run classification.
 *
 * This report never updates graphify_runs and never starts Graphify. It
 * distinguishes a database RUNNING record from an admitted completed owner.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-stale-run-reconciliation-v1.json');
const WORKSPACE_REVISION = 'sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9';
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });

let databaseError = null;
let runs = [];
let activity = [];
let locks = [];
try {
  const result = await pool.query(`
    SELECT r.run_id, r.workspace_id, r.workspace_revision,
           r.source_manifest_digest, r.source_manifest_source_count,
           r.status, r.dry_run, r.started_at, r.completed_at,
           (w.id IS NOT NULL) AS workspace_row_present
    FROM public.graphify_runs r
    LEFT JOIN public.workspaces w ON w.id = r.workspace_id
    WHERE r.workspace_revision = $1
    ORDER BY r.started_at DESC, r.run_id
  `, [WORKSPACE_REVISION]);
  runs = result.rows;
  const activityResult = await pool.query(`
    SELECT pid, usename, state, wait_event_type, wait_event, query_start,
           LEFT(query, 300) AS query
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND query ILIKE '%graphify%'
    ORDER BY query_start DESC NULLS LAST, pid
  `);
  activity = activityResult.rows;
  const locksResult = await pool.query(`
    SELECT l.pid, l.mode, l.granted, c.relname
    FROM pg_locks l
    JOIN pg_class c ON c.oid = l.relation
    WHERE c.relname IN ('graphify_runs', 'graphify_files')
    ORDER BY l.pid, c.relname, l.mode
  `);
  locks = locksResult.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const current = runs[0] ?? null;
const completedOwners = runs.filter(run => run.status === 'COMPLETED' && run.completed_at && run.workspace_row_present);
const stale = Boolean(current && current.status === 'RUNNING' && !current.completed_at);
const report = {
  schema: 'atlas.graphify-stale-run-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STALE_RUN_RECONCILIATION',
  expectedWorkspaceRevision: WORKSPACE_REVISION,
  databaseError,
  currentRun: current,
  runCount: runs.length,
  completedOwnerCount: completedOwners.length,
  classification: databaseError ? 'DATABASE_AUDIT_FAILED'
    : stale ? 'STALE_RUNNING_RECORD_WITHOUT_COMPLETION_RECEIPT'
      : completedOwners.length === 1 ? 'COMPLETED_OWNER_CANDIDATE_REQUIRES_READBACK'
        : 'NO_STALE_RUNNING_RECORD_FOUND',
  decision: {
    promotionAllowed: false,
    graphRevisionAllowed: false,
    recommendedNext: stale ? 'READINESS_ONLY_REPLAY_OR_EXPLICIT_ABANDONMENT_REVIEW' : 'RECHECK_OWNER_AND_COMPLETION_RECEIPT',
    mutationRequiredForThisReport: false,
  },
  blockers: stale ? ['CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED', 'COMPLETION_RECEIPT_ABSENT'] : [],
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  readOnly: true,
  runs,
  processEvidence: { activity, locks },
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  classification: report.classification,
  runCount: report.runCount,
  promotionAllowed: report.decision.promotionAllowed,
  readOnly: report.readOnly,
  report: REPORT,
}, null, 2));
