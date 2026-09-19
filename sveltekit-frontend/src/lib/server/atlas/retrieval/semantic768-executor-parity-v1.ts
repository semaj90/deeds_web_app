import { SEMANTIC768_DIMENSION, SEMANTIC768_REPRESENTATION_ID } from './semantic768-identity-manifest-v1.js';

export type Semantic768ExecutorIdentityV1 = {
  executor: string;
  representationId: typeof SEMANTIC768_REPRESENTATION_ID;
  representationRevision: string;
  dimension: typeof SEMANTIC768_DIMENSION;
  rowCount: number;
  identityManifestChecksum: string;
  matrixChecksum: string;
  canonicalAuthority?: false;
  writesPerformed?: false;
};

export type Semantic768ExecutorParityReceiptV1 = {
  schema: 'atlas.semantic768-executor-parity.v1';
  executors: [string, string];
  representationId: typeof SEMANTIC768_REPRESENTATION_ID;
  representationRevision: string;
  dimension: typeof SEMANTIC768_DIMENSION;
  rowCount: number;
  identityManifestChecksum: string;
  matrixChecksum: string;
  sameIdentityManifest: true;
  sameMatrix: true;
  canonicalAuthority: false;
  writesPerformed: false;
};

export function normalizeQdrantSemantic768ReceiptV1(receipt: {
  representationId: string;
  representationRevision: string;
  dimension: number;
  returnedPacketKeys: number;
  identityManifestChecksum: string | null;
  matrixChecksum: string | null;
  manifestStatus: string;
}): Semantic768ExecutorIdentityV1 {
  if (receipt.manifestStatus !== 'PROVEN_FOR_RETURNED_PROJECTION') {
    throw new Error(`SEMANTIC768_PARITY_QDRANT_MANIFEST_STATUS:${receipt.manifestStatus}`);
  }
  if (!receipt.identityManifestChecksum || !receipt.matrixChecksum) {
    throw new Error('SEMANTIC768_PARITY_QDRANT_CHECKSUM_REQUIRED');
  }
  return {
    executor: 'qdrant',
    representationId: receipt.representationId as typeof SEMANTIC768_REPRESENTATION_ID,
    representationRevision: receipt.representationRevision,
    dimension: receipt.dimension as typeof SEMANTIC768_DIMENSION,
    rowCount: receipt.returnedPacketKeys,
    identityManifestChecksum: receipt.identityManifestChecksum,
    matrixChecksum: receipt.matrixChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function normalizeCuvsSemantic768ReceiptV1(receipt: {
  representationId: string;
  representationRevision: string;
  dimension: number;
  corpusRows: number;
  identityManifestChecksum: string;
  matrixChecksum: string;
}): Semantic768ExecutorIdentityV1 {
  return {
    executor: 'cuvs.brute_force',
    representationId: receipt.representationId as typeof SEMANTIC768_REPRESENTATION_ID,
    representationRevision: receipt.representationRevision,
    dimension: receipt.dimension as typeof SEMANTIC768_DIMENSION,
    rowCount: receipt.corpusRows,
    identityManifestChecksum: receipt.identityManifestChecksum,
    matrixChecksum: receipt.matrixChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function requireChecksum(value: string, field: string): void {
  if (!value?.trim()) throw new Error(`SEMANTIC768_PARITY_${field.toUpperCase()}_REQUIRED`);
}

export function assertSemantic768ExecutorParityV1(
  left: Semantic768ExecutorIdentityV1,
  right: Semantic768ExecutorIdentityV1,
): Semantic768ExecutorParityReceiptV1 {
  for (const envelope of [left, right]) {
    if (envelope.representationId !== SEMANTIC768_REPRESENTATION_ID) {
      throw new Error(`SEMANTIC768_PARITY_REPRESENTATION_REQUIRED:${envelope.executor}`);
    }
    if (envelope.dimension !== SEMANTIC768_DIMENSION) {
      throw new Error(`SEMANTIC768_PARITY_DIMENSION:${envelope.executor}`);
    }
    if (!envelope.representationRevision?.trim()) {
      throw new Error(`SEMANTIC768_PARITY_REVISION_REQUIRED:${envelope.executor}`);
    }
    if (!Number.isInteger(envelope.rowCount) || envelope.rowCount < 1) {
      throw new Error(`SEMANTIC768_PARITY_ROW_COUNT:${envelope.executor}`);
    }
    requireChecksum(envelope.identityManifestChecksum, 'IDENTITY_MANIFEST_CHECKSUM');
    requireChecksum(envelope.matrixChecksum, 'MATRIX_CHECKSUM');
    if (envelope.canonicalAuthority === true || envelope.writesPerformed === true) {
      throw new Error(`SEMANTIC768_PARITY_MUTATION_POLICY:${envelope.executor}`);
    }
  }
  if (left.representationRevision !== right.representationRevision) throw new Error('SEMANTIC768_PARITY_REVISION_MISMATCH');
  if (left.rowCount !== right.rowCount) throw new Error('SEMANTIC768_PARITY_ROW_COUNT_MISMATCH');
  if (left.identityManifestChecksum !== right.identityManifestChecksum) throw new Error('SEMANTIC768_PARITY_IDENTITY_MANIFEST_MISMATCH');
  if (left.matrixChecksum !== right.matrixChecksum) throw new Error('SEMANTIC768_PARITY_MATRIX_MISMATCH');
  return {
    schema: 'atlas.semantic768-executor-parity.v1',
    executors: [left.executor, right.executor],
    representationId: SEMANTIC768_REPRESENTATION_ID,
    representationRevision: left.representationRevision,
    dimension: SEMANTIC768_DIMENSION,
    rowCount: left.rowCount,
    identityManifestChecksum: left.identityManifestChecksum,
    matrixChecksum: left.matrixChecksum,
    sameIdentityManifest: true,
    sameMatrix: true,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
