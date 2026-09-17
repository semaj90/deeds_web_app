#!/usr/bin/env node

/**
 * Read-only planner for the coordinator execution -> Graphify run bridge.
 *
 * A workspace revision and a single matching run are evidence for a proposed
 * binding, not permission to write it. This planner never updates either
 * graphify table and never chooses by timestamp when more than one candidate
 * exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const ownerPlanPath = path.resolve(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const reportPath = path.resolve(root, 'docs/reports/graphify-execution-run-bridge-v1.json');
const explicitExecutionId = process.argv.find((arg) => arg.startsWith('--execution-id='))?.split('=')[1] ?? null;
const ownerPlan = fs.existsSync(ownerPlanPath) ? JSON.parse(fs.readFileSync(ownerPlanPath, 'utf8')) : null;
const executionId = explicitExecutionId ?? ownerPlan?.existingCanonicalOwner?.executionId ?? null;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 30000 });

let execution = null;
let runs = [];
let sourceSelection = null;
let membershipCount = null;
let databaseError = null;
try {
  const executionResult = await pool.query(
    `SELECT execution_id::text, workspace_id::text, workspace_revision::text,
            legacy_graphify_run_id::text, canonical_authority, status,
            parser_contract_version, extraction_contract_version
       FROM public.graphify_executions
      WHERE execution_id = $1::uuid`,
    [executionId],
  );
    execution = executionResult.rows[0] ?? null;
    if (execution) {
      sourceSelection = (await pool.query(
        `SELECT status, output_checksum FROM public.graphify_execution_stages
          WHERE execution_id = $1::uuid AND stage = 'SOURCE_SELECTION'`,
        [executionId],
      )).rows[0] ?? null;
      membershipCount = Number((await pool.query(
        `SELECT COUNT(*)::int AS count FROM public.graphify_execution_file_membership_v2
          WHERE execution_id = $1::uuid`,
        [executionId],
      )).rows[0]?.count ?? 0);
    const runResult = await pool.query(
      `SELECT run_id::text, workspace_id::text, workspace_revision::text,
              source_manifest_digest, source_manifest_source_count,
              parser_contract_version, extraction_contract_version,
              status, dry_run, completed_at
         FROM public.graphify_runs
        WHERE workspace_revision = $1
          AND workspace_id = $2::uuid
        ORDER BY run_id`,
      [execution.workspace_revision, execution.workspace_id],
    );
    runs = runResult.rows;
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const completedRuns = runs.filter((run) => run.status === 'COMPLETED' && run.dry_run !== true);
const boundRun = execution?.legacy_graphify_run_id
  ? runs.find((run) => run.run_id === execution.legacy_graphify_run_id) ?? null
  : null;
const completeManifestRuns = completedRuns.filter((run) => run.source_manifest_digest && Number(run.source_manifest_source_count) > 0);
const candidateRun = completeManifestRuns.length === 1 ? completeManifestRuns[0] : null;
const checks = {
  executionFound: Boolean(execution),
  executionCanonical: execution?.canonical_authority === true,
  executionCompleted: ['COMPLETED', 'COMPLETED_REUSED'].includes(execution?.status),
  executionHasWorkspaceRevision: Boolean(execution?.workspace_revision),
  boundRunReadback: Boolean(boundRun),
  uniqueCompletedManifestRun: completeManifestRuns.length === 1,
  candidateWorkspaceRevisionMatch: Boolean(candidateRun && candidateRun.workspace_revision === execution?.workspace_revision),
  candidateWorkspaceMatch: Boolean(candidateRun && candidateRun.workspace_id === execution?.workspace_id),
  parserContractMatch: Boolean(candidateRun && candidateRun.parser_contract_version === execution?.parser_contract_version),
  extractionContractMatch: Boolean(candidateRun && candidateRun.extraction_contract_version === execution?.extraction_contract_version),
  sourceSelectionCompleted: sourceSelection?.status === 'COMPLETED',
  manifestDigestMatchesSourceSelection: Boolean(candidateRun && sourceSelection?.output_checksum && `sha256:${candidateRun.source_manifest_digest}` === sourceSelection.output_checksum),
  manifestCountMatchesExecutionMembership: Boolean(candidateRun && membershipCount !== null && Number(candidateRun.source_manifest_source_count) === membershipCount),
  expectedMembershipCount: membershipCount === 25542,
};
const status = databaseError ? 'BLOCKED_DATABASE_READ'
  : !checks.executionFound ? 'BLOCKED_EXECUTION_NOT_FOUND'
    : !checks.executionCanonical ? 'BLOCKED_EXECUTION_NOT_CANONICAL'
      : checks.boundRunReadback ? 'BRIDGE_READBACK_PROVEN'
        : checks.uniqueCompletedManifestRun && checks.candidateWorkspaceRevisionMatch && checks.candidateWorkspaceMatch
          ? 'READY_FOR_EXPLICIT_BINDING'
          : 'AMBIGUOUS_RUN_CANDIDATES';
const bindingReady = status === 'READY_FOR_EXPLICIT_BINDING'
  && checks.parserContractMatch
  && checks.extractionContractMatch
  && checks.sourceSelectionCompleted
  && checks.manifestDigestMatchesSourceSelection
  && checks.manifestCountMatchesExecutionMembership;
const finalStatus = status === 'BRIDGE_READBACK_PROVEN'
  ? status
  : bindingReady ? status : status === 'READY_FOR_EXPLICIT_BINDING' ? 'BRIDGE_EVIDENCE_INCOMPLETE' : status;
const deterministic = {
  schema: 'atlas.graphify-execution-run-bridge.v1',
  mode: 'READ_ONLY_BRIDGE_PLAN',
  executionId,
  execution,
  candidateRun,
  candidateRunCount: completeManifestRuns.length,
  candidateRunIds: completeManifestRuns.map((run) => run.run_id),
  checks,
  status: finalStatus,
  sourceSelection,
  executionMembershipCount: membershipCount,
  authorizationRequired: finalStatus === 'READY_FOR_EXPLICIT_BINDING',
  canonicalAuthority: false,
  writesPerformed: false,
};
const report = {
  ...deterministic,
  generatedAt: new Date().toISOString(),
  runs,
  databaseError,
  planChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify(deterministic), 'utf8').digest('hex')}`,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tempPath, reportPath);
console.log(JSON.stringify({ status: finalStatus, executionId, candidateRunCount: completeManifestRuns.length, executionMembershipCount: membershipCount, writesPerformed: false, reportPath: report.reportPath }, null, 2));
