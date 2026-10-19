#!/usr/bin/env node
/**
 * GRAPHIFY-LIFECYCLE-OWNER-01 / GRAPHIFY-STALE-RUN-DISPOSITION-01 /
 * GRAPHIFY-CURRENT-RUN-ELIGIBILITY-01 -- read-only lifecycle audit.
 *
 * This script inventories lifecycle state and code ownership only. It never
 * changes graphify_runs, starts Graphify, or promotes a revision.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
  classifyGraphifyOwnerRoleV1,
  compareGraphifyExecutionReceiptsV1,
  findGraphifyTransitionPrimitivesV1,
  resolveGraphifyAuditOutputDirV1,
  summarizeGraphifyOwnerRolesV1,
} from './lib/graphify-owner-role-audit-v1.mjs';

const root = REPO_ROOT;
const sourceReportsDir = path.join(root, 'docs', 'reports');
const reportsDir = resolveGraphifyAuditOutputDirV1(root, process.env.ATLAS_GRAPHIFY_LIFECYCLE_REPORT_DIR);
const ownerReportPath = path.join(reportsDir, 'graphify-lifecycle-owner-v1.json');
const portfolioReportPath = path.join(reportsDir, 'graphify-stale-run-portfolio-v1.json');
const eligibilityReportPath = path.join(reportsDir, 'graphify-current-run-eligibility-v1.json');
const runIdArg = process.env.ATLAS_GRAPHIFY_RUN_ID ?? null;

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function commitDistance(revision, head) {
  if (!revision || !head) return null;
  // Graphify repository_revision may be a content identity (for example
  // sha256:<digest>), not a Git object. Do not ask Git to resolve it or emit a
  // misleading fatal error; such revisions are compared only by the explicit
  // content/manifest evidence gates.
  if (/^sha256:/i.test(String(revision))) return null;
  try { return Number(execFileSync('git', ['rev-list', '--count', `${revision}..${head}`], { cwd: root, encoding: 'utf8' }).trim()); }
  catch { return null; }
}

function classifyLifecyclePath(filePath, text) {
  return classifyGraphifyOwnerRoleV1(filePath, text);
}

function findLifecyclePaths() {
  let listing = '';
  try {
    listing = execFileSync('rg', ['-l', 'graphify_(?:runs|executions|execution_authority)', 'scripts/atlas', 'sveltekit-frontend/src', 'packages', '--glob', '!**/node_modules/**', '--glob', '!docs/**'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } catch { return []; }
  const discovered = listing.split(/\r?\n/).filter(Boolean).filter((relativePath) => !/(?:\.spec\.|\.test\.|__tests__[\\/])/i.test(relativePath));
  const requiredRolePaths = [
    'scripts/startup/run-graphify-daily-startup.mjs',
    'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts',
    'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.ts',
    'scripts/atlas/lib/graphify-owner-decision-v1.mjs',
    'scripts/atlas/apply-graphify-stale-run-reconciliation-v1.mjs',
  ];
  for (const requiredPath of requiredRolePaths) {
    if (existsSync(path.join(root, requiredPath)) && !discovered.includes(requiredPath)) discovered.push(requiredPath);
  }
  return [...new Set(discovered.map((relativePath) => relativePath.replaceAll('\\', '/')))].map((relativePath) => {
    const text = readFileSync(path.join(root, relativePath), 'utf8');
    return { path: relativePath.replaceAll('\\', '/'), classification: classifyLifecyclePath(relativePath, text), mutationSignals: [...text.matchAll(/(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+[^\n;]*graphify_(?:runs|executions|execution_authority)/gi)].map((match) => match[0].slice(0, 180)), transitionPrimitives: [...text.matchAll(/\b(completeExecution|completeGraphifyRunInTransactionV2|completeGraphifyRunV2)\b/g)].map((match) => match[1]) };
  }).filter((entry) => entry.classification);
}

const headRevision = gitHead();
const namespacePath = path.join(sourceReportsDir, 'workspace-source-namespace-v1.json');
const namespaceReport = existsSync(namespacePath) ? JSON.parse(readFileSync(namespacePath, 'utf8')) : null;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let runs = [];
let statusValues = [];
let columns = [];
let authorityRows = [];
try {
  const columnResult = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'graphify_runs' ORDER BY ordinal_position`);
  columns = columnResult.rows.map((row) => row.column_name);
  const wanted = ['run_id', 'workspace_id', 'workspace_revision', 'repository_revision', 'graph_revision', 'source_manifest_digest', 'source_manifest_source_count', 'status', 'dry_run', 'started_at', 'last_heartbeat_at', 'completed_at'].filter((name) => columns.includes(name));
  if (wanted.length > 0) {
    const result = await pool.query(`SELECT ${wanted.map((name) => `"${name}"`).join(', ')} FROM public.graphify_runs ORDER BY started_at ASC NULLS FIRST, run_id`);
    runs = result.rows;
    const statuses = await pool.query(`SELECT DISTINCT status::text AS status FROM public.graphify_runs ORDER BY status::text`);
    statusValues = statuses.rows.map((row) => row.status);
  }
  const authorityTable = await pool.query("SELECT to_regclass('public.graphify_execution_authority') AS relation");
  if (authorityTable.rows[0]?.relation) {
    const authorityColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='graphify_execution_authority'");
    const available = new Set(authorityColumns.rows.map((row) => row.column_name));
    if (available.has('execution_id') && available.has('authority_state')) {
      const result = await pool.query('SELECT execution_id::text AS execution_id, authority_state::text AS authority_state FROM public.graphify_execution_authority ORDER BY execution_id');
      authorityRows = result.rows;
    }
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const lifecyclePaths = findLifecyclePaths();
const ownerRoles = summarizeGraphifyOwnerRolesV1(lifecyclePaths);
const transitionPrimitives = findGraphifyTransitionPrimitivesV1(lifecyclePaths);
const decisionReceiptPath = path.join(root, 'docs', 'reports', 'current-graphify-execution-owner-decision-v1.json');
const dailyReceiptPath = path.join(root, 'docs', 'reports', 'graphify-daily-lifecycle-v1.json');
const decisionReceipt = existsSync(decisionReceiptPath) ? JSON.parse(readFileSync(decisionReceiptPath, 'utf8')) : null;
const dailyReceipt = existsSync(dailyReceiptPath) ? JSON.parse(readFileSync(dailyReceiptPath, 'utf8')) : null;
const receiptConsistency = compareGraphifyExecutionReceiptsV1({ decisionReceipt, dailyReceipt, authorityRows });
const runningRunCount = runs.filter((run) => run.status === 'RUNNING').length;
const portfolio = runs.map((run) => {
  const distance = commitDistance(run.repository_revision, headRevision);
  const activeWorkerEvidence = false;
  const currentAuthorityEvidence = run.status === 'COMPLETED'
    && Boolean(run.completed_at)
    && Boolean(run.repository_revision && headRevision && run.repository_revision === headRevision);
  const namespaceStatus = namespaceReport?.status === 'WORKSPACE_SOURCE_NAMESPACE_PROVEN' ? 'PROVEN' : 'UNRESOLVED';
  return {
    runId: run.run_id,
    status: run.status,
    workspaceRevision: run.workspace_revision ?? null,
    repositoryRevision: run.repository_revision ?? null,
    graphRevision: run.graph_revision ?? null,
    commitsBehindHead: distance,
    startedAt: run.started_at ?? null,
    lastHeartbeatAt: run.last_heartbeat_at ?? null,
    activeWorkerEvidence,
    currentAuthorityEvidence,
    structuralArtifactRevision: null,
    artifactMatchesRunRevision: false,
    recommendedDisposition: currentAuthorityEvidence ? 'KEEP' : distance !== null && distance > 0 ? 'SUPERSEDE' : 'UNKNOWN',
    namespaceStatus,
    evidenceRefs: [
      'docs/reports/graphify-lifecycle-owner-v1.json',
      'docs/reports/workspace-source-namespace-v1.json',
      'docs/reports/graphify-stale-run-reconciliation-v1.json',
    ],
  };
});

const currentRunCount = portfolio.filter((run) => run.currentAuthorityEvidence).length;
const staleRunCount = portfolio.filter((run) => run.recommendedDisposition === 'SUPERSEDE').length;
const namespaceOwner = namespaceReport?.repositoryKey ? 'workspace-source-namespace-audit (authority unresolved)' : 'UNPROVEN';
const ownerReport = {
  schema: 'atlas.graphify-lifecycle-owner.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LIFECYCLE_OWNER_AUDIT',
  databaseError,
  lifecycleOwner: null,
  lifecycleOwnerStatus: ownerRoles.status,
  ownerRoles,
  receiptConsistency,
  authorityRows,
  supportedLifecycleStates: statusValues,
  transitionPrimitiveExists: transitionPrimitives.length > 0,
  transitionPrimitives,
  lifecyclePaths,
  runningRunCount,
  staleRunCount,
  currentRunCount,
  repositoryHeadRevision: headRevision,
  writesPerformed: false,
  canonicalAuthority: false,
};

const portfolioReport = {
  schema: 'atlas.graphify-stale-run-portfolio.v1',
  generatedAt: ownerReport.generatedAt,
  mode: 'READ_ONLY_STALE_RUN_PORTFOLIO',
  runningRunCount,
  staleRunCount,
  currentRunCount,
  repositoryHeadRevision: headRevision,
  runs: portfolio,
  writesPerformed: false,
  canonicalAuthority: false,
};

const blockers = [];
if (databaseError) blockers.push('DATABASE_AUDIT_FAILED');
if (ownerRoles.status !== 'OWNER_ROLES_IDENTIFIED') blockers.push('LIFECYCLE_OWNER_ROLES_UNPROVEN');
if (receiptConsistency.status !== 'RECEIPTS_CONSISTENT') blockers.push(...receiptConsistency.reasonCodes);
if (runningRunCount - currentRunCount > 0) blockers.push('STALE_RUNS_NOT_RECONCILED');
if (currentRunCount !== 1) blockers.push('CURRENT_RUN_NOT_ESTABLISHED');
if (namespaceReport?.status !== 'WORKSPACE_SOURCE_NAMESPACE_PROVEN') blockers.push('SOURCE_NAMESPACE_UNPROVEN');
if (portfolio.some((run) => run.repositoryRevision !== headRevision)) blockers.push('REPOSITORY_REVISION_NOT_CURRENT');

const eligibilityReport = {
  schema: 'atlas.graphify-current-run-eligibility.v1',
  generatedAt: ownerReport.generatedAt,
  mode: 'READ_ONLY_CURRENT_RUN_ELIGIBILITY',
  runningRunCount,
  staleRunCount,
  currentRunCount,
  lifecycleOwner: null,
  lifecycleOwnerProven: false,
  ownerRoles,
  receiptConsistency,
  authorityRows,
  supportedLifecycleStates: statusValues,
  transitionPrimitiveExists: transitionPrimitives.length > 0,
  transitionPrimitives,
  staleRunsReconciled: runningRunCount - currentRunCount === 0,
  namespaceOwner,
  namespaceAuthorityStatus: namespaceReport?.status === 'WORKSPACE_SOURCE_NAMESPACE_PROVEN' ? 'PROVEN' : 'UNRESOLVED',
  repositoryRevision: headRevision,
  workspaceRevision: null,
  inputSnapshotChecksum: null,
  eligibleForFreshRun: blockers.length === 0,
  blockers,
  writesPerformed: false,
  canonicalAuthority: false,
};

mkdirSync(reportsDir, { recursive: true });
for (const report of [ownerReport, portfolioReport, eligibilityReport]) report.reportChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(report), 'utf8').digest('hex')}`;
writeFileSync(ownerReportPath, `${JSON.stringify(ownerReport, null, 2)}\n`);
writeFileSync(portfolioReportPath, `${JSON.stringify(portfolioReport, null, 2)}\n`);
writeFileSync(eligibilityReportPath, `${JSON.stringify(eligibilityReport, null, 2)}\n`);
console.log(JSON.stringify({
  lifecycleOwnerStatus: ownerReport.lifecycleOwnerStatus,
  ownerRoles: ownerRoles.status,
  receiptConsistency: receiptConsistency.status,
  runningRunCount,
  staleRunCount,
  currentRunCount,
  supportedLifecycleStates: statusValues,
  namespaceAuthorityStatus: eligibilityReport.namespaceAuthorityStatus,
  eligibleForFreshRun: eligibilityReport.eligibleForFreshRun,
  blockers,
  writesPerformed: false,
  reports: [ownerReportPath, portfolioReportPath, eligibilityReportPath],
}, null, 2));
