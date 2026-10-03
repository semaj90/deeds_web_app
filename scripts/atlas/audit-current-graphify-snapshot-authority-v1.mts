#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';
import { resolveCurrentWorkspaceFrameV1 } from './lib/current-workspace-frame-selector-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const producerRevision = 'atlas.current-graphify-snapshot-authority.v2';
const authorityPath = resolve(ROOT, 'docs/reports/current-graphify-snapshot-authority-v1.json');
const selectionPath = resolve(ROOT, 'docs/reports/current-source-selection-input-v1.json');
const planPath = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const digest = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const stableSourceRefChecksum = (refs: string[]) => digest([...refs].sort().join(''));
const normalize = (value: unknown) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
const bindingKey = (repositoryId: unknown, repositoryRelativePath: unknown) => `${normalize(repositoryId)}:${normalize(repositoryRelativePath)}`;

const frame = resolveCurrentWorkspaceFrameV1({ root: ROOT });
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const manifestPath = frame.manifestPath ?? (typeof plan.manifestPath === 'string' ? resolve(ROOT, plan.manifestPath) : null);
const snapshot = manifestPath ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
const materializedRoot = snapshot?.snapshotRevision
  ? resolve(ROOT, '.tmp', 'workspace-source-snapshots', String(snapshot.snapshotRevision).replace(/^sha256:/, ''))
  : null;
const snapshotReadback = snapshot
  ? validateSnapshot(snapshot, materializedRoot && existsSync(materializedRoot) ? { sourceReadRoot: materializedRoot } : undefined)
  : null;

const expectedWorkspaceRevision = frame.selectedWorkspaceRevision;
const expectedSnapshotRevision = frame.selectedSnapshotRevision ?? snapshot?.snapshotRevision ?? null;
const expectedBindings = Array.isArray(plan.bindings) ? plan.bindings : [];
const expectedByIdentity = new Map(expectedBindings.map((binding: any) => [bindingKey(binding.repositoryId, binding.repositoryRelativePath), binding]));
const expectedSourceCount = expectedBindings.length;
const expectedSourceRefSetChecksum = stableSourceRefChecksum(expectedBindings.map((binding: any) => `${normalize(binding.repositoryId)}:${normalize(binding.repositoryRelativePath)}`));

