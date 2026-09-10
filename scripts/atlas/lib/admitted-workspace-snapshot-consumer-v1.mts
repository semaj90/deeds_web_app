import { createHash } from 'node:crypto';
import {
  computeCanonicalRepositoryTupleChecksumV1,
  computeRepositoryIdentitySetChecksumV1,
  normalizeRepositoryPathV1,
} from './graphify-repository-membership-delta-v1.mts';

const SHA256_REVISION_RE = /^sha256:[a-f0-9]{64}$/i;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

export interface AdmittedSnapshotSourceBindingV1 {
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  codeSourceRevision: string;
  contentHash: string;
  byteLength: number;
}

export interface AdmittedSnapshotConsumptionPlanV1 {
  schema: 'atlas.admitted-workspace-snapshot-consumption-plan.v1';
  status:
    | 'ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED'
    | 'ADMITTED_SNAPSHOT_CONSUMPTION_READY_AUTHORIZED'
    | 'ADMITTED_SNAPSHOT_CONSUMPTION_BLOCKED';
  authority: false;
  canonicalAuthority: false;
  writesPerformed: false;
  executionAuthorizedByAdmission: boolean;
  projectionWritesAuthorized: boolean;
  workspaceId: string | null;
  workspaceRevision: string | null;
  snapshotRevision: string | null;
  sourceCount: number;
  repositoryCount: number;
  admissionRepositoryCount: number | null;
  admissionSourceSelectionChecksum: string | null;
  snapshotMembershipChecksum: string | null;
  coordinatorSourceSelectionChecksum: string | null;
  canonicalTupleChecksum: string | null;
  materializedPathCount: number;
  duplicateMaterializedPaths: string[];
  bindings: AdmittedSnapshotSourceBindingV1[];
  blockers: string[];
  firstBlockingInvariant: string | null;
}

function jsonHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function materializedPath(value: unknown): string {
  return normalizeRepositoryPathV1(value);
}

function duplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates].sort();
}

/**
 * Validates only the sealed manifest/admission contract. It deliberately does
 * NOT re-read the live workspace; materialized byte readback belongs to the
 * caller so a frozen admitted world cannot be invalidated by later live edits.
 */
