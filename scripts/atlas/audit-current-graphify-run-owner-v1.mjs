#!/usr/bin/env node

/** Read-only audit of the current Graphify run owner and completion state. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json');
const LIFECYCLE_REPORT = resolve(ROOT, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
let workspaceRevision = process.env.ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION?.trim() || null;
let workspaceRevisionSource = workspaceRevision ? 'ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION' : null;
if (!workspaceRevision) {
  try {
    const lifecycleReport = JSON.parse(readFileSync(LIFECYCLE_REPORT, 'utf8'));
    workspaceRevision = typeof lifecycleReport.workspaceRevision === 'string' ? lifecycleReport.workspaceRevision.trim() : null;
    if (workspaceRevision) workspaceRevisionSource = 'docs/reports/graphify-lifecycle-entrypoint-v1.json';
  } catch {
    workspaceRevision = null;
  }
}
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let runs = [];
let workspaceRows = [];
try {
  const result = await pool.query(`
    SELECT r.run_id, r.workspace_id, r.repository_revision, r.workspace_revision,
           r.source_manifest_digest, r.source_manifest_source_count,
           r.parser_contract_version, r.extraction_contract_version,
           r.status, r.dry_run, r.started_at, r.completed_at,
           (w.id IS NOT NULL) AS workspace_row_present
    FROM public.graphify_runs r
    LEFT JOIN public.workspaces w ON w.id = r.workspace_id
    WHERE r.workspace_revision = $1
    ORDER BY r.started_at DESC
  `, [workspaceRevision]);
  runs = result.rows;
  const workspaceResult = await pool.query(`
    SELECT id FROM public.workspaces
    WHERE id IN (SELECT workspace_id FROM public.graphify_runs WHERE workspace_revision = $1)
    ORDER BY id
  `, [workspaceRevision]);
  workspaceRows = workspaceResult.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const current = runs[0] ?? null;
const completed = runs.filter((run) => run.status === 'COMPLETED' && run.completed_at && run.workspace_row_present);
const report = {
  schema: 'atlas.current-graphify-run-owner.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_RUN_OWNER_AUDIT',
  readOnly: true,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  expectedWorkspaceRevision: workspaceRevision,
  expectedWorkspaceRevisionSource: workspaceRevisionSource,
  databaseError,
  currentRun: current,
  runCount: runs.length,
  completedOwnerCount: completed.length,
  workspaceRowCount: workspaceRows.length,
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
    reason: current?.status !== 'COMPLETED' || !current?.completed_at
      ? current?.workspace_row_present
        ? 'Current run is incomplete; the workspace owner exists, but no graph revision may be promoted until receipt-bound completion is proven.'
        : 'Current run is incomplete and the referenced workspace owner row is absent; no graph revision may be promoted from it.'
      : completed.length !== 1
        ? 'No unique completed authoritative Graphify run is available; no graph revision may be promoted.'
        : 'Graph revision promotion is closed by policy until the completion contract is independently read back.',
  },
  runs,
  status: databaseError ? 'GRAPHIFY_RUN_OWNER_AUDIT_FAILED' : completed.length === 1 ? 'GRAPHIFY_RUN_OWNER_COMPLETE' : 'GRAPHIFY_RUN_OWNER_BLOCKED',
};
mkdirSync(dirname(REPORT), { recursive: true });
let reportWriteError = null;
try {
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  // The database audit is read-only and remains valid even if another process
  // temporarily locks the report artifact. Preserve the result on stdout.
  reportWriteError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  expectedWorkspaceRevision: workspaceRevision,
  expectedWorkspaceRevisionSource: workspaceRevisionSource,
  runCount: report.runCount,
  completedOwnerCount: report.completedOwnerCount,
  workspaceRowCount: report.workspaceRowCount,
  currentStatus: current?.status ?? null,
  currentCompletedAt: current?.completed_at ?? null,
  reportWriteError,
  report: REPORT,
}, null, 2));
