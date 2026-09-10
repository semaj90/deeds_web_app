import { createHash } from 'node:crypto';

export type SnapshotSourceLikeV1 = Record<string, unknown>;
export type RepositoryMembershipRowLikeV1 = Record<string, unknown>;
export type GraphifyExecutionLikeV1 = Record<string, unknown>;
export type GraphifySourceSelectionStageLikeV1 = Record<string, unknown> | null;

const field = (value: Record<string, unknown> | null | undefined, camel: string, snake: string): unknown =>
  value?.[camel] ?? value?.[snake] ?? null;

export function normalizeRepositoryPathV1(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .trim();
}

export function normalizeDigestV1(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace(/^sha256:/, '').toLowerCase();
}

export function repositoryQualifiedIdentityV1(value: Record<string, unknown>): string {
  const repositoryId = normalizeRepositoryPathV1(field(value, 'repositoryId', 'repository_id'));
  const repositoryRelativePath = normalizeRepositoryPathV1(
    field(value, 'repositoryRelativePath', 'repository_relative_path'),
  );
  if (!repositoryId || !repositoryRelativePath) {
    throw new Error('REPOSITORY_QUALIFIED_IDENTITY_REQUIRES_REPOSITORY_ID_AND_RELATIVE_PATH');
  }
  return `${repositoryId}:${repositoryRelativePath}`;
}

/**
 * Must stay byte-for-byte aligned with graphify-daily-coordinator-v1.ts::
 * computeSourceRefSetChecksum(). The v2 writer passes repository-qualified
 * identity strings into that existing checksum helper.
 */
export function computeRepositoryIdentitySetChecksumV1(identities: readonly string[]): string {
  const digest = createHash('sha256');
  for (const identity of [...identities].sort()) digest.update(identity);
  return `sha256:${digest.digest('hex')}`;
}

function duplicateIdentities(values: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const identity = repositoryQualifiedIdentityV1(value);
    if (seen.has(identity)) duplicates.add(identity);
    else seen.add(identity);
  }
  return [...duplicates].sort();
}

function normalizedSourceRef(value: Record<string, unknown>): string {
  return normalizeRepositoryPathV1(field(value, 'sourceRef', 'source_ref'));
}

function sourceRevision(value: Record<string, unknown>): string | null {
  const raw = field(value, 'sourceRevision', 'source_revision');
  return raw === null || raw === undefined || raw === '' ? null : String(raw);
}

function codeSourceRevision(value: Record<string, unknown>): string | null {
  const raw = field(value, 'codeSourceRevision', 'code_source_revision')
    ?? field(value, 'sourceRevision', 'source_revision');
  return raw === null || raw === undefined || raw === '' ? null : String(raw);
}