export function buildAdmittedSnapshotConsumptionPlanV1(input: {
  admission: Record<string, unknown>;
  snapshot: Record<string, unknown>;
}): AdmittedSnapshotConsumptionPlanV1 {
  const { admission, snapshot } = input;
  const blockers: string[] = [];
  const sources = Array.isArray(snapshot.sources)
    ? snapshot.sources.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
    : [];
  const repositories = Array.isArray(snapshot.repositories)
    ? snapshot.repositories.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
    : [];

  const workspaceId = cleanString(snapshot.workspaceId) || null;
  const workspaceRevision = cleanString(admission.workspaceRevision) || null;
  const snapshotRevision = cleanString(snapshot.snapshotRevision) || null;
  const admissionSnapshotRevision = cleanString(admission.snapshotRevision) || null;
  const admissionSourceCount = Number(admission.sourceCount);
  const admissionRepositoryCountRaw = Number(admission.repositoryCount);
  const admissionRepositoryCount = Number.isInteger(admissionRepositoryCountRaw)
    ? admissionRepositoryCountRaw
    : null;
  const admissionSourceSelectionChecksum = cleanString(admission.sourceSelectionChecksum) || null;
  const snapshotMembershipChecksum = cleanString(snapshot.sourceMembershipChecksum) || null;
  const executionAuthorizedByAdmission = admission.graphifyExecutionAuthorized === true;
  const projectionWritesAuthorized = admission.projectionWritesAuthorized === true;

  if (admission.schema !== 'atlas.workspace-revision-tournament-admission.v1') blockers.push('ADMISSION_SCHEMA_INVALID');
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED') blockers.push('ADMISSION_STATUS_NOT_ADMITTED');
  if (admission.authority !== true) blockers.push('ADMISSION_AUTHORITY_FALSE');
  if (!workspaceRevision || !SHA256_REVISION_RE.test(workspaceRevision)) blockers.push('ADMITTED_WORKSPACE_REVISION_INVALID');
  if (!snapshotRevision || !SHA256_REVISION_RE.test(snapshotRevision)) blockers.push('SNAPSHOT_REVISION_INVALID');
  if (snapshotRevision !== admissionSnapshotRevision) blockers.push('ADMISSION_SNAPSHOT_REVISION_MISMATCH');
  if (snapshot.schema !== 'atlas.workspace-source-snapshot-capture.v1') blockers.push('SNAPSHOT_SCHEMA_INVALID');
  if (snapshot.status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK') blockers.push('SNAPSHOT_CAPTURE_STATUS_INVALID');
  if (snapshot.canonicalAuthority !== false || snapshot.datastoreWritesPerformed !== false) blockers.push('SNAPSHOT_UNEXPECTED_AUTHORITY_CLAIM');
  if (!workspaceId) blockers.push('SNAPSHOT_WORKSPACE_ID_MISSING');
  if (sources.length === 0) blockers.push('SNAPSHOT_SOURCE_MANIFEST_EMPTY');
  if (!Number.isInteger(admissionSourceCount) || admissionSourceCount !== sources.length) blockers.push('ADMISSION_SOURCE_COUNT_MISMATCH');
  if (admissionRepositoryCount !== null && admissionRepositoryCount !== repositories.length) blockers.push('ADMISSION_REPOSITORY_COUNT_MISMATCH');

  const identityKeys: string[] = [];
  const materializedPaths: string[] = [];
  const tuples: Array<readonly [string, string]> = [];
  const bindings: AdmittedSnapshotSourceBindingV1[] = [];

  for (const [index, source] of sources.entries()) {
    const repositoryId = cleanString(source.repositoryId);
    const repositoryRelativePath = materializedPath(source.repositoryRelativePath);
    const sourceRef = materializedPath(source.sourceRef);
    const sourceIdentityKey = cleanString(source.sourceIdentityKey);
    const sourceRevision = cleanString(source.sourceRevision);
    const contentDigest = cleanString(source.contentDigest).toLowerCase().replace(/^sha256:/, '');
    const byteLength = Number(source.byteLength);
    const expectedIdentity = repositoryId && repositoryRelativePath
      ? `${repositoryId}:${repositoryRelativePath}`
      : '';

    if (!repositoryId) blockers.push(`SOURCE_${index}_REPOSITORY_ID_MISSING`);
    if (!repositoryRelativePath || repositoryRelativePath.split('/').includes('..')) blockers.push(`SOURCE_${index}_REPOSITORY_RELATIVE_PATH_INVALID`);
    if (!sourceRef || sourceRef.split('/').includes('..')) blockers.push(`SOURCE_${index}_SOURCE_REF_INVALID`);
    if (!expectedIdentity || sourceIdentityKey !== expectedIdentity) blockers.push(`SOURCE_${index}_IDENTITY_KEY_MISMATCH`);
    if (!SHA256_REVISION_RE.test(sourceRevision)) blockers.push(`SOURCE_${index}_REVISION_INVALID`);
    if (!SHA256_HEX_RE.test(contentDigest) || sourceRevision !== `sha256:${contentDigest}`) blockers.push(`SOURCE_${index}_CONTENT_REVISION_MISMATCH`);
    if (!Number.isInteger(byteLength) || byteLength < 0) blockers.push(`SOURCE_${index}_BYTE_LENGTH_INVALID`);

    if (expectedIdentity) identityKeys.push(expectedIdentity);
    if (sourceRef) materializedPaths.push(sourceRef);
    if (repositoryId && repositoryRelativePath) tuples.push([repositoryId, repositoryRelativePath]);
    if (
      repositoryId && repositoryRelativePath && sourceRef
      && SHA256_REVISION_RE.test(sourceRevision) && SHA256_HEX_RE.test(contentDigest)
      && Number.isInteger(byteLength) && byteLength >= 0
    ) {
      bindings.push({
        repositoryId,
        repositoryRelativePath,
        sourceRef,
        codeSourceRevision: sourceRevision,
        contentHash: contentDigest,
        byteLength,
      });
    }
  }

  const duplicateIdentityKeys = duplicateStrings(identityKeys);
  if (duplicateIdentityKeys.length) blockers.push('DUPLICATE_REPOSITORY_QUALIFIED_SOURCE_IDENTITY');
  const duplicateMaterializedPaths = duplicateStrings(materializedPaths);
  if (duplicateMaterializedPaths.length) blockers.push('DUPLICATE_MATERIALIZED_SOURCE_PATH');

  const computedSnapshotMembershipChecksum = identityKeys.length
    ? jsonHash([...identityKeys].sort())
    : null;
  if (!snapshotMembershipChecksum || computedSnapshotMembershipChecksum !== snapshotMembershipChecksum) {
    blockers.push('SNAPSHOT_MEMBERSHIP_CHECKSUM_MISMATCH');
  }
  if (!admissionSourceSelectionChecksum || admissionSourceSelectionChecksum !== snapshotMembershipChecksum) {
    blockers.push('ADMISSION_SOURCE_SELECTION_CHECKSUM_MISMATCH');
  }

  const coordinatorSourceSelectionChecksum = identityKeys.length
    ? computeRepositoryIdentitySetChecksumV1(identityKeys)
    : null;
  const canonicalTupleChecksum = tuples.length
    ? computeCanonicalRepositoryTupleChecksumV1(tuples)
    : null;

  // Recompute snapshotRevision without touching live origin bytes. This matches
  // sealSnapshot(): snapshotRevision = hash(body) where these metadata fields
  // are excluded from the body.
  const {
    schema: _schema,
    snapshotRevision: _snapshotRevision,
    workspaceRevision: _workspaceRevision,
    status: _status,
    canonicalAuthority: _canonicalAuthority,
    datastoreWritesPerformed: _datastoreWritesPerformed,
    ...snapshotBody
  } = snapshot;
  if (snapshotRevision && jsonHash(snapshotBody) !== snapshotRevision) blockers.push('SNAPSHOT_MANIFEST_CHECKSUM_MISMATCH');

  const uniqueBlockers = [...new Set(blockers)];
  return {
    schema: 'atlas.admitted-workspace-snapshot-consumption-plan.v1',
    status: uniqueBlockers.length
      ? 'ADMITTED_SNAPSHOT_CONSUMPTION_BLOCKED'
      : executionAuthorizedByAdmission
        ? 'ADMITTED_SNAPSHOT_CONSUMPTION_READY_AUTHORIZED'
        : 'ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED',
    authority: false,
    canonicalAuthority: false,
    writesPerformed: false,
    executionAuthorizedByAdmission,
    projectionWritesAuthorized,
    workspaceId,
    workspaceRevision,
    snapshotRevision,
    sourceCount: sources.length,
    repositoryCount: repositories.length,
    admissionRepositoryCount,
    admissionSourceSelectionChecksum,
    snapshotMembershipChecksum,
    coordinatorSourceSelectionChecksum,
    canonicalTupleChecksum,
    materializedPathCount: new Set(materializedPaths).size,
    duplicateMaterializedPaths,
    bindings,
    blockers: uniqueBlockers,
    firstBlockingInvariant: uniqueBlockers[0] ?? null,
  };
}