const client = new Client({ connectionString: databaseUrl, statement_timeout: 120_000 });
const authorityCandidates: Array<Record<string, unknown>> = [];
let databaseSnapshot: string | null = null;
let databaseError: string | null = null;
try {
  if (frame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED' || !expectedWorkspaceRevision) {
    throw new Error(frame.blockers[0] ?? 'CURRENT_WORKSPACE_FRAME_UNRESOLVED');
  }
  if (!snapshot || snapshotReadback?.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN') {
    throw new Error('EXPLICIT_OR_PLAN_SNAPSHOT_READBACK_NOT_PROVEN');
  }
  if (snapshot.snapshotRevision !== expectedSnapshotRevision) {
    throw new Error('SNAPSHOT_REVISION_SELECTOR_MISMATCH');
  }
  if (plan.status !== 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED'
    && plan.status !== 'SOURCE_SELECTION_PLAN_READY') {
    throw new Error('SOURCE_SELECTION_PLAN_NOT_READY');
  }
  if (expectedSourceCount === 0) throw new Error('SOURCE_SELECTION_PLAN_EMPTY');

  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  databaseSnapshot = (await client.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0]?.snapshot ?? null;

  const executions = await client.query(
    `SELECT execution_id::text, workspace_id::text, workspace_revision::text, status,
            canonical_authority, started_at, completed_at, trigger_kind
       FROM public.graphify_executions
      WHERE workspace_revision::text = $1
        AND status IN ('COMPLETED', 'COMPLETED_REUSED')
      ORDER BY execution_id`,
    [expectedWorkspaceRevision],
  );

  for (const execution of executions.rows) {
    const stageResult = await client.query(
      `SELECT status, output_checksum, receipt_ref
         FROM public.graphify_execution_stages
        WHERE execution_id = $1 AND stage = 'SOURCE_SELECTION'`,
      [execution.execution_id],
    );
    const stage = stageResult.rows[0] ?? null;

    const members = (await client.query(
      `SELECT repository_id::text, repository_relative_path::text, source_ref::text,
              workspace_revision::text, code_source_revision::text, content_hash::text, byte_length
         FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1
        ORDER BY repository_id, repository_relative_path`,
      [execution.execution_id],
    )).rows;

    const memberIdentities = members.map((row) => bindingKey(row.repository_id, row.repository_relative_path));
    const sourceRefSetChecksum = stableSourceRefChecksum(memberIdentities);
    const duplicateMembershipKeys = memberIdentities.length - new Set(memberIdentities).size;
    const sourceCountMatches = members.length === expectedSourceCount;
    const workspaceRevisionMatches = members.every((row) => row.workspace_revision === expectedWorkspaceRevision);
    const sourceBindingsMatch = members.every((row) => {
      const expected = expectedByIdentity.get(bindingKey(row.repository_id, row.repository_relative_path));
      return Boolean(expected)
        && normalize(row.source_ref) === normalize((expected as any).sourceRef)
        && row.code_source_revision === (expected as any).codeSourceRevision
        && String(row.content_hash).replace(/^sha256:/, '') === String((expected as any).contentHash).replace(/^sha256:/, '')
        && Number(row.byte_length) === Number((expected as any).byteLength);
    });
    const membershipSetMatches = sourceRefSetChecksum === expectedSourceRefSetChecksum;
    const sourceSelectionChecksumMatches = !plan.sourceSelectionChecksum
      || stage?.output_checksum === plan.sourceSelectionChecksum
      || stage?.output_checksum === sourceRefSetChecksum;
    const selectionPolicyIsNonCanary = typeof stage?.receipt_ref === 'string' && !/canary|bounded/i.test(stage.receipt_ref);
    const eligible = stage?.status === 'COMPLETED'
      && Boolean(stage.output_checksum)
      && Boolean(stage.receipt_ref)
      && selectionPolicyIsNonCanary
      && duplicateMembershipKeys === 0
      && workspaceRevisionMatches
      && sourceCountMatches
      && sourceBindingsMatch
      && membershipSetMatches
      && sourceSelectionChecksumMatches;

    authorityCandidates.push({
      executionId: execution.execution_id,
      status: execution.status,
      canonicalAuthority: execution.canonical_authority,
      triggerKind: execution.trigger_kind,
      sourceSelectionStatus: stage?.status ?? null,
      selectionPolicyRevision: stage?.receipt_ref ?? null,
      selectionPolicyIsNonCanary,
      sourceSelectionOutputChecksum: stage?.output_checksum ?? null,
      expectedSourceSelectionChecksum: plan.sourceSelectionChecksum ?? null,
      sourceRefSetChecksum,
      expectedSourceRefSetChecksum,
      sourceCount: members.length,
      expectedSourceCount,
      duplicateMembershipKeys,
      workspaceRevisionMatches,
      sourceCountMatches,
      sourceBindingsMatch,
      membershipSetMatches,
      sourceSelectionChecksumMatches,
      eligible,
      members,
    });
  }

  await client.query('ROLLBACK');
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
  try { await client.query('ROLLBACK'); } catch {}
} finally {
  await client.end().catch(() => undefined);
}