function byteLength(value: Record<string, unknown>): number | null {
  const raw = field(value, 'byteLength', 'byte_length');
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface RepositoryMembershipDeltaV1 {
  executionId: string | null;
  executionStatus: string | null;
  executionWorkspaceRevision: string | null;
  snapshotIdentityCount: number;
  membershipIdentityCount: number;
  exactIdentityMatches: number;
  missingInMembership: string[];
  extraInMembership: string[];
  duplicateSnapshotIdentities: string[];
  duplicateMembershipIdentities: string[];
  workspaceRevisionMismatches: string[];
  codeSourceRevisionMismatches: string[];
  contentHashMismatches: string[];
  byteLengthMismatches: string[];
  sourceRefAliasMismatches: Array<{
    identity: string;
    snapshotSourceRef: string;
    membershipSourceRef: string;
  }>;
  computedMembershipChecksum: string;
  sourceSelectionStagePresent: boolean;
  sourceSelectionStageCompleted: boolean;
  sourceSelectionOutputChecksum: string | null;
  sourceSelectionChecksumMatch: boolean;
  blockingIssueCodes: string[];
  eligibleExactNotAdmitted: boolean;
}

export function compareRepositoryMembershipV1(input: {
  snapshotSources: readonly SnapshotSourceLikeV1[];
  membershipRows: readonly RepositoryMembershipRowLikeV1[];
  execution: GraphifyExecutionLikeV1;
  sourceSelectionStage: GraphifySourceSelectionStageLikeV1;
}): RepositoryMembershipDeltaV1 {
  const duplicateSnapshotIdentities = duplicateIdentities(input.snapshotSources);
  const duplicateMembershipIdentities = duplicateIdentities(input.membershipRows);

  const snapshotByIdentity = new Map(
    input.snapshotSources.map((source) => [repositoryQualifiedIdentityV1(source), source]),
  );
  const membershipByIdentity = new Map(
    input.membershipRows.map((row) => [repositoryQualifiedIdentityV1(row), row]),
  );

  const snapshotIdentities = [...snapshotByIdentity.keys()].sort();
  const membershipIdentities = [...membershipByIdentity.keys()].sort();
  const missingInMembership = snapshotIdentities.filter((identity) => !membershipByIdentity.has(identity));
  const extraInMembership = membershipIdentities.filter((identity) => !snapshotByIdentity.has(identity));

  const workspaceRevisionMismatches: string[] = [];
  const codeSourceRevisionMismatches: string[] = [];
  const contentHashMismatches: string[] = [];
  const byteLengthMismatches: string[] = [];
  const sourceRefAliasMismatches: RepositoryMembershipDeltaV1['sourceRefAliasMismatches'] = [];

  const executionWorkspaceRevisionRaw = field(input.execution, 'workspaceRevision', 'workspace_revision');
  const executionWorkspaceRevision = executionWorkspaceRevisionRaw === null || executionWorkspaceRevisionRaw === undefined
    ? null
    : String(executionWorkspaceRevisionRaw);

  let exactIdentityMatches = 0;
  for (const identity of snapshotIdentities) {
    const source = snapshotByIdentity.get(identity)!;
    const row = membershipByIdentity.get(identity);
    if (!row) continue;
    exactIdentityMatches += 1;

    const rowWorkspaceRevisionRaw = field(row, 'workspaceRevision', 'workspace_revision');
    const rowWorkspaceRevision = rowWorkspaceRevisionRaw === null || rowWorkspaceRevisionRaw === undefined
      ? null
      : String(rowWorkspaceRevisionRaw);
    if (!executionWorkspaceRevision || rowWorkspaceRevision !== executionWorkspaceRevision) {
      workspaceRevisionMismatches.push(identity);
    }

    if (codeSourceRevision(row) !== sourceRevision(source)) {
      codeSourceRevisionMismatches.push(identity);
    }

    const snapshotDigest = normalizeDigestV1(field(source, 'contentDigest', 'content_digest'));
    const membershipDigest = normalizeDigestV1(field(row, 'contentHash', 'content_hash'));
    if (!snapshotDigest || membershipDigest !== snapshotDigest) {
      contentHashMismatches.push(identity);
    }

    if (byteLength(row) !== byteLength(source)) {
      byteLengthMismatches.push(identity);
    }

    const snapshotSourceRef = normalizedSourceRef(source);
    const membershipSourceRef = normalizedSourceRef(row);
    if (snapshotSourceRef !== membershipSourceRef) {
      sourceRefAliasMismatches.push({ identity, snapshotSourceRef, membershipSourceRef });
    }
  }

  const computedMembershipChecksum = computeRepositoryIdentitySetChecksumV1(membershipIdentities);
  const stage = input.sourceSelectionStage;
  const sourceSelectionStagePresent = Boolean(stage);
  const stageStatusRaw = stage ? field(stage, 'status', 'status') : null;
  const sourceSelectionStageCompleted = stageStatusRaw === 'COMPLETED';
  const outputChecksumRaw = stage ? field(stage, 'outputChecksum', 'output_checksum') : null;
  const sourceSelectionOutputChecksum = outputChecksumRaw === null || outputChecksumRaw === undefined
    ? null
    : String(outputChecksumRaw);
  const sourceSelectionChecksumMatch = sourceSelectionStageCompleted
    && sourceSelectionOutputChecksum === computedMembershipChecksum;

  const blockingIssueCodes: string[] = [];
  if (duplicateSnapshotIdentities.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_DUPLICATE_SNAPSHOT_IDENTITIES');
  if (duplicateMembershipIdentities.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_DUPLICATE_IDENTITIES');
  if (missingInMembership.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_MISSING_ROWS');
  if (extraInMembership.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXTRA_ROWS');
  if (workspaceRevisionMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_WORKSPACE_REVISION_MISMATCH');
  if (codeSourceRevisionMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_REVISION_MISMATCH');
  if (contentHashMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_CONTENT_MISMATCH');
  if (byteLengthMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_BYTE_LENGTH_MISMATCH');
  if (!sourceSelectionStagePresent) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_STAGE_MISSING');
  else if (!sourceSelectionStageCompleted) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_STAGE_INCOMPLETE');
  else if (!sourceSelectionChecksumMatch) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_CHECKSUM_MISMATCH');

  return {
    executionId: String(field(input.execution, 'executionId', 'execution_id') ?? '') || null,
    executionStatus: String(field(input.execution, 'status', 'status') ?? '') || null,
    executionWorkspaceRevision,
    snapshotIdentityCount: snapshotIdentities.length,
    membershipIdentityCount: membershipIdentities.length,
    exactIdentityMatches,
    missingInMembership,
    extraInMembership,
    duplicateSnapshotIdentities,
    duplicateMembershipIdentities,
    workspaceRevisionMismatches,
    codeSourceRevisionMismatches,
    contentHashMismatches,
    byteLengthMismatches,
    // Diagnostic only: repository-qualified identity wins. A different source_ref
    // spelling/alias is visible but does not by itself invalidate the identity.
    sourceRefAliasMismatches,
    computedMembershipChecksum,
    sourceSelectionStagePresent,
    sourceSelectionStageCompleted,
    sourceSelectionOutputChecksum,
    sourceSelectionChecksumMatch,
    blockingIssueCodes,
    eligibleExactNotAdmitted: blockingIssueCodes.length === 0,
  };
}
