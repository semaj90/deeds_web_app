#!/usr/bin/env node

/** Read-only audit of the current Graphify run owner and completion state. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const DERIVATION = resolve(ROOT, 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
const SELECTION_PLAN = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const explicitWorkspaceRevision = process.env.ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION?.trim() || null;
let workspaceRevision = (explicitWorkspaceRevision
  || process.env.ATLAS_GRAPHIFY_EXPECTED_WORKSPACE_REVISION?.trim()) || null;
let workspaceRevisionSource = workspaceRevision ? 'ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION' : null;
let currentCandidate = null;
try {
  const derivation = JSON.parse(readFileSync(DERIVATION, 'utf8'));
  const plan = JSON.parse(readFileSync(SELECTION_PLAN, 'utf8'));
  if (derivation.status === 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION'
    && plan.status === 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED'
    && derivation.snapshotRevision === plan.snapshotRevision
    && derivation.workspaceRevisionCandidate === plan.workspaceRevisionCandidate) {
    currentCandidate = derivation.workspaceRevisionCandidate;
  }
} catch {
  // Missing or malformed current candidate remains fail-closed.
}
if (!workspaceRevision) {
  try {
    const admission = JSON.parse(readFileSync(ADMISSION, 'utf8'));
    if (admission.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
      && admission.authority === true
      && typeof admission.workspaceRevision === 'string') {
      workspaceRevision = admission.workspaceRevision;
      workspaceRevisionSource = 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT';
    }
  } catch {
    // Missing or malformed admission remains a fail-closed null input.
  }
}
if (!explicitWorkspaceRevision && currentCandidate && workspaceRevision !== currentCandidate) {
  workspaceRevision = currentCandidate;
  workspaceRevisionSource = 'CURRENT_SEALED_SNAPSHOT_DERIVATION';
}
// Do not infer current authority from a historical lifecycle artifact. A
// revision becomes eligible here only through an explicit, approved input.
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let runs = [];
let workspaceRows = [];
let coordinatorExecutions = [];
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
  const executionTable = await pool.query(`SELECT to_regclass('public.graphify_executions') AS relation`);
  if (executionTable.rows[0]?.relation) {
    const executionResult = await pool.query(`
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
    `, [workspaceRevision]);
    coordinatorExecutions = executionResult.rows;
  }
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
  currentWorkspaceRevisionCandidate: currentCandidate,
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
  coordinatorExecutionCount: report.coordinatorExecutionCount,
  coordinatorCompletedStageCounts: report.coordinatorExecutions.map((execution) => ({
    executionId: execution.execution_id,
    status: execution.status,
    completedStageCount: execution.completed_stage_count,
  })),
  reportWriteError,
  report: REPORT,
}, null, 2));
