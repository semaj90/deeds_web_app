#!/usr/bin/env node

/** Read-only audit of the current Graphify run owner and completion state. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json');
const workspaceRevision = 'sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9';
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
    reason: 'Current run is incomplete and the referenced workspace owner row is absent; no graph revision may be promoted from it.',
  },
  runs,
  status: databaseError ? 'GRAPHIFY_RUN_OWNER_AUDIT_FAILED' : completed.length === 1 ? 'GRAPHIFY_RUN_OWNER_COMPLETE' : 'GRAPHIFY_RUN_OWNER_BLOCKED',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  expectedWorkspaceRevision: workspaceRevision,
  runCount: report.runCount,
  completedOwnerCount: report.completedOwnerCount,
  workspaceRowCount: report.workspaceRowCount,
  currentStatus: current?.status ?? null,
  currentCompletedAt: current?.completed_at ?? null,
  report: REPORT,
}, null, 2));
