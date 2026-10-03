#!/usr/bin/env node

/**
 * Explicitly bind one canonical coordinator execution to one completed
 * Graphify run. The default mode is read-only. Applying requires the exact
 * IDs, --apply, --plan-checksum, and ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_RUN_BRIDGE_V1=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadAuthorityShadowModuleV1 } from './lib/load-authority-shadow-v1.mjs';

const root = process.cwd();
const executionId = process.argv.find((arg) => arg.startsWith('--execution-id='))?.split('=')[1] ?? null;
const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.split('=')[1] ?? null;
const planChecksum = process.argv.find((arg) => arg.startsWith('--plan-checksum='))?.split('=')[1] ?? null;
const apply = process.argv.includes('--apply');
const rollbackCanary = process.argv.includes('--rollback-canary');
const authorized = process.env.ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_RUN_BRIDGE_V1 === '1';
// A read-only preflight must never overwrite the historical APPLY record; it gets its own report file.
const reportPath = path.resolve(
  root,
  apply || rollbackCanary
    ? 'docs/reports/graphify-execution-run-bridge-apply-v1.json'
    : 'docs/reports/graphify-execution-run-bridge-preflight-v1.json',
);
if (!executionId || !runId) throw new Error('EXPLICIT_EXECUTION_ID_AND_RUN_ID_REQUIRED');
if ((apply || rollbackCanary) && !planChecksum) throw new Error('PLAN_CHECKSUM_REQUIRED_FOR_APPLY');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 30000 });
let execution = null;
let run = null;
let databaseError = null;
let readback = null;
let writesPerformed = false;
// Shadow observation (diagnostic only): never feeds `checks`, the FOR UPDATE target in the apply path, or apply eligibility.
let authorityShadow = { runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', error: null, observation: null };
try {
  const plannerReportPath = path.resolve(root, 'docs/reports/graphify-execution-run-bridge-v1.json');
  const plannerReport = fs.existsSync(plannerReportPath) ? JSON.parse(fs.readFileSync(plannerReportPath, 'utf8')) : null;
  const plannerMatches = Boolean(planChecksum && plannerReport?.planChecksum === planChecksum);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    execution = (await client.query(
      `SELECT execution_id::text, workspace_id::text, workspace_revision::text,
              legacy_graphify_run_id::text, canonical_authority, status,
              parser_contract_version, extraction_contract_version
         FROM public.graphify_executions WHERE execution_id = $1::uuid`,
      [executionId],
    )).rows[0] ?? null;
    run = (await client.query(
      `SELECT run_id::text, workspace_id::text, workspace_revision::text,
              source_manifest_digest, source_manifest_source_count,
              status, dry_run, parser_contract_version, extraction_contract_version
         FROM public.graphify_runs WHERE run_id = $1::uuid`,
      [runId],
    )).rows[0] ?? null;
    const sourceSelection = (await client.query(
      `SELECT status, output_checksum FROM public.graphify_execution_stages
        WHERE execution_id = $1::uuid AND stage = 'SOURCE_SELECTION'`,
      [executionId],
    )).rows[0] ?? null;
    const membershipCount = Number((await client.query(
      `SELECT COUNT(*)::int AS count FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1::uuid`,
      [executionId],
    )).rows[0]?.count ?? 0);
    if (execution) {
      execution.sourceSelection = sourceSelection;
      execution.membershipCount = membershipCount;
    }
    if (execution) {
      await client.query('SAVEPOINT authority_shadow');
      try {
        const { loadAuthorityShadowV1 } = await loadAuthorityShadowModuleV1();
        authorityShadow.observation = await loadAuthorityShadowV1(client, { workspaceId: execution.workspace_id, workspaceRevision: execution.workspace_revision });
      } catch (error) {
        authorityShadow.error = error instanceof Error ? error.message : String(error);
        await client.query('ROLLBACK TO SAVEPOINT authority_shadow');
      }
    }
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }

  const checks = {
    executionFound: Boolean(execution),
    runFound: Boolean(run),
    executionCanonical: execution?.canonical_authority === true,
    executionCompleted: ['COMPLETED', 'COMPLETED_REUSED'].includes(execution?.status),
    runCompleted: run?.status === 'COMPLETED' && run?.dry_run !== true,
    workspaceMatch: Boolean(execution && run && execution.workspace_id === run.workspace_id),
    revisionMatch: Boolean(execution && run && execution.workspace_revision === run.workspace_revision),
    parserContractMatch: Boolean(execution && run && execution.parser_contract_version === run.parser_contract_version),
    extractionContractMatch: Boolean(execution && run && execution.extraction_contract_version === run.extraction_contract_version),
    sourceSelectionCompleted: execution?.sourceSelection?.status === 'COMPLETED',
    manifestDigestMatchesSourceSelection: Boolean(run?.source_manifest_digest && execution?.sourceSelection?.output_checksum && `sha256:${run.source_manifest_digest}` === execution.sourceSelection.output_checksum),
    manifestCountMatchesExecutionMembership: Boolean(run && Number(run.source_manifest_source_count) === execution?.membershipCount),
    expectedMembershipCount: execution?.membershipCount === 25542,
    frozenPlanChecksumMatches: (!apply && !rollbackCanary) || plannerMatches,
    manifestBound: Boolean(run?.source_manifest_digest && Number(run?.source_manifest_source_count) > 0),
    alreadyBoundToRequestedRun: execution?.legacy_graphify_run_id === runId,
    conflictingExistingRun: Boolean(execution?.legacy_graphify_run_id && execution.legacy_graphify_run_id !== runId),
  };
  const safe = checks.executionFound && checks.runFound && checks.executionCanonical && checks.executionCompleted
    && checks.runCompleted && checks.workspaceMatch && checks.revisionMatch && checks.manifestBound
    && checks.parserContractMatch && checks.extractionContractMatch
    && checks.sourceSelectionCompleted && checks.manifestDigestMatchesSourceSelection
    && checks.manifestCountMatchesExecutionMembership && checks.frozenPlanChecksumMatches
    && !checks.conflictingExistingRun;
  const report = {
    schema: 'atlas.graphify-execution-run-bridge-apply.v1',
    mode: apply ? 'AUTHORIZED_APPLY_REQUEST' : 'READ_ONLY_APPLY_PREFLIGHT',
    executionId,
    runId,
    execution,
    run,
    checks,
    safeToApply: safe && !writesPerformed,
    authorization: { required: true, supplied: authorized, envFlag: 'ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_RUN_BRIDGE_V1' },
    planChecksum: planChecksum ?? null,
    rollbackCanary,
    writesPerformed: false,
    canonicalAuthority: false,
    status: safe ? (checks.alreadyBoundToRequestedRun ? 'BRIDGE_ALREADY_PROVEN' : 'READY_FOR_AUTHORIZATION') : 'BRIDGE_PREFLIGHT_BLOCKED',
  };

  if ((apply || rollbackCanary) && authorized && safe && !checks.alreadyBoundToRequestedRun) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const locked = (await client.query(
        `SELECT execution_id::text, workspace_id::text, workspace_revision::text,
                legacy_graphify_run_id::text, canonical_authority, status,
                parser_contract_version, extraction_contract_version
           FROM public.graphify_executions WHERE execution_id = $1::uuid FOR UPDATE`,
        [executionId],
      )).rows[0] ?? null;
      if (!locked) throw new Error('EXECUTION_RUN_BRIDGE_PREIMAGE_CHANGED');
      if (locked.legacy_graphify_run_id && locked.legacy_graphify_run_id !== runId) {
        throw new Error('BRIDGE_COLLISION');
      }
      const lockedRun = (await client.query(
        `SELECT workspace_id::text, workspace_revision::text,
                parser_contract_version, extraction_contract_version,
                source_manifest_digest, source_manifest_source_count,
                status, dry_run
           FROM public.graphify_runs WHERE run_id = $1::uuid FOR SHARE`,
        [runId],
      )).rows[0] ?? null;
      const lockedSourceSelection = (await client.query(
        `SELECT status, output_checksum
           FROM public.graphify_execution_stages
          WHERE execution_id = $1::uuid AND stage = 'SOURCE_SELECTION'`,
        [executionId],
      )).rows[0] ?? null;
      const lockedMembershipCount = Number((await client.query(
        `SELECT COUNT(*)::int AS count
           FROM public.graphify_execution_file_membership_v2
          WHERE execution_id = $1::uuid`,
        [executionId],
      )).rows[0]?.count ?? 0);
      const lockedEvidenceValid = locked.canonical_authority === true
        && ['COMPLETED', 'COMPLETED_REUSED'].includes(locked.status)
        && lockedRun?.status === 'COMPLETED'
        && lockedRun?.dry_run !== true
        && lockedSourceSelection?.status === 'COMPLETED'
        && lockedRun?.source_manifest_digest
        && `sha256:${lockedRun.source_manifest_digest}` === lockedSourceSelection.output_checksum
        && Number(lockedRun.source_manifest_source_count) === lockedMembershipCount
        && lockedMembershipCount === 25542;
      if (!lockedEvidenceValid || !lockedRun || lockedRun.workspace_id !== locked.workspace_id
        || lockedRun.workspace_revision !== locked.workspace_revision
        || lockedRun.parser_contract_version !== locked.parser_contract_version
        || lockedRun.extraction_contract_version !== locked.extraction_contract_version
        || !plannerMatches) {
        throw new Error('EXECUTION_RUN_BRIDGE_PREIMAGE_CHANGED');
      }
      if (!locked.legacy_graphify_run_id) {
        await client.query(
          `UPDATE public.graphify_executions
              SET legacy_graphify_run_id = $1::uuid
            WHERE execution_id = $2::uuid AND legacy_graphify_run_id IS NULL
          RETURNING execution_id::text, legacy_graphify_run_id::text`,
          [runId, executionId],
        );
      }
      readback = (await client.query(
        `SELECT execution_id::text, legacy_graphify_run_id::text
           FROM public.graphify_executions WHERE execution_id = $1::uuid`,
        [executionId],
      )).rows[0] ?? null;
      if (readback?.legacy_graphify_run_id !== runId) throw new Error('EXECUTION_RUN_BRIDGE_READBACK_MISMATCH');
      if (locked.legacy_graphify_run_id === runId) {
        await client.query('ROLLBACK');
        report.status = 'BRIDGE_IDEMPOTENT_REPLAY';
        report.rolledBack = true;
      } else if (rollbackCanary) {
        await client.query('ROLLBACK');
        report.rolledBack = true;
        report.status = 'BRIDGE_CANARY_READBACK_PROVEN';
      } else {
        await client.query('COMMIT');
        writesPerformed = true;
        report.writesPerformed = true;
        report.status = 'BRIDGE_APPLIED_READBACK_PROVEN';
      }
      report.safeToApply = false;
      report.readback = readback;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  const stable = { ...report, generatedAt: undefined, readback: report.readback ?? null, receiptChecksum: undefined };
  report.receiptChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable), 'utf8').digest('hex')}`;
  report.authorityShadow = authorityShadow; // attached AFTER the checksum so the existing receiptChecksum is unaffected
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, reportPath);
  console.log(JSON.stringify({ status: report.status, executionId, runId, writesPerformed, readback: report.readback ?? null, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
  const report = { schema: 'atlas.graphify-execution-run-bridge-apply.v1', mode: apply ? 'AUTHORIZED_APPLY_REQUEST' : 'READ_ONLY_APPLY_PREFLIGHT', executionId, runId, status: 'BRIDGE_PREFLIGHT_ERROR', error: databaseError, writesPerformed: false, canonicalAuthority: false };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, reportPath);
  console.error(JSON.stringify({ status: report.status, error: databaseError, writesPerformed: false, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
