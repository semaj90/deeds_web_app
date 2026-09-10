import { createHash } from 'node:crypto';

export type SnapshotSourceLikeV1 = Record<string, unknown>;
export type RepositoryMembershipRowLikeV1 = Record<string, unknown>;
export type GraphifyExecutionLikeV1 = Record<string, unknown>;
export type GraphifySourceSelectionStageLikeV1 = Record<string, unknown>;

export const REPOSITORY_MEMBERSHIP_LEGACY_CHECKSUM_CODEC_V1 =
  'SORTED_CONCAT_UTF8_NO_DELIMITER_V1' as const;
export const REPOSITORY_MEMBERSHIP_CANONICAL_DIAGNOSTIC_CHECKSUM_CODEC_V1 =
  'SORTED_TUPLE_JSON_UTF8_V1' as const;

const SHA256_REVISION_RE = /^sha256:[a-f0-9]{64}$/;
const field = (value: Record<string, unknown> | null | undefined, camel: string, snake: string): unknown =>
  value?.[camel] ?? value?.[snake] ?? null;

export function normalizeRepositoryPathV1(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

export function normalizeDigestV1(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace(/^sha256:/, '').toLowerCase();
}

interface IdentityObservationV1 {
  rowIndex: number;
  repositoryId: string;
  repositoryRelativePath: string;
  tupleKey: string;
  displayIdentity: string;
  writerIdentity: string;
  issues: string[];
  value: Record<string, unknown>;
}

export interface InvalidRepositoryIdentityRowV1 {
  rowIndex: number;
  repositoryId: string;
  repositoryRelativePath: string;
  issues: string[];
}

function observeRepositoryIdentityV1(
  value: Record<string, unknown>,
  rowIndex: number,
): IdentityObservationV1 {
  const rawRepositoryId = String(field(value, 'repositoryId', 'repository_id') ?? '');
  const rawRepositoryRelativePath = String(
    field(value, 'repositoryRelativePath', 'repository_relative_path') ?? '',
  );
  const repositoryId = rawRepositoryId.trim();
  const repositoryRelativePath = normalizeRepositoryPathV1(rawRepositoryRelativePath);
  const issues: string[] = [];

  if (!repositoryId) issues.push('MISSING_REPOSITORY_ID');
  if (!repositoryRelativePath) issues.push('MISSING_REPOSITORY_RELATIVE_PATH');
  if (rawRepositoryId !== repositoryId) issues.push('NON_CANONICAL_REPOSITORY_ID_WHITESPACE');
  if (rawRepositoryRelativePath !== repositoryRelativePath) {
    issues.push('NON_CANONICAL_REPOSITORY_RELATIVE_PATH');
  }
  if (
    repositoryRelativePath === '.'
    || repositoryRelativePath.split('/').some((segment) => segment === '..')
  ) {
    issues.push('UNSAFE_REPOSITORY_RELATIVE_PATH');
  }

  return {
    rowIndex,
    repositoryId,
    repositoryRelativePath,
    tupleKey: JSON.stringify([repositoryId, repositoryRelativePath]),
    displayIdentity: `${repositoryId}:${repositoryRelativePath}`,
    // This is intentionally the current writer's exact encoding. It is retained
    // only to verify existing SOURCE_SELECTION receipts, not proposed as a new
    // canonical checksum encoding.
    writerIdentity: `${rawRepositoryId}:${rawRepositoryRelativePath}`,
    issues,
    value,
  };
}

export function repositoryQualifiedIdentityV1(value: Record<string, unknown>): string {
  const observation = observeRepositoryIdentityV1(value, 0);
  if (observation.issues.length) {
    throw new Error(
      `REPOSITORY_QUALIFIED_IDENTITY_INVALID:${observation.issues.join(',')}`,
    );
  }
  return observation.displayIdentity;
}

/**
 * Compatibility checksum. Must stay byte-for-byte aligned with
 * graphify-daily-coordinator-v1.ts::computeSourceRefSetChecksum(). The v2
 * writer currently passes `${repositoryId}:${repositoryRelativePath}` strings
 * into that helper. This codec has no delimiter between sorted entries, so it
 * is NOT promoted as a canonical checksum format here.
 */
export function computeRepositoryIdentitySetChecksumV1(identities: readonly string[]): string {
  const digest = createHash('sha256');
  for (const identity of [...identities].sort()) digest.update(identity);
  return `sha256:${digest.digest('hex')}`;
}

/** Collision-resistant diagnostic checksum over explicit tuple boundaries. */
export function computeCanonicalRepositoryTupleChecksumV1(
  tuples: readonly (readonly [string, string])[],
): string {
  const canonical = [...tuples]
    .map(([repositoryId, repositoryRelativePath]) => [repositoryId, repositoryRelativePath] as const)
    .sort(([repoA, pathA], [repoB, pathB]) =>
      repoA < repoB ? -1 : repoA > repoB ? 1 : pathA < pathB ? -1 : pathA > pathB ? 1 : 0,
    );
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')}`;
}

function duplicateIdentities(observations: readonly IdentityObservationV1[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const observation of observations.filter((row) => row.issues.length === 0)) {
    if (seen.has(observation.tupleKey)) duplicates.add(observation.displayIdentity);
    else seen.add(observation.tupleKey);
  }
  return [...duplicates].sort();
}

function invalidRows(observations: readonly IdentityObservationV1[]): InvalidRepositoryIdentityRowV1[] {
  return observations
    .filter((row) => row.issues.length > 0)
    .map((row) => ({
      rowIndex: row.rowIndex,
      repositoryId: row.repositoryId,
      repositoryRelativePath: row.repositoryRelativePath,
      issues: row.issues,
    }));
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
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function executionIdOf(value: Record<string, unknown>): string | null {
  const raw = field(value, 'executionId', 'execution_id');
  return raw === null || raw === undefined || raw === '' ? null : String(raw);
}

export interface RepositoryMembershipDeltaV1 {
  executionId: string | null;
  executionStatus: string | null;
  executionWorkspaceRevision: string | null;
  executionCanonicalAuthority: boolean | null;
  snapshotRowCount: number;
  membershipRowCount: number;
  snapshotIdentityCount: number;
  membershipIdentityCount: number;
  matchedIdentityCount: number;
  missingInMembership: string[];
  extraInMembership: string[];
  invalidSnapshotIdentityRows: InvalidRepositoryIdentityRowV1[];
  invalidMembershipIdentityRows: InvalidRepositoryIdentityRowV1[];
  duplicateSnapshotIdentities: string[];
  duplicateMembershipIdentities: string[];
  membershipExecutionIdMismatches: string[];
  workspaceRevisionMismatches: string[];
  codeSourceRevisionMismatches: string[];
  contentHashMismatches: string[];
  byteLengthMismatches: string[];
  sourceRefAliasMismatches: Array<{
    identity: string;
    snapshotSourceRef: string;
    membershipSourceRef: string;
  }>;
  legacyMembershipChecksum: string;
  canonicalSnapshotChecksum: string;
  canonicalMembershipChecksum: string;
  canonicalChecksumMatch: boolean;
  sourceSelectionStageCount: number;
  sourceSelectionStagePresent: boolean;
  sourceSelectionStageCompleted: boolean;
  sourceSelectionStageExecutionIdMismatch: boolean;
  sourceSelectionOutputChecksum: string | null;
  sourceSelectionChecksumMatch: boolean;
  blockingIssueCodes: string[];
  eligibleExactNotAdmitted: boolean;
  eligibleExactAlreadyAdmitted: boolean;
}

export function compareRepositoryMembershipV1(input: {
  snapshotSources: readonly SnapshotSourceLikeV1[];
  membershipRows: readonly RepositoryMembershipRowLikeV1[];
  execution: GraphifyExecutionLikeV1;
  sourceSelectionStages: readonly GraphifySourceSelectionStageLikeV1[];
}): RepositoryMembershipDeltaV1 {
  const snapshotObservations = input.snapshotSources.map(observeRepositoryIdentityV1);
  const membershipObservations = input.membershipRows.map(observeRepositoryIdentityV1);
  const invalidSnapshotIdentityRows = invalidRows(snapshotObservations);
  const invalidMembershipIdentityRows = invalidRows(membershipObservations);
  const validSnapshot = snapshotObservations.filter((row) => row.issues.length === 0);
  const validMembership = membershipObservations.filter((row) => row.issues.length === 0);
  const duplicateSnapshotIdentities = duplicateIdentities(snapshotObservations);
  const duplicateMembershipIdentities = duplicateIdentities(membershipObservations);

  const snapshotByIdentity = new Map(validSnapshot.map((row) => [row.tupleKey, row]));
  const membershipByIdentity = new Map(validMembership.map((row) => [row.tupleKey, row]));
  const snapshotKeys = [...snapshotByIdentity.keys()].sort();
  const membershipKeys = [...membershipByIdentity.keys()].sort();
  const missingKeys = snapshotKeys.filter((key) => !membershipByIdentity.has(key));
  const extraKeys = membershipKeys.filter((key) => !snapshotByIdentity.has(key));
  const missingInMembership = missingKeys.map((key) => snapshotByIdentity.get(key)!.displayIdentity);
  const extraInMembership = extraKeys.map((key) => membershipByIdentity.get(key)!.displayIdentity);

  const executionId = executionIdOf(input.execution);
  const executionStatus = String(field(input.execution, 'status', 'status') ?? '') || null;
  const executionWorkspaceRevisionRaw = field(input.execution, 'workspaceRevision', 'workspace_revision');
  const executionWorkspaceRevision = executionWorkspaceRevisionRaw === null || executionWorkspaceRevisionRaw === undefined
    ? null
    : String(executionWorkspaceRevisionRaw);
  const canonicalAuthorityRaw = field(input.execution, 'canonicalAuthority', 'canonical_authority');
  const executionCanonicalAuthority = typeof canonicalAuthorityRaw === 'boolean' ? canonicalAuthorityRaw : null;

  const membershipExecutionIdMismatches = validMembership
    .filter((row) => executionIdOf(row.value) !== executionId)
    .map((row) => row.displayIdentity)
    .sort();
  const workspaceRevisionMismatches: string[] = [];
  const codeSourceRevisionMismatches: string[] = [];
  const contentHashMismatches: string[] = [];
  const byteLengthMismatches: string[] = [];
  const sourceRefAliasMismatches: RepositoryMembershipDeltaV1['sourceRefAliasMismatches'] = [];

  let matchedIdentityCount = 0;
  for (const key of snapshotKeys) {
    const sourceObservation = snapshotByIdentity.get(key)!;
    const rowObservation = membershipByIdentity.get(key);
    if (!rowObservation) continue;
    matchedIdentityCount += 1;
    const source = sourceObservation.value;
    const row = rowObservation.value;
    const identity = sourceObservation.displayIdentity;

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

    if (byteLength(row) !== byteLength(source)) byteLengthMismatches.push(identity);

    const snapshotSourceRef = normalizedSourceRef(source);
    const membershipSourceRef = normalizedSourceRef(row);
    if (snapshotSourceRef !== membershipSourceRef) {
      sourceRefAliasMismatches.push({ identity, snapshotSourceRef, membershipSourceRef });
    }
  }

  const legacyMembershipChecksum = computeRepositoryIdentitySetChecksumV1(
    membershipObservations.map((row) => row.writerIdentity),
  );
  const canonicalSnapshotChecksum = computeCanonicalRepositoryTupleChecksumV1(
    validSnapshot.map((row) => [row.repositoryId, row.repositoryRelativePath] as const),
  );
  const canonicalMembershipChecksum = computeCanonicalRepositoryTupleChecksumV1(
    validMembership.map((row) => [row.repositoryId, row.repositoryRelativePath] as const),
  );
  const canonicalChecksumMatch = canonicalSnapshotChecksum === canonicalMembershipChecksum;

  const sourceSelectionStageCount = input.sourceSelectionStages.length;
  const stage = sourceSelectionStageCount === 1 ? input.sourceSelectionStages[0] : null;
  const sourceSelectionStagePresent = sourceSelectionStageCount > 0;
  const stageStatusRaw = stage ? field(stage, 'status', 'status') : null;
  const sourceSelectionStageCompleted = stageStatusRaw === 'COMPLETED';
  const sourceSelectionStageExecutionIdMismatch = Boolean(
    stage && executionIdOf(stage) !== executionId,
  );
  const outputChecksumRaw = stage ? field(stage, 'outputChecksum', 'output_checksum') : null;
  const sourceSelectionOutputChecksum = outputChecksumRaw === null || outputChecksumRaw === undefined
    ? null
    : String(outputChecksumRaw);
  const sourceSelectionChecksumMatch = sourceSelectionStageCompleted
    && !sourceSelectionStageExecutionIdMismatch
    && sourceSelectionOutputChecksum === legacyMembershipChecksum;

  const blockingIssueCodes: string[] = [];
  if (!executionId) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXECUTION_ID_MISSING');
  if (!executionStatus || !['COMPLETED', 'COMPLETED_REUSED'].includes(executionStatus)) {
    blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXECUTION_NOT_TERMINAL_SUCCESS');
  }
  if (!executionWorkspaceRevision || !SHA256_REVISION_RE.test(executionWorkspaceRevision)) {
    blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXECUTION_WORKSPACE_REVISION_INVALID');
  }
  if (executionCanonicalAuthority === null) {
    blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXECUTION_AUTHORITY_UNKNOWN');
  }
  if (invalidSnapshotIdentityRows.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_INVALID_SNAPSHOT_IDENTITIES');
  if (invalidMembershipIdentityRows.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_INVALID_IDENTITIES');
  if (duplicateSnapshotIdentities.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_DUPLICATE_SNAPSHOT_IDENTITIES');
  if (duplicateMembershipIdentities.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_DUPLICATE_IDENTITIES');
  if (membershipExecutionIdMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXECUTION_ID_MISMATCH');
  if (missingInMembership.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_MISSING_ROWS');
  if (extraInMembership.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_EXTRA_ROWS');
  if (workspaceRevisionMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_WORKSPACE_REVISION_MISMATCH');
  if (codeSourceRevisionMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_REVISION_MISMATCH');
  if (contentHashMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_CONTENT_MISMATCH');
  if (byteLengthMismatches.length) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_BYTE_LENGTH_MISMATCH');
  if (!canonicalChecksumMatch) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_CANONICAL_SET_CHECKSUM_MISMATCH');
  if (!sourceSelectionStagePresent) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_STAGE_MISSING');
  else if (sourceSelectionStageCount > 1) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_MULTIPLE_SOURCE_SELECTION_STAGES');
  else if (sourceSelectionStageExecutionIdMismatch) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_EXECUTION_ID_MISMATCH');
  else if (!sourceSelectionStageCompleted) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_STAGE_INCOMPLETE');
  else if (!sourceSelectionChecksumMatch) blockingIssueCodes.push('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_CHECKSUM_MISMATCH');

  const structurallyExact = blockingIssueCodes.length === 0;
  return {
    executionId,
    executionStatus,
    executionWorkspaceRevision,
    executionCanonicalAuthority,
    snapshotRowCount: input.snapshotSources.length,
    membershipRowCount: input.membershipRows.length,
    snapshotIdentityCount: snapshotByIdentity.size,
    membershipIdentityCount: membershipByIdentity.size,
    matchedIdentityCount,
    missingInMembership,
    extraInMembership,
    invalidSnapshotIdentityRows,
    invalidMembershipIdentityRows,
    duplicateSnapshotIdentities,
    duplicateMembershipIdentities,
    membershipExecutionIdMismatches,
    workspaceRevisionMismatches,
    codeSourceRevisionMismatches,
    contentHashMismatches,
    byteLengthMismatches,
    sourceRefAliasMismatches,
    legacyMembershipChecksum,
    canonicalSnapshotChecksum,
    canonicalMembershipChecksum,
    canonicalChecksumMatch,
    sourceSelectionStageCount,
    sourceSelectionStagePresent,
    sourceSelectionStageCompleted,
    sourceSelectionStageExecutionIdMismatch,
    sourceSelectionOutputChecksum,
    sourceSelectionChecksumMatch,
    blockingIssueCodes,
    eligibleExactNotAdmitted: structurallyExact && executionCanonicalAuthority === false,
    eligibleExactAlreadyAdmitted: structurallyExact && executionCanonicalAuthority === true,
  };
}
