#!/usr/bin/env node

/** Read-only audit of the current Graphify run owner and completion state. */
import { mkdirSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { resolveCurrentWorkspaceFrameV1 } from './lib/current-workspace-frame-selector-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json');
const TMP_REPORT = `${REPORT}.${process.pid}.tmp`;
const frame = resolveCurrentWorkspaceFrameV1({ root: ROOT });
const workspaceRevision = frame.selectedWorkspaceRevision;

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-graphify-run-owner-v1',
});
let databaseError = null;
let databaseSnapshot = null;
let runs = [];
let workspaceRows = [];
let coordinatorExecutions = [];
let client;

try {
  if (frame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED' || !workspaceRevision) {
    throw new Error(frame.blockers[0] ?? 'CURRENT_WORKSPACE_FRAME_UNRESOLVED');
  }
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query('SET LOCAL statement_timeout = 120000');
  databaseSnapshot = (await client.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0]?.snapshot ?? null;

  runs = (await client.query(`
    SELECT r.run_id, r.workspace_id, r.repository_revision, r.workspace_revision,
           r.source_manifest_digest, r.source_manifest_source_count,
           r.parser_contract_version, r.extraction_contract_version,
           r.status, r.dry_run, r.started_at, r.completed_at,
           (w.id IS NOT NULL) AS workspace_row_present
      FROM public.graphify_runs r
      LEFT JOIN public.workspaces w ON w.id = r.workspace_id
     WHERE r.workspace_revision = $1
     ORDER BY r.started_at DESC
  `, [workspaceRevision])).rows;

  workspaceRows = (await client.query(`
    SELECT id
      FROM public.workspaces
     WHERE id IN (SELECT workspace_id FROM public.graphify_runs WHERE workspace_revision = $1)
     ORDER BY id
  `, [workspaceRevision])).rows;

  const executionTable = await client.query(`SELECT to_regclass('public.graphify_executions') AS relation`);
  if (executionTable.rows[0]?.relation) {
    coordinatorExecutions = (await client.query(`
      SELECT e.execution_id, e.workspace_id, e.workspace_revision, e.status,
             e.started_at, e.completed_at, e.canonical_authority,
             COUNT(s.stage)::int AS completed_stage_count
        FROM public.graphify_executions e
        LEFT JOIN public.graphify_execution_stages s
          ON s.execution_id = e.execution_id AND s.status = 'COMPLETED'
       WHERE e.workspace_revision = $1
       GROUP BY e.execution_id, e.workspace_id, e.workspace_revision, e.status,
                e.started_at, e.completed_at, e.canonical_authority
       ORDER BY e.completed_at DESC NULLS LAST, e.execution_id
    `, [workspaceRevision])).rows;
  }
  await client.query('ROLLBACK');
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
  if (client) {
    try { await client.query('ROLLBACK'); } catch {}
  }
} finally {
  client?.release();
  await pool.end();
}

const current = runs[0] ?? null;
const completed = runs.filter((run) => run.status === 'COMPLETED' && run.completed_at && run.workspace_row_present);
const report = {
  schema: 'atlas.current-graphify-run-owner.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPEATABLE_READ_RUN_OWNER_AUDIT',
  readOnly: true,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  frameSelector: frame,
  expectedWorkspaceRevision: workspaceRevision,
  expectedWorkspaceRevisionSource: frame.selectedSource,
  expectedSnapshotRevision: frame.selectedSnapshotRevision,
  databaseSnapshot,
  databaseError,
  currentRun: current,
  runCount: runs.length,
  completedOwnerCount: completed.length,
  workspaceRowCount: workspaceRows.length,
  coordinatorExecutionCount: coordinatorExecutions.length,
  coordinatorExecutions,
  ownerAssessment: {
    runExists: Boolean(current),
    runCompleted: Boolean(current?.status === 'COMPLETED' && current?.completed_at),
    workspaceForeignRowExists: Boolean(current?.workspace_row_present),
    sourceManifestBound: Boolean(current?.source_manifest_digest && current?.source_manifest_source_count),
    authoritativeGraphRun: completed.length === 1,
  },
  promotion: {
    graphRevisionAllowed: false,
    edgeAdmissionAllowed: false,
    reason: frame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED'
      ? `Workspace frame selection is blocked: ${frame.blockers.join(', ')}`
      : current?.status !== 'COMPLETED' || !current?.completed_at
        ? current?.workspace_row_present
          ? 'Current run is incomplete; the workspace owner exists, but no graph revision may be promoted until receipt-bound completion is proven.'
          : 'Current run is incomplete and the referenced workspace owner row is absent; no graph revision may be promoted from it.'
        : completed.length !== 1
          ? 'No unique completed authoritative Graphify run is available; no graph revision may be promoted.'
          : 'Graph revision promotion is closed by policy until the completion contract is independently read back.',
  },
  runs,
  status: databaseError
    ? 'GRAPHIFY_RUN_OWNER_AUDIT_FAILED'
    : completed.length === 1
      ? 'GRAPHIFY_RUN_OWNER_COMPLETE'
      : 'GRAPHIFY_RUN_OWNER_BLOCKED',
};

mkdirSync(dirname(REPORT), { recursive: true });
let reportWriteError = null;
try {
  writeFileSync(TMP_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  renameSync(TMP_REPORT, REPORT);
  const readback = JSON.parse(readFileSync(REPORT, 'utf8'));
  if (readback.expectedWorkspaceRevision !== report.expectedWorkspaceRevision
    || readback.expectedWorkspaceRevisionSource !== report.expectedWorkspaceRevisionSource) {
    throw new Error('RUN_OWNER_REPORT_READBACK_MISMATCH');
  }
} catch (error) {
  reportWriteError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  expectedWorkspaceRevision: workspaceRevision,
  expectedWorkspaceRevisionSource: frame.selectedSource,
  expectedSnapshotRevision: frame.selectedSnapshotRevision,
  frameBlockers: frame.blockers,
  databaseSnapshot,
  runCount: report.runCount,
  completedOwnerCount: report.completedOwnerCount,
  workspaceRowCount: report.workspaceRowCount,
  currentStatus: current?.status ?? null,
  currentCompletedAt: current?.completed_at ?? null,
  coordinatorExecutionCount: report.coordinatorExecutionCount,
  coordinatorCompletedStageCounts: report.coordinatorExecutions.map((execution) => ({
    executionId: execution.execution_id,
    status: execution.status,
    completedStageCount: execution.completed_stage_count,
  })),
  reportWriteError,
  report: REPORT,
}, null, 2));
if (report.status !== 'GRAPHIFY_RUN_OWNER_COMPLETE') process.exitCode = 3;
