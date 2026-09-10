import path from 'node:path';

const SHA256_REVISION_RE = /^sha256:[a-f0-9]{64}$/i;
const ALLOWED_KEYS = new Set([
  'workspaceRevision',
  'snapshotRevision',
  'materializedRoot',
  'sourceCount',
  'repositoryCount',
  'sourceCohortChecksum',
  'selectionChecksum',
  'admissionReceiptRef',
]);

export interface GraphifySnapshotExecutionInputV1 {
  workspaceRevision: string;
  snapshotRevision: string;
  materializedRoot: string;
  sourceCount: number;
  repositoryCount: number;
  sourceCohortChecksum: string;
  selectionChecksum: string;
  admissionReceiptRef: string;
}

export interface GraphifySnapshotExecutionInputValidationV1 {
  valid: boolean;
  input: GraphifySnapshotExecutionInputV1 | null;
  blockers: string[];
  firstBlockingInvariant: string | null;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRelativeReceiptRef(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
}

/**
 * Snapshot mode deliberately has no HEAD/repositoryRevision/liveRoot field.
 * Unknown fields fail closed so a caller cannot smuggle live-origin discovery
 * inputs into this contract.
 */
export function validateGraphifySnapshotExecutionInputV1(
  value: Record<string, unknown>,
): GraphifySnapshotExecutionInputValidationV1 {
  const blockers: string[] = [];
  const unknownKeys = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length) blockers.push(`SNAPSHOT_EXECUTION_INPUT_UNKNOWN_FIELDS:${unknownKeys.sort().join(',')}`);

  const workspaceRevision = clean(value.workspaceRevision);
  const snapshotRevision = clean(value.snapshotRevision);
  const materializedRoot = clean(value.materializedRoot);
  const sourceCohortChecksum = clean(value.sourceCohortChecksum);
  const selectionChecksum = clean(value.selectionChecksum);
  const admissionReceiptRef = clean(value.admissionReceiptRef).replaceAll('\\', '/');
  const sourceCount = Number(value.sourceCount);
  const repositoryCount = Number(value.repositoryCount);

  if (!SHA256_REVISION_RE.test(workspaceRevision)) blockers.push('SNAPSHOT_EXECUTION_WORKSPACE_REVISION_INVALID');
  if (!SHA256_REVISION_RE.test(snapshotRevision)) blockers.push('SNAPSHOT_EXECUTION_SNAPSHOT_REVISION_INVALID');
  if (!SHA256_REVISION_RE.test(sourceCohortChecksum)) blockers.push('SNAPSHOT_EXECUTION_SOURCE_COHORT_CHECKSUM_INVALID');
  if (!SHA256_REVISION_RE.test(selectionChecksum)) blockers.push('SNAPSHOT_EXECUTION_SELECTION_CHECKSUM_INVALID');
  if (!path.isAbsolute(materializedRoot)) blockers.push('SNAPSHOT_EXECUTION_MATERIALIZED_ROOT_NOT_ABSOLUTE');
  if (!Number.isInteger(sourceCount) || sourceCount <= 0) blockers.push('SNAPSHOT_EXECUTION_SOURCE_COUNT_INVALID');
  if (!Number.isInteger(repositoryCount) || repositoryCount <= 0) blockers.push('SNAPSHOT_EXECUTION_REPOSITORY_COUNT_INVALID');
  if (!isRelativeReceiptRef(admissionReceiptRef)) blockers.push('SNAPSHOT_EXECUTION_ADMISSION_RECEIPT_REF_INVALID');

  if (SHA256_REVISION_RE.test(snapshotRevision) && path.isAbsolute(materializedRoot)) {
    const expectedLeaf = snapshotRevision.slice('sha256:'.length).toLowerCase();
    if (path.basename(path.normalize(materializedRoot)).toLowerCase() !== expectedLeaf) {
      blockers.push('SNAPSHOT_EXECUTION_MATERIALIZED_ROOT_NOT_REVISION_ADDRESSED');
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    valid: uniqueBlockers.length === 0,
    input: uniqueBlockers.length ? null : {
      workspaceRevision,
      snapshotRevision,
      materializedRoot: path.resolve(materializedRoot),
      sourceCount,
      repositoryCount,
      sourceCohortChecksum,
      selectionChecksum,
      admissionReceiptRef,
    },
    blockers: uniqueBlockers,
    firstBlockingInvariant: uniqueBlockers[0] ?? null,
  };
}

export const GRAPHIFY_SNAPSHOT_EXECUTION_INPUT_V1 = 'atlas.graphify-snapshot-execution-input.v1' as const;
export const GRAPHIFY_SNAPSHOT_EXECUTION_FORBIDDEN_LIVE_FIELDS_V1 = [
  'workspaceRoot',
  'liveRoot',
  'repositoryRevision',
  'head',
  'gitHead',
  'discoverRepositories',
  'inventoryBuilder',
] as const;