const eligible = authorityCandidates.filter((candidate) => candidate.eligible === true);
let sourceStatus = 'CURRENT_WORKSPACE_NOT_GRAPHIFIED';
if (databaseError) sourceStatus = 'SNAPSHOT_AUTHORITY_AUDIT_FAILED';
else if (authorityCandidates.length === 0) sourceStatus = 'NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE';
else if (eligible.length > 1) sourceStatus = 'AMBIGUOUS_QUALIFYING_EXECUTIONS';
else if (eligible.length === 1) sourceStatus = 'CURRENT_SNAPSHOT_PROVEN';
else if (authorityCandidates.some((candidate) => candidate.sourceSelectionStatus !== 'COMPLETED' || candidate.selectionPolicyIsNonCanary === false)) sourceStatus = 'SOURCE_SELECTION_INCOMPLETE';
else if (authorityCandidates.some((candidate) => candidate.duplicateMembershipKeys !== 0)) sourceStatus = 'DUPLICATE_EXECUTION_MEMBERSHIP';
else if (authorityCandidates.some((candidate) => candidate.sourceCountMatches === false)) sourceStatus = 'SOURCE_COUNT_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.membershipSetMatches === false)) sourceStatus = 'SOURCE_SET_CHECKSUM_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.sourceBindingsMatch === false)) sourceStatus = 'SOURCE_BINDING_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.sourceSelectionChecksumMatches === false)) sourceStatus = 'SOURCE_SELECTION_CHECKSUM_MISMATCH';

const selected = eligible.length === 1 ? eligible[0] : null;
const authorityReport = {
  schema: 'atlas.current-graphify-snapshot-authority.v2',
  status: sourceStatus,
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPEATABLE_READ_IMMUTABLE_FRAME_AUDIT',
  frameSelector: frame,
  databaseSnapshot,
  databaseError,
  sourceSnapshot: {
    manifestPath,
    snapshotRevision: expectedSnapshotRevision,
    workspaceRevision: expectedWorkspaceRevision,
    sourceInventoryRevision: plan.sourceInventoryRevision ?? null,
    sourceInventoryChecksum: plan.sourceInventoryChecksum ?? null,
    sourceSelectionChecksum: plan.sourceSelectionChecksum ?? null,
    sourceCount: expectedSourceCount,
    snapshotReadback,
  },
  qualifyingExecutionIds: eligible.map((candidate) => candidate.executionId),
  candidates: authorityCandidates.map(({ members: _members, ...candidate }) => candidate),
  graphSnapshot: {
    status: authorityCandidates.some((candidate) => candidate.canonicalAuthority === true)
      ? 'GRAPH_CANONICAL_AUTHORITY_PROVEN'
      : 'GRAPH_CANONICAL_AUTHORITY_UNPROVEN',
    canonicalAuthorityTrueExecutions: authorityCandidates.filter((candidate) => candidate.canonicalAuthority === true).length,
  },
  canonicalAuthority: false,
  readOnly: true,
  writesPerformed: false,
  producerRevision,
};

const selectionReport = {
  schema: 'atlas.current-source-selection-input.v2',
  status: selected ? 'CURRENT_SNAPSHOT_PROVEN' : 'NOT_EMITTED_SNAPSHOT_NOT_PROVEN',
  executionId: selected?.executionId ?? null,
  workspaceRevision: expectedWorkspaceRevision,
  snapshotRevision: expectedSnapshotRevision,
  sourceInventoryRevision: plan.sourceInventoryRevision ?? null,
  sourceInventoryChecksum: plan.sourceInventoryChecksum ?? null,
  sourceSelectionChecksum: plan.sourceSelectionChecksum ?? null,
  sourceCount: selected?.sourceCount ?? 0,
  bindings: selected?.members ?? [],
  canonicalAuthority: false,
  readOnly: true,
  writesPerformed: false,
  downstreamPlannerInput: selected ? 'revision-qualified packet/chunk lineage reconciliation' : null,
};

await mkdir(resolve(ROOT, 'docs/reports'), { recursive: true });
for (const [target, value] of [[authorityPath, authorityReport], [selectionPath, selectionReport]] as const) {
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}
console.log(JSON.stringify({
  status: sourceStatus,
  workspaceRevision: expectedWorkspaceRevision,
  workspaceRevisionSource: frame.selectedSource,
  snapshotRevision: expectedSnapshotRevision,
  sourceCount: expectedSourceCount,
  qualifyingExecutions: eligible.length,
  databaseSnapshot,
  databaseError,
  reports: [authorityPath, selectionPath],
}, null, 2));
if (sourceStatus !== 'CURRENT_SNAPSHOT_PROVEN') process.exitCode = 3;
