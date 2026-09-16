#!/usr/bin/env node
/**
 * GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02 (read-only owner plan)
 *
 * Classifies terminal executions that match the admitted immutable snapshot.
 * This deliberately does not update graphify_executions or relabel a run.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const admissionPath = path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const reportPath = path.join(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const jsonSha256 = (value) => sha256(JSON.stringify(value));
const sortedConcatChecksum = (values) => sha256([...values].sort().join(''));

const admission = JSON.parse(await fs.readFile(admissionPath, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
}
const manifestPath = path.resolve(root, admission.manifestPath ?? '');
if (!manifestPath || manifestPath === root) throw new Error('ADMITTED_SNAPSHOT_MANIFEST_REQUIRED');
const snapshot = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (snapshot.snapshotRevision !== admission.snapshotRevision
  || snapshot.status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
  || snapshot.canonicalAuthority !== false
  || snapshot.datastoreWritesPerformed !== false
  || !Array.isArray(snapshot.sources)) {
  throw new Error('ADMITTED_SNAPSHOT_MANIFEST_INVALID');
}

const expectedRefs = snapshot.sources.map((source) => String(source.sourceRef));
const expectedRefChecksum = sortedConcatChecksum(expectedRefs);
const expectedIdentityChecksum = sortedConcatChecksum(snapshot.sources.map((source) => String(source.sourceIdentityKey)));
const expectedContentChecksum = jsonSha256(snapshot.sources.map((source) => [
  source.sourceIdentityKey,
  source.sourceRevision,
  source.byteLength,
]));
const expectedByRef = new Map(snapshot.sources.map((source) => [String(source.sourceRef), source]));

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  query_timeout: 120000,
  lock_timeout: 5000,
  statement_timeout: 120000,
  application_name: 'atlas-current-graphify-execution-owner-resolution-v1',
});
let candidates = [];
let readError = null;
let client = null;
try {
  client = await pool.connect();
  // Keep the execution, stage, and immutable-membership reads on one stable
  // database snapshot. A sequence of READ COMMITTED statements could compare
  // different committed frames and manufacture an apparent owner difference.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const executions = await client.query(`
    SELECT execution_id::text, workspace_id::text, workspace_revision, status,
           canonical_authority, trigger_kind, started_at, completed_at
      FROM public.graphify_executions
     WHERE workspace_revision = $1
       AND status IN ('COMPLETED', 'COMPLETED_REUSED')
     ORDER BY completed_at NULLS LAST, execution_id
  `, [admission.workspaceRevision]);

  for (const execution of executions.rows) {
    const stageResult = await client.query(`
      SELECT stage, status, output_checksum, receipt_ref
        FROM public.graphify_execution_stages
       WHERE execution_id = $1
       ORDER BY stage
    `, [execution.execution_id]);
    const sourceStage = stageResult.rows.find((stage) => stage.stage === 'SOURCE_SELECTION') ?? null;
    const inventoryStage = stageResult.rows.find((stage) => stage.stage === 'INVENTORY') ?? null;
    const memberResult = await client.query(`
      SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
        FROM public.graphify_execution_file_membership_v2
       WHERE execution_id = $1
       ORDER BY source_ref
    `, [execution.execution_id]);
    const members = memberResult.rows;
    const memberByRef = new Map(members.map((member) => [String(member.source_ref), member]));
    const sourceRefChecksum = sortedConcatChecksum(members.map((member) => String(member.source_ref)));
    const identityChecksum = sortedConcatChecksum(snapshot.sources.map((source) => String(source.sourceIdentityKey)));
    const contentChecksum = jsonSha256(snapshot.sources.map((source) => {
      const member = memberByRef.get(String(source.sourceRef));
      return [source.sourceIdentityKey, member?.code_source_revision, Number(member?.byte_length)];
    }));
    const sourceMembershipExact = members.length === snapshot.sources.length
      && members.every((member) => {
        const source = expectedByRef.get(String(member.source_ref));
        return source
          && member.workspace_revision === admission.workspaceRevision
          && member.code_source_revision === source.sourceRevision
          && String(member.content_hash).replace(/^sha256:/, '') === String(source.contentDigest)
          && Number(member.byte_length) === Number(source.byteLength);
      });
    const signature = JSON.stringify({
      workspaceRevision: execution.workspace_revision,
      sourceStageChecksum: sourceStage?.output_checksum ?? null,
      sourceStageReceipt: sourceStage?.receipt_ref ?? null,
      inventoryStageChecksum: inventoryStage?.output_checksum ?? null,
      sourceRefChecksum,
      identityChecksum,
      contentChecksum,
      sourceMembershipExact,
    });
    candidates.push({
      ...execution,
      membershipSource: 'GRAPHIFY_EXECUTION_FILE_MEMBERSHIP_V2',
      stageCount: stageResult.rows.length,
      sourceCount: members.length,
      sourceStage,
      inventoryStage,
      sourceRefChecksum,
      expectedRefChecksum,
      identityChecksum,
      expectedIdentityChecksum,
      contentChecksum,
      expectedContentChecksum,
      sourceMembershipExact,
      signature,
    });
  }
} catch (error) {
  readError = {
    code: error?.code ?? null,
    name: error?.name ?? 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
} finally {
  if (client) {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
  await pool.end();
}

const signatures = new Set(candidates.map((candidate) => candidate.signature));
const equivalent = candidates.length > 1 && signatures.size === 1 && candidates.every((candidate) => candidate.sourceMembershipExact);
// Stable report ordering is presentation only. Do not turn completion time or
// UUID ordering into canonical execution authority: equivalent executions
// require an explicit lifecycle decision.
const ordered = [...candidates].sort((a, b) => a.execution_id.localeCompare(b.execution_id));
const report = {
  schema: 'atlas.current-graphify-execution-owner-resolution.v1',
  gate: 'GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02',
  mode: 'READ_ONLY_PLAN',
  transaction: 'REPEATABLE_READ_READ_ONLY_ROLLBACK',
  admittedWorkspaceRevision: admission.workspaceRevision,
  admittedSnapshotRevision: admission.snapshotRevision,
  manifestPath,
  expectedSourceCount: snapshot.sources.length,
  expectedRefChecksum,
  expectedIdentityChecksum,
  expectedContentChecksum,
  readError,
  candidates: candidates.map(({ signature: _signature, ...candidate }) => candidate),
  equivalence: {
    candidateCount: candidates.length,
    distinctEvidenceSignatures: signatures.size,
    allEquivalent: equivalent,
  },
  recommendation: equivalent
    ? {
        type: 'EQUIVALENT_EXECUTIONS_REQUIRE_EXPLICIT_AUTHORITY',
        candidateExecutionIds: ordered.map((candidate) => candidate.execution_id),
        policy: 'NO_IMPLICIT_TIMESTAMP_OR_ID_SELECTION',
        requiresExplicitAuthorityDecision: true,
      }
    : null,
  status: readError
    ? 'DATABASE_READ_UNAVAILABLE'
    : equivalent
    ? 'DUPLICATE_EQUIVALENT_EXECUTIONS'
    : candidates.length === 1 && candidates[0]?.sourceMembershipExact
      ? 'SINGLE_CURRENT_EXECUTION_CANDIDATE'
      : candidates.length === 0
        ? 'NO_TERMINAL_EXECUTION_FOR_ADMITTED_REVISION'
        : 'EXECUTION_EVIDENCE_NOT_EQUIVALENT',
  safeToApply: false,
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: readError
    ? 'RETRY_READ_ONLY_GRAPHIFY_EXECUTION_OWNER_AUDIT'
    : equivalent ? 'EXPLICIT_GRAPHIFY_EXECUTION_OWNER_DECISION' : 'CURRENT_GRAPHIFY_EXECUTION_RECONCILIATION',
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.${process.pid}.tmp`;
await fs.writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.rename(tempPath, reportPath);
console.log(JSON.stringify({
  status: report.status,
  candidateCount: candidates.length,
  distinctEvidenceSignatures: signatures.size,
  preferredExecutionId: null,
  candidateExecutionIds: report.recommendation?.candidateExecutionIds ?? null,
  safeToApply: false,
  writesPerformed: false,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
}, null, 2));
