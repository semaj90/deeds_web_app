#!/usr/bin/env node

/**
 * Read-only reconciliation of the admitted source snapshot through the
 * selected Graphify execution and the existing source-binding ledgers.
 *
 * This audit deliberately does not apply execution bridges, insert workspace
 * bindings, backfill packets, or promote any source authority.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const admissionPath = path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const ownerPlanPath = path.join(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const reportPath = path.join(root, 'docs/reports/current-graphify-source-bridge-reconciliation-v1.json');
const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const normalizeDigest = (value) => String(value ?? '').trim().replace(/^sha256:/i, '').toLowerCase();
const text = (value) => (value === null || value === undefined ? null : String(value));
const countBy = (rows, key) => rows.reduce((counts, row) => {
  const value = row[key] ?? 'NULL';
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
const workspaceRevision = valueFor('--workspace-revision') ?? admission.workspaceRevision ?? null;
const executionId = valueFor('--execution-id');
if (!executionId) throw new Error('CURRENT_GRAPHIFY_SOURCE_BRIDGE_EXECUTION_ID_REQUIRED');
if (!/^sha256:[0-9a-f]{64}$/i.test(String(workspaceRevision ?? ''))) {
  throw new Error('CURRENT_GRAPHIFY_SOURCE_BRIDGE_WORKSPACE_REVISION_INVALID');
}

const snapshotPath = path.join(root, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const manifestRows = (snapshot.sources ?? [])
  .filter((row) => row.repositoryId === 'repo:root')
  .map((row) => ({
    sourceRef: normalizeRef(row.sourceRef),
    relativePath: normalizeRef(row.repositoryRelativePath),
    sourceRevision: text(row.sourceRevision),
    contentDigest: normalizeDigest(row.contentDigest),
    byteLength: Number(row.byteLength),
  }))
  .filter((row) => row.sourceRef || row.relativePath);
const manifestByRef = new Map(manifestRows.map((row) => [row.sourceRef || row.relativePath, row]));
const preferredExecution = (() => {
  try {
    const plan = JSON.parse(fs.readFileSync(ownerPlanPath, 'utf8'));
    return plan.preferredExecutionId ?? plan.preferred?.executionId ?? null;
  } catch {
    return null;
  }
})();

const report = {
  schema: 'atlas.current-graphify-source-bridge-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  workspaceRevision,
  workspaceRevisionSource: valueFor('--workspace-revision') ? 'EXPLICIT_ARGUMENT' : 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT',
  snapshotRevision: admission.snapshotRevision ?? null,
  executionId,
  preferredExecutionFromPlan: preferredExecution,
  writesPerformed: false,
  canonicalAuthority: false,
  stages: {},
  counts: {},
  mismatches: {},
  status: 'UNPROVEN',
};

const emptyStage = (source, error = null) => ({ source, available: !error, error, rowCount: 0, qualifiedCount: 0, rows: [] });
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 60_000,
  application_name: 'atlas-current-graphify-source-bridge-reconciliation-v1',
});

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const execution = (await client.query(`
      SELECT execution_id::text, workspace_id::text, workspace_revision::text,
             status, canonical_authority, legacy_graphify_run_id::text
        FROM public.graphify_executions
       WHERE execution_id = $1::uuid
    `, [executionId])).rows[0] ?? null;
    const sourceSelection = (await client.query(`
      SELECT status, output_checksum, receipt_ref
        FROM public.graphify_execution_stages
       WHERE execution_id = $1::uuid AND stage = 'SOURCE_SELECTION'
    `, [executionId])).rows[0] ?? null;
    const membershipRows = (await client.query(`
      SELECT repository_id::text, repository_relative_path::text, source_ref::text,
             workspace_revision::text, code_source_revision::text,
             content_hash::text, byte_length::int
        FROM public.graphify_execution_file_membership_v2
       WHERE execution_id = $1::uuid
       ORDER BY repository_id, repository_relative_path
    `, [executionId])).rows;
    let legacyRows = [];
    try {
      legacyRows = (await client.query(`
        SELECT source_ref::text, workspace_revision::text,
               code_source_revision::text, content_hash::text, byte_length::int
          FROM public.graphify_execution_files
         WHERE execution_id = $1::uuid
         ORDER BY source_ref
      `, [executionId])).rows;
    } catch (error) {
      report.stages.legacyExecutionFiles = emptyStage('graphify_execution_files', error instanceof Error ? error.message : String(error));
    }
    let graphifyRows = [];
    try {
      graphifyRows = (await client.query(`
        SELECT source_ref::text, workspace_revision::text,
               code_source_revision::text, content_hash::text, byte_length::int,
               last_seen_run_id::text
          FROM public.graphify_files
         WHERE workspace_revision = $1
         ORDER BY source_ref
      `, [workspaceRevision])).rows;
    } catch (error) {
      report.stages.graphifyFiles = emptyStage('graphify_files', error instanceof Error ? error.message : String(error));
    }
    let bindingRows = [];
    try {
      bindingRows = (await client.query(`
        SELECT canonical_source_ref::text AS source_ref,
               workspace_revision::text, source_revision::text,
               content_digest::text, byte_length::int, producer_revision::text
          FROM public.atlas_workspace_source_bindings
         WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
         ORDER BY canonical_source_ref
      `, [workspaceRevision])).rows;
    } catch (error) {
      report.stages.workspaceBindings = emptyStage('atlas_workspace_source_bindings', error instanceof Error ? error.message : String(error));
    }

    report.execution = execution;
    report.sourceSelection = sourceSelection;
    report.stages.sourceManifest = {
      source: 'workspace-source-snapshot',
      available: true,
      rowCount: manifestRows.length,
      qualifiedCount: manifestRows.filter((row) => row.sourceRevision && row.contentDigest && Number.isFinite(row.byteLength)).length,
      checksum: digest(manifestRows.map((row) => `${row.sourceRef}\0${row.sourceRevision}\0${row.contentDigest}\0${row.byteLength}`).join('\n')),
    };
    report.stages.executionMembershipV2 = { source: 'graphify_execution_file_membership_v2', available: true, rowCount: membershipRows.length, rows: membershipRows.slice(0, 100) };
    report.stages.legacyExecutionFiles ??= { source: 'graphify_execution_files', available: true, rowCount: legacyRows.length, rows: legacyRows.slice(0, 100) };
    report.stages.graphifyFiles ??= { source: 'graphify_files', available: true, rowCount: graphifyRows.length, rows: graphifyRows.slice(0, 100) };
    report.stages.workspaceBindings ??= { source: 'atlas_workspace_source_bindings', available: true, rowCount: bindingRows.length, rows: bindingRows.slice(0, 100) };

    const membershipRoot = membershipRows.filter((row) => row.repository_id === 'repo:root');
    const compare = (rows, refField = 'source_ref') => rows.map((row) => {
      const ref = normalizeRef(row[refField]);
      const expected = manifestByRef.get(ref);
      const sourceRevision = text(row.code_source_revision ?? row.source_revision);
      const contentDigest = normalizeDigest(row.content_hash ?? row.content_digest);
      return {
        sourceRef: ref,
        existsInManifest: Boolean(expected),
        workspaceRevisionMatch: text(row.workspace_revision) === workspaceRevision,
        sourceRevisionMatch: Boolean(expected && sourceRevision === expected.sourceRevision),
        contentDigestMatch: Boolean(expected && contentDigest === expected.contentDigest),
        byteLengthMatch: Boolean(expected && Number(row.byte_length) === expected.byteLength),
        qualified: Boolean(expected && text(row.workspace_revision) === workspaceRevision && sourceRevision === expected.sourceRevision && contentDigest === expected.contentDigest && Number(row.byte_length) === expected.byteLength),
      };
    });
    const membershipComparison = compare(membershipRoot, 'source_ref');
    const graphifyComparison = compare(graphifyRows, 'source_ref');
    const bindingComparison = compare(bindingRows, 'source_ref');
    report.comparisons = {
      executionMembershipV2: membershipComparison.slice(0, 100),
      graphifyFiles: graphifyComparison.slice(0, 100),
      workspaceBindings: bindingComparison.slice(0, 100),
    };
    report.counts = {
      manifestRows: manifestRows.length,
      manifestQualifiedRows: report.stages.sourceManifest.qualifiedCount,
      executionMembershipRows: membershipRows.length,
      executionRootMembershipRows: membershipRoot.length,
      legacyExecutionFileRows: legacyRows.length,
      graphifyFileRows: graphifyRows.length,
      workspaceBindingRows: bindingRows.length,
      executionWorkspaceRevisionMatches: membershipRoot.filter((row) => text(row.workspace_revision) === workspaceRevision).length,
      executionSourceRevisionQualified: membershipComparison.filter((row) => row.sourceRevisionMatch).length,
      executionContentDigestQualified: membershipComparison.filter((row) => row.contentDigestMatch).length,
      executionExactManifestMatches: membershipComparison.filter((row) => row.qualified).length,
      graphifyExactManifestMatches: graphifyComparison.filter((row) => row.qualified).length,
      workspaceBindingExactManifestMatches: bindingComparison.filter((row) => row.qualified).length,
    };
    report.mismatches = {
      membershipWorkspaceRevision: countBy(membershipComparison.filter((row) => !row.workspaceRevisionMatch), 'sourceRef'),
      membershipMissingManifest: countBy(membershipComparison.filter((row) => !row.existsInManifest), 'sourceRef'),
      membershipSourceRevision: countBy(membershipComparison.filter((row) => !row.sourceRevisionMatch), 'sourceRef'),
      membershipContentDigest: countBy(membershipComparison.filter((row) => !row.contentDigestMatch), 'sourceRef'),
      graphifyMissingManifest: countBy(graphifyComparison.filter((row) => !row.existsInManifest), 'sourceRef'),
      bindingMissingManifest: countBy(bindingComparison.filter((row) => !row.existsInManifest), 'sourceRef'),
    };
    report.identityChecks = {
      executionFound: Boolean(execution),
      executionRevisionMatchesAdmission: execution?.workspace_revision === workspaceRevision,
      executionCompleted: ['COMPLETED', 'COMPLETED_REUSED'].includes(execution?.status),
      executionCanonicalAuthority: execution?.canonical_authority === true,
      sourceSelectionCompleted: sourceSelection?.status === 'COMPLETED',
      membershipUsesCurrentRevision: membershipRoot.length > 0 && membershipRoot.every((row) => text(row.workspace_revision) === workspaceRevision),
      manifestMembershipCountMatches: membershipRoot.length === manifestRows.length,
      exactCurrentSourceBridge: membershipRoot.length === manifestRows.length
        && membershipComparison.length > 0
        && membershipComparison.every((row) => row.qualified),
      bindingRowsAreCurrent: bindingRows.length > 0 && bindingComparison.every((row) => row.qualified),
    };
    const checks = report.identityChecks;
    report.status = checks.executionFound && checks.executionRevisionMatchesAdmission && checks.executionCompleted
      && checks.sourceSelectionCompleted && checks.membershipUsesCurrentRevision && checks.manifestMembershipCountMatches
      && checks.exactCurrentSourceBridge && checks.bindingRowsAreCurrent
      ? 'CURRENT_SOURCE_BRIDGE_EXACT_READ_ONLY'
      : 'CURRENT_SOURCE_BRIDGE_BLOCKED';
    report.nextGate = report.status === 'CURRENT_SOURCE_BRIDGE_EXACT_READ_ONLY'
      ? 'INDEPENDENT_SOURCE_BINDING_READBACK_AND_PACKET_MATERIALIZATION_AUDIT'
      : 'RESOLVE_EXECUTION_SOURCE_MEMBERSHIP_AND_WORKSPACE_BINDING_MISMATCHES';
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (error) {
  report.status = 'SOURCE_BRIDGE_AUDIT_ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const stable = { ...report, generatedAt: undefined, receiptChecksum: undefined };
report.receiptChecksum = digest(JSON.stringify(stable));
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  workspaceRevision,
  executionId,
  counts: report.counts,
  identityChecks: report.identityChecks ?? null,
  writesPerformed: false,
  canonicalAuthority: false,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
}, null, 2));
