#!/usr/bin/env node
/**
 * GRAPHIFY-STALE-RUN-RECON-01 -- read-only stale-run classification.
 *
 * This report never updates graphify_runs and never starts Graphify. It
 * separates runtime-owner evidence from canonical completion evidence and
 * keeps the historical graphify_runs lifecycle distinct from the newer
 * graphify_executions per-attempt ledger.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { isProcessAlive } from '../startup/lib/graphify-startup-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-stale-run-reconciliation-v1.json');
const STRUCTURAL_PLAN = resolve(ROOT, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const STRUCTURAL_RESOLUTION = resolve(ROOT, 'docs/reports/current-structural-edge-resolution-v1.json');
const STARTUP_LOCK = resolve(ROOT, '.graphify-daily-start.lock');
const WORKSPACE_REVISION = String(
  process.env.ATLAS_GRAPHIFY_WORKSPACE_REVISION
  ?? 'sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9',
).trim();
const STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.ATLAS_GRAPHIFY_STALE_AFTER_MS ?? 6 * 60 * 60 * 1000),
);

function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { __readError: error instanceof Error ? error.message : String(error) };
  }
}

function readStartupLock() {
  if (!existsSync(STARTUP_LOCK)) {
    return {
      path: STARTUP_LOCK,
      present: false,
      parsed: false,
      pid: null,
      pidAlive: false,
      metadata: null,
      error: null,
    };
  }

  try {
    const metadata = JSON.parse(readFileSync(STARTUP_LOCK, 'utf8'));
    const pid = Number(metadata?.pid);
    const pidAlive = Number.isInteger(pid) && pid > 0 ? isProcessAlive(pid) : false;
    return {
      path: STARTUP_LOCK,
      present: true,
      parsed: true,
      pid: Number.isInteger(pid) ? pid : null,
      pidAlive,
      metadata,
      error: null,
    };
  } catch (error) {
    return {
      path: STARTUP_LOCK,
      present: true,
      parsed: false,
      pid: null,
      pidAlive: false,
      metadata: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function ageMs(value, nowMs) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
}

const structuralPlan = readJsonIfPresent(STRUCTURAL_PLAN);
const structuralResolution = readJsonIfPresent(STRUCTURAL_RESOLUTION);
const startupLock = readStartupLock();
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
});

let databaseError = null;
let runs = [];
let activity = [];
let locks = [];
let transaction = null;
let graphifyRunColumns = [];
let client = null;

try {
  client = await pool.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const txResult = await client.query(`
    SELECT current_setting('transaction_isolation') AS isolation_level,
           current_setting('transaction_read_only') AS read_only,
           pg_current_snapshot()::text AS snapshot,
           pg_backend_pid() AS audit_pid
  `);
  transaction = txResult.rows[0] ?? null;
  if (transaction?.isolation_level !== 'repeatable read' || transaction?.read_only !== 'on') {
    throw new Error(`GRAPHIFY_STALE_RECON_TRANSACTION_MODE_MISMATCH:${JSON.stringify(transaction)}`);
  }

  const columnResult = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'graphify_runs'
    ORDER BY ordinal_position
  `);
  graphifyRunColumns = columnResult.rows.map((row) => row.column_name);
  const wanted = [
    'run_id',
    'workspace_id',
    'repository_revision',
    'workspace_revision',
    'source_manifest_digest',
    'source_manifest_source_count',
    'graph_revision',
    'status',
    'dry_run',
    'started_at',
    'last_heartbeat_at',
    'updated_at',
    'completed_at',
  ].filter((name) => graphifyRunColumns.includes(name));

  const result = await client.query(`
    SELECT ${wanted.map((name) => `r."${name}"`).join(', ')},
           (w.id IS NOT NULL) AS workspace_row_present
    FROM public.graphify_runs r
    LEFT JOIN public.workspaces w ON w.id = r.workspace_id
    WHERE r.workspace_revision = $1
    ORDER BY r.started_at DESC NULLS LAST, r.run_id
  `, [WORKSPACE_REVISION]);
  runs = result.rows;

  const activityResult = await client.query(`
    SELECT pid,
           usename,
           application_name,
           state,
           wait_event_type,
           wait_event,
           backend_start,
           xact_start,
           query_start,
           LEFT(query, 500) AS query
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND (
        application_name ILIKE '%graphify%'
        OR (
          state <> 'idle'
          AND (
            query ILIKE '%graphify_runs%'
            OR query ILIKE '%graphify_files%'
            OR query ILIKE '%graphify_executions%'
            OR query ILIKE '%graphify%'
          )
        )
      )
    ORDER BY query_start DESC NULLS LAST, pid
  `);
  activity = activityResult.rows;

  const locksResult = await client.query(`
    SELECT l.pid, l.mode, l.granted, c.relname
    FROM pg_locks l
    JOIN pg_class c ON c.oid = l.relation
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'graphify_runs',
        'graphify_files',
        'graphify_executions',
        'graphify_execution_files',
        'graphify_execution_stages'
      )
    ORDER BY l.pid, c.relname, l.mode
  `);
  locks = locksResult.rows;

  await client.query('ROLLBACK');
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
  if (client) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Best-effort cleanup only.
    }
  }
} finally {
  client?.release();
  await pool.end();
}

const nowMs = Date.now();
const current = runs[0] ?? null;
const completedOwners = runs.filter(
  (run) => run.status === 'COMPLETED' && run.completed_at && run.workspace_row_present,
);
const currentAgeMs = ageMs(current?.started_at, nowMs);
const staleByAge = currentAgeMs !== null && currentAgeMs >= STALE_AFTER_MS;
const liveStartupLock = Boolean(startupLock.present && startupLock.parsed && startupLock.pidAlive);
const anyGraphifyBackendPresent = activity.length > 0;
const anyGraphifyRelationLockPresent = locks.length > 0;
const runtimeOwnerEvidenceAbsent = !liveStartupLock
  && !anyGraphifyBackendPresent
  && !anyGraphifyRelationLockPresent;

const exactRunBoundBackends = current
  ? activity.filter((row) => `${row.application_name ?? ''}\n${row.query ?? ''}`.includes(String(current.run_id)))
  : [];
const exactRunBoundLockPids = new Set(exactRunBoundBackends.map((row) => Number(row.pid)));
const exactRunBoundLocks = locks.filter((row) => exactRunBoundLockPids.has(Number(row.pid)));
const startupLockRunId = startupLock.metadata?.runId ?? startupLock.metadata?.run_id ?? null;
const startupLockBoundToRun = Boolean(
  current
  && startupLockRunId
  && String(startupLockRunId) === String(current.run_id),
);
const processOwnerPresent = Boolean(
  exactRunBoundBackends.length > 0
  || (startupLockBoundToRun && liveStartupLock),
);

const resolutionCoverage = structuralResolution && !structuralResolution.__readError
  ? {
      workspaceRevision: structuralResolution.inputWorkspaceRevision ?? null,
      totalUnresolvedEdges: structuralResolution.totalUnresolvedEdges ?? null,
      syntaxOnlyTotal: structuralResolution.syntaxOnly?.total ?? null,
      syntaxOnlyProcessed: structuralResolution.syntaxOnly?.sampled ?? null,
      unresolvedTargetTotal: structuralResolution.unresolvedTarget?.total ?? null,
      unresolvedTargetProcessed: structuralResolution.unresolvedTarget?.sampled ?? null,
      unresolvedTargetSampleIsPartial: structuralResolution.unresolvedTarget?.sampleIsPartial ?? null,
      perEdgeResultsPersisted: Array.isArray(structuralResolution.unresolvedTarget?.results)
        || Array.isArray(structuralResolution.unresolvedTarget?.outcomes),
    }
  : null;

const structuralRevisionMatches = Boolean(
  current
  && structuralPlan
  && !structuralPlan.__readError
  && structuralPlan.workspaceRevision
  && structuralPlan.workspaceRevision === current.workspace_revision,
);
const resolutionRevisionMatches = Boolean(
  current
  && resolutionCoverage?.workspaceRevision
  && resolutionCoverage.workspaceRevision === current.workspace_revision,
);

let classification;
if (databaseError) {
  classification = 'DATABASE_AUDIT_FAILED';
} else if (!current) {
  classification = 'NO_RUN_FOUND';
} else if (
  (current.status === 'RUNNING' && current.completed_at)
  || (current.status === 'COMPLETED' && !current.completed_at)
) {
  classification = 'CONFLICTING_EVIDENCE';
} else if (current.status === 'RUNNING' && !current.completed_at) {
  if (processOwnerPresent && !staleByAge) classification = 'ACTIVE';
  else if (staleByAge && runtimeOwnerEvidenceAbsent) classification = 'ORPHANED_INCOMPLETE';
  else classification = 'CONFLICTING_EVIDENCE';
} else if (current.status === 'COMPLETED' && current.completed_at) {
  classification = 'ORPHANED_COMPLETE_EVIDENCE';
} else {
  classification = 'CONFLICTING_EVIDENCE';
}

const blockers = [];
if (current?.status !== 'COMPLETED' || !current?.completed_at) {
  blockers.push('CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED');
}
if (!graphifyRunColumns.includes('graph_revision') || !current?.graph_revision) {
  blockers.push('GRAPH_REVISION_NOT_RECORDED_ON_RUN');
}
if (!resolutionCoverage?.perEdgeResultsPersisted) {
  blockers.push('PER_EDGE_STRUCTURAL_OUTCOME_DETAIL_NOT_PERSISTED');
}
if (!structuralRevisionMatches) {
  blockers.push('STRUCTURAL_ARTIFACT_REVISION_MISMATCH_OR_MISSING');
}
if (!resolutionRevisionMatches) {
  blockers.push('STRUCTURAL_RESOLUTION_REVISION_MISMATCH_OR_MISSING');
}
if (!runtimeOwnerEvidenceAbsent && !processOwnerPresent) {
  blockers.push('RUNTIME_OWNER_BINDING_CONFLICTING_OR_UNPROVEN');
}

const report = {
  schema: 'atlas.graphify-stale-run-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STALE_RUN_RECONCILIATION',
  expectedWorkspaceRevision: WORKSPACE_REVISION,
  staleAfterMs: STALE_AFTER_MS,
  databaseError,
  transaction,
  graphifyRunColumns,
  currentRun: current,
  runCount: runs.length,
  completedOwnerCount: completedOwners.length,
  classification,
  executionOwnership: {
    processOwnerPresent,
    startupLockPresent: startupLock.present,
    startupLockParsed: startupLock.parsed,
    startupLockPid: startupLock.pid,
    startupLockPidAlive: startupLock.pidAlive,
    startupLockBoundToRun,
    postgresBackendPresent: exactRunBoundBackends.length > 0,
    postgresRelevantLockPresent: exactRunBoundLocks.length > 0,
    anyGraphifyBackendPresent,
    anyGraphifyRelationLockPresent,
    runtimeOwnerEvidenceAbsent,
    staleByAge,
    currentAgeMs,
    exactRunBoundBackends,
    exactRunBoundLocks,
  },
  canonicalCompletion: {
    graphRevision: current?.graph_revision ?? null,
    graphRevisionColumnPresent: graphifyRunColumns.includes('graph_revision'),
    structuralRevisionMatches,
    resolutionRevisionMatches,
    resolutionCoverage,
    canonicalCompletionEligible: false,
    resumeEligible: 'UNKNOWN_PENDING_PER_EDGE_STRUCTURAL_OUTCOME_RECONCILIATION',
    manualCompleteEligible: false,
  },
  decision: {
    promotionAllowed: false,
    graphRevisionAllowed: false,
    readinessReplayAllowed: false,
    fullGraphifyDailyAllowed: false,
    recommendedNext: classification === 'ORPHANED_INCOMPLETE'
      ? 'GRAPHIFY_STRUCTURAL_OUTCOME_RECON_01'
      : classification === 'ACTIVE'
        ? 'DO_NOT_INTERFERE_WITH_ACTIVE_OWNER'
        : 'RECHECK_RUNTIME_OWNER_AND_EVIDENCE_BINDING',
    mutationRequiredForThisReport: false,
  },
  blockers,
  writes: {
    postgres: false,
    qdrant: false,
    neo4j: false,
    valkey: false,
  },
  readOnly: true,
  runs,
  processEvidence: {
    startupLock,
    activity,
    locks,
    note: 'Filesystem/PID evidence is sampled outside PostgreSQL MVCC and is recorded separately from the repeatable-read database snapshot.',
  },
  structuralEvidence: {
    structuralPlanPath: STRUCTURAL_PLAN,
    structuralResolutionPath: STRUCTURAL_RESOLUTION,
    structuralPlanPresent: Boolean(structuralPlan && !structuralPlan.__readError),
    structuralResolutionPresent: Boolean(structuralResolution && !structuralResolution.__readError),
    resolutionCoverage,
  },
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  classification: report.classification,
  transaction: report.transaction,
  runCount: report.runCount,
  processOwnerPresent: report.executionOwnership.processOwnerPresent,
  runtimeOwnerEvidenceAbsent: report.executionOwnership.runtimeOwnerEvidenceAbsent,
  promotionAllowed: report.decision.promotionAllowed,
  readinessReplayAllowed: report.decision.readinessReplayAllowed,
  readOnly: report.readOnly,
  report: REPORT,
}, null, 2));