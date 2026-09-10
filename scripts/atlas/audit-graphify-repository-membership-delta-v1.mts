#!/usr/bin/env node

/**
 * GRAPHIFY-REPOSITORY-MEMBERSHIP-DELTA-01
 * Read-only comparison of one sealed WorkspaceSnapshotV1 against
 * public.graphify_execution_file_membership_v2.
 * Legacy graphify_execution_files rows are diagnostic-only and never unioned
 * into the proof set. This audit never assigns workspaceRevision or authority.
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';
import {
  compareRepositoryMembershipV1,
  REPOSITORY_MEMBERSHIP_CANONICAL_DIAGNOSTIC_CHECKSUM_CODEC_V1,
  REPOSITORY_MEMBERSHIP_LEGACY_CHECKSUM_CODEC_V1,
} from './lib/graphify-repository-membership-delta-v1.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-repository-membership-delta-v1.json');
const TERMINAL = ['COMPLETED', 'COMPLETED_REUSED'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_SAMPLE_LIMIT = 100;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function latestManifest(): Promise<string> {
  const directory = resolve(ROOT, 'docs/reports/workspace-source-snapshots');
  const names = (await readdir(directory)).filter((name) => extname(name) === '.json');
  const entries = await Promise.all(names.map(async (name) => ({
    name,
    mtime: (await stat(resolve(directory, name))).mtimeMs,
  })));
  const latest = entries.sort((a, b) => b.mtime - a.mtime)[0];
  if (!latest) throw new Error('NO_WORKSPACE_SNAPSHOT_MANIFEST');
  return resolve(directory, latest.name);
}

function rowsByExecution(rows: Array<Record<string, unknown>>): Map<string, Array<Record<string, unknown>>> {
  const result = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const executionId = String(row.execution_id ?? '');
    if (!executionId) continue;
    const list = result.get(executionId) ?? [];
    list.push(row);
    result.set(executionId, list);
  }
  return result;
}

function legacyCountByExecution(rows: Array<Record<string, unknown>>): Map<string, number> {
  return new Map(rows.map((row) => [String(row.execution_id), Number(row.row_count ?? 0)]));
}

function issueWeight(comparison: ReturnType<typeof compareRepositoryMembershipV1>): number {
  return comparison.blockingIssueCodes.length * 1_000_000
    + comparison.missingInMembership.length
    + comparison.extraInMembership.length
    + comparison.invalidSnapshotIdentityRows.length
    + comparison.invalidMembershipIdentityRows.length
    + comparison.duplicateSnapshotIdentities.length
    + comparison.duplicateMembershipIdentities.length
    + comparison.membershipExecutionIdMismatches.length
    + comparison.workspaceRevisionMismatches.length
    + comparison.codeSourceRevisionMismatches.length
    + comparison.contentHashMismatches.length
    + comparison.byteLengthMismatches.length;
}

function topStatusFromClosest(comparison: ReturnType<typeof compareRepositoryMembershipV1> | null): string {
  if (!comparison) return 'REPOSITORY_MEMBERSHIP_NO_TERMINAL_EXECUTION';
  const issues = new Set(comparison.blockingIssueCodes);
  for (const status of [
    'REPOSITORY_MEMBERSHIP_EXECUTION_ID_MISSING',
    'REPOSITORY_MEMBERSHIP_EXECUTION_NOT_TERMINAL_SUCCESS',
    'REPOSITORY_MEMBERSHIP_EXECUTION_WORKSPACE_REVISION_INVALID',
    'REPOSITORY_MEMBERSHIP_EXECUTION_AUTHORITY_UNKNOWN',
    'REPOSITORY_MEMBERSHIP_INVALID_SNAPSHOT_IDENTITIES',
    'REPOSITORY_MEMBERSHIP_INVALID_IDENTITIES',
    'REPOSITORY_MEMBERSHIP_DUPLICATE_SNAPSHOT_IDENTITIES',
    'REPOSITORY_MEMBERSHIP_DUPLICATE_IDENTITIES',
    'REPOSITORY_MEMBERSHIP_EXECUTION_ID_MISMATCH',
    'REPOSITORY_MEMBERSHIP_MISSING_ROWS',
    'REPOSITORY_MEMBERSHIP_EXTRA_ROWS',
    'REPOSITORY_MEMBERSHIP_WORKSPACE_REVISION_MISMATCH',
    'REPOSITORY_MEMBERSHIP_SOURCE_REVISION_MISMATCH',
    'REPOSITORY_MEMBERSHIP_CONTENT_MISMATCH',
    'REPOSITORY_MEMBERSHIP_BYTE_LENGTH_MISMATCH',
    'REPOSITORY_MEMBERSHIP_CANONICAL_SET_CHECKSUM_MISMATCH',
    'REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_STAGE_MISSING',
    'REPOSITORY_MEMBERSHIP_MULTIPLE_SOURCE_SELECTION_STAGES',
    'REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_EXECUTION_ID_MISMATCH',
    'REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_STAGE_INCOMPLETE',
    'REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_CHECKSUM_MISMATCH',
  ]) {
    if (issues.has(status)) return status;
  }
  return 'REPOSITORY_MEMBERSHIP_BLOCKED_UNCLASSIFIED';
}

function bounded<T>(values: readonly T[]) {
  return { count: values.length, sample: values.slice(0, EVIDENCE_SAMPLE_LIMIT), truncated: values.length > EVIDENCE_SAMPLE_LIMIT };
}

function compactComparison(comparison: ReturnType<typeof compareRepositoryMembershipV1> & {
  legacyDiagnosticRowCount: number;
  legacyRowsParticipatedInProof: boolean;
}) {
  return {
    executionId: comparison.executionId,
    executionStatus: comparison.executionStatus,
    executionWorkspaceRevision: comparison.executionWorkspaceRevision,
    executionCanonicalAuthority: comparison.executionCanonicalAuthority,
    snapshotRowCount: comparison.snapshotRowCount,
    membershipRowCount: comparison.membershipRowCount,
    snapshotIdentityCount: comparison.snapshotIdentityCount,
    membershipIdentityCount: comparison.membershipIdentityCount,
    matchedIdentityCount: comparison.matchedIdentityCount,
    missingInMembership: bounded(comparison.missingInMembership),
    extraInMembership: bounded(comparison.extraInMembership),
    invalidSnapshotIdentityRows: bounded(comparison.invalidSnapshotIdentityRows),
    invalidMembershipIdentityRows: bounded(comparison.invalidMembershipIdentityRows),
    duplicateSnapshotIdentities: bounded(comparison.duplicateSnapshotIdentities),
    duplicateMembershipIdentities: bounded(comparison.duplicateMembershipIdentities),
    membershipExecutionIdMismatches: bounded(comparison.membershipExecutionIdMismatches),
    workspaceRevisionMismatches: bounded(comparison.workspaceRevisionMismatches),
    codeSourceRevisionMismatches: bounded(comparison.codeSourceRevisionMismatches),
    contentHashMismatches: bounded(comparison.contentHashMismatches),
    byteLengthMismatches: bounded(comparison.byteLengthMismatches),
    sourceRefAliasMismatches: bounded(comparison.sourceRefAliasMismatches),
    checksumEvidence: {
      legacyCodec: REPOSITORY_MEMBERSHIP_LEGACY_CHECKSUM_CODEC_V1,
      legacyMembershipChecksum: comparison.legacyMembershipChecksum,
      sourceSelectionOutputChecksum: comparison.sourceSelectionOutputChecksum,
      sourceSelectionChecksumMatch: comparison.sourceSelectionChecksumMatch,
      canonicalDiagnosticCodec: REPOSITORY_MEMBERSHIP_CANONICAL_DIAGNOSTIC_CHECKSUM_CODEC_V1,
      canonicalSnapshotChecksum: comparison.canonicalSnapshotChecksum,
      canonicalMembershipChecksum: comparison.canonicalMembershipChecksum,
      canonicalChecksumMatch: comparison.canonicalChecksumMatch,
    },
    sourceSelectionStageCount: comparison.sourceSelectionStageCount,
    sourceSelectionStagePresent: comparison.sourceSelectionStagePresent,
    sourceSelectionStageCompleted: comparison.sourceSelectionStageCompleted,
    sourceSelectionStageExecutionIdMismatch: comparison.sourceSelectionStageExecutionIdMismatch,
    blockingIssueCodes: comparison.blockingIssueCodes,
    eligibleExactNotAdmitted: comparison.eligibleExactNotAdmitted,
    eligibleExactAlreadyAdmitted: comparison.eligibleExactAlreadyAdmitted,
    legacyDiagnosticRowCount: comparison.legacyDiagnosticRowCount,
    legacyRowsParticipatedInProof: comparison.legacyRowsParticipatedInProof,
  };
}

const manifestPath = resolve(ROOT, arg('--manifest') ?? process.argv[2] ?? await latestManifest());
const snapshot = JSON.parse(await readFile(manifestPath, 'utf8'));
const snapshotReadback = validateSnapshot(snapshot);
const snapshotSources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
const workspaceId = arg('--workspace-id') ?? snapshot.workspaceId ?? null;

let databaseError: string | null = null;
let schema: Record<string, string[]> = {};
let executions: Array<Record<string, unknown>> = [];
let membershipRows: Array<Record<string, unknown>> = [];
let sourceSelectionStages: Array<Record<string, unknown>> = [];
let legacyCounts: Array<Record<string, unknown>> = [];

if (!workspaceId || !UUID_RE.test(String(workspaceId))) {
  databaseError = 'WORKSPACE_ID_UNAVAILABLE_OR_NOT_UUID';
} else {
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
    max: 1,
    statement_timeout: 120000,
  });
  try {
    const tableNames = [
      'graphify_executions',
      'graphify_execution_file_membership_v2',
      'graphify_execution_files',
      'graphify_execution_stages',
    ];
    const columns = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [tableNames],
    );
    for (const row of columns.rows) (schema[row.table_name] ??= []).push(row.column_name);

    if (!schema.graphify_executions?.length) throw new Error('GRAPHIFY_EXECUTIONS_TABLE_UNAVAILABLE');
    if (!schema.graphify_execution_file_membership_v2?.length) throw new Error('GRAPHIFY_EXECUTION_FILE_MEMBERSHIP_V2_TABLE_UNAVAILABLE');
    if (!schema.graphify_execution_stages?.length) throw new Error('GRAPHIFY_EXECUTION_STAGES_TABLE_UNAVAILABLE');

    executions = (await pool.query(
      `SELECT execution_id, workspace_id, workspace_revision, status, completed_at, canonical_authority
         FROM public.graphify_executions
        WHERE workspace_id = $1::uuid AND status = ANY($2::text[])
        ORDER BY completed_at DESC NULLS LAST, execution_id`,
      [workspaceId, TERMINAL],
    )).rows;

    const executionIds = executions.map((row) => row.execution_id);
    if (executionIds.length) {
      membershipRows = (await pool.query(
        `SELECT execution_id, repository_id, repository_relative_path, source_ref,
                workspace_revision, code_source_revision, content_hash, byte_length
           FROM public.graphify_execution_file_membership_v2
          WHERE execution_id = ANY($1::uuid[])
          ORDER BY execution_id, repository_id, repository_relative_path`,
        [executionIds],
      )).rows;

      sourceSelectionStages = (await pool.query(
        `SELECT execution_id, stage, status, output_checksum, receipt_ref, completed_at
           FROM public.graphify_execution_stages
          WHERE execution_id = ANY($1::uuid[]) AND stage = 'SOURCE_SELECTION'
          ORDER BY execution_id, completed_at DESC NULLS LAST`,
        [executionIds],
      )).rows;

      if (schema.graphify_execution_files?.length) {
        legacyCounts = (await pool.query(
          `SELECT execution_id, count(*)::bigint AS row_count
             FROM public.graphify_execution_files
            WHERE execution_id = ANY($1::uuid[])
            GROUP BY execution_id ORDER BY execution_id`,
          [executionIds],
        )).rows;
      }
    }
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  } finally {
    await pool.end();
  }
}

const membershipByExecution = rowsByExecution(membershipRows);
const stagesByExecution = rowsByExecution(sourceSelectionStages);
const legacyMap = legacyCountByExecution(legacyCounts);

const comparisons = executions.map((execution) => {
  const executionId = String(execution.execution_id);
  const delta = compareRepositoryMembershipV1({
    snapshotSources,
    membershipRows: membershipByExecution.get(executionId) ?? [],
    execution,
    sourceSelectionStages: stagesByExecution.get(executionId) ?? [],
  });
  return {
    ...delta,
    legacyDiagnosticRowCount: legacyMap.get(executionId) ?? 0,
    legacyRowsParticipatedInProof: false,
  };
});

const exactNotAdmitted = comparisons.filter((row) => row.eligibleExactNotAdmitted);
const exactAlreadyAdmitted = comparisons.filter((row) => row.eligibleExactAlreadyAdmitted);
const closest = [...comparisons].sort((a, b) => issueWeight(a) - issueWeight(b))[0] ?? null;

const status = databaseError
  ? 'REPOSITORY_MEMBERSHIP_SCHEMA_OR_DATABASE_UNAVAILABLE'
  : snapshotReadback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN'
    ? 'REPOSITORY_MEMBERSHIP_SNAPSHOT_READBACK_BLOCKED'
    : executions.length === 0
      ? 'REPOSITORY_MEMBERSHIP_NO_TERMINAL_EXECUTION'
      : exactAlreadyAdmitted.length > 0
        ? 'REPOSITORY_MEMBERSHIP_EXACT_MATCH_ALREADY_ADMITTED'
        : exactNotAdmitted.length === 1
          ? 'REPOSITORY_MEMBERSHIP_EXACT_MATCH_NOT_ADMITTED'
          : exactNotAdmitted.length > 1
            ? 'REPOSITORY_MEMBERSHIP_MULTIPLE_EXACT_EXECUTIONS'
            : topStatusFromClosest(closest);

const nextGate = status === 'REPOSITORY_MEMBERSHIP_EXACT_MATCH_NOT_ADMITTED'
  ? 'GRAPHIFY-SNAPSHOT-CONSUMPTION-AUTHORIZATION-01'
  : status === 'REPOSITORY_MEMBERSHIP_EXACT_MATCH_ALREADY_ADMITTED'
    ? 'VERIFY_EXISTING_WORKSPACE_REVISION_AUTHORITY'
    : status === 'REPOSITORY_MEMBERSHIP_SNAPSHOT_READBACK_BLOCKED'
      ? 'SNAPSHOT_BYTES_READBACK_PROVEN'
      : 'REPAIR_CURRENT_REPOSITORY_MEMBERSHIP_BLOCKER';

const safeNextCommand = status === 'REPOSITORY_MEMBERSHIP_EXACT_MATCH_NOT_ADMITTED'
  ? 'npm run atlas:graphify:source-selection:plan'
  : 'npm run atlas:graphify:snapshot-binding:audit';

const report = {
  schema: 'atlas.graphify-repository-membership-delta.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_AUDIT',
  status,
  proofLevel: status.startsWith('REPOSITORY_MEMBERSHIP_EXACT_MATCH_') ? 'PARTIAL_PROVEN' : 'BLOCKED',
  canonicalAuthority: false,
  authority: false,
  workspaceRevision: null,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  graphWritesPerformed: false,
  qdrantWritesPerformed: false,
  cacheWritesPerformed: false,
  modelWritesPerformed: false,
  evidenceSampleLimit: EVIDENCE_SAMPLE_LIMIT,
  membershipOwner: 'public.graphify_execution_file_membership_v2',
  membershipIdentity: ['repository_id', 'repository_relative_path'],
  legacyMembership: {
    table: 'public.graphify_execution_files',
    mode: 'DIAGNOSTIC_ONLY_NOT_UNIONED',
    participatesInProof: false,
  },
  checksumPolicy: {
    currentSourceSelectionReceiptCodec: REPOSITORY_MEMBERSHIP_LEGACY_CHECKSUM_CODEC_V1,
    currentSourceSelectionReceiptCompatibilityOnly: true,
    collisionResistantDiagnosticCodec: REPOSITORY_MEMBERSHIP_CANONICAL_DIAGNOSTIC_CHECKSUM_CODEC_V1,
    writerSemanticsChanged: false,
  },
  manifestPath,
  snapshotRevision: snapshot.snapshotRevision ?? null,
  snapshotReadback,
  workspaceId,
  databaseError,
  schema,
  snapshotSourceCount: snapshotSources.length,
  terminalExecutionCount: executions.length,
  exactNotAdmittedExecutionCount: exactNotAdmitted.length,
  exactNotAdmittedExecutionIds: exactNotAdmitted.map((row) => row.executionId),
  exactAlreadyAdmittedExecutionCount: exactAlreadyAdmitted.length,
  exactAlreadyAdmittedExecutionIds: exactAlreadyAdmitted.map((row) => row.executionId),
  closestExecutionId: closest?.executionId ?? null,
  comparisons: comparisons.map(compactComparison),
  invariants: {
    sourceRefIsNotMembershipIdentity: true,
    executorIdsAreNotCanonicalIdentity: true,
    legacyRowsNeverUnionedIntoV2Proof: true,
    sourceRefAliasMismatchIsDiagnosticOnly: true,
    duplicateSourceSelectionStagesFailClosed: true,
    malformedMembershipRowsFailClosed: true,
    noRevisionSynthesized: true,
    noAuthorityPromotedByAudit: true,
  },
  nextGate,
  safeNextCommand,
  producerRevision: 'atlas.graphify-repository-membership-delta.v1',
};

await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status,
  proofLevel: report.proofLevel,
  membershipOwner: report.membershipOwner,
  snapshotReadback: snapshotReadback.status,
  snapshotSourceCount: snapshotSources.length,
  terminalExecutionCount: executions.length,
  exactNotAdmittedExecutionCount: exactNotAdmitted.length,
  exactAlreadyAdmittedExecutionCount: exactAlreadyAdmitted.length,
  closestExecutionId: report.closestExecutionId,
  databaseError,
  nextGate,
  safeNextCommand,
  writesPerformed: false,
  reportPath: REPORT,
}, null, 2));

if (!['REPOSITORY_MEMBERSHIP_EXACT_MATCH_NOT_ADMITTED', 'REPOSITORY_MEMBERSHIP_EXACT_MATCH_ALREADY_ADMITTED'].includes(status)) {
  process.exitCode = 3;
}
