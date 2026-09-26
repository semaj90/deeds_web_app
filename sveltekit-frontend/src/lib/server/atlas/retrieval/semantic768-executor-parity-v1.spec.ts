import { describe, expect, it } from 'vitest';
import {
  assertSemantic768ExecutorParityV1,
  normalizeCuvsSemantic768ReceiptV1,
  normalizeQdrantSemantic768ReceiptV1,
} from './semantic768-executor-parity-v1.js';

const base = (executor: string) => ({
  executor,
  representationId: 'semantic_768' as const,
  representationRevision: 'semantic_768:r1',
  dimension: 768 as const,
  rowCount: 2,
  identityManifestChecksum: 'sha256:' + '1'.repeat(64),
  matrixChecksum: 'sha256:' + '2'.repeat(64),
  canonicalAuthority: false as const,
  writesPerformed: false as const,
});

describe('semantic768 executor parity', () => {
  it('accepts matching Qdrant and cuVS identity/matrix envelopes', () => {
    const receipt = assertSemantic768ExecutorParityV1(base('qdrant'), base('cuvs_exact'));
    expect(receipt.sameIdentityManifest).toBe(true);
    expect(receipt.sameMatrix).toBe(true);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('rejects representation, revision, row, identity, and matrix mismatches', () => {
    expect(() => assertSemantic768ExecutorParityV1(base('qdrant'), { ...base('cuvs'), representationRevision: 'semantic_768:r2' })).toThrow('SEMANTIC768_PARITY_REVISION_MISMATCH');
    expect(() => assertSemantic768ExecutorParityV1(base('qdrant'), { ...base('cuvs'), rowCount: 3 })).toThrow('SEMANTIC768_PARITY_ROW_COUNT_MISMATCH');
    expect(() => assertSemantic768ExecutorParityV1(base('qdrant'), { ...base('cuvs'), identityManifestChecksum: 'sha256:' + '3'.repeat(64) })).toThrow('SEMANTIC768_PARITY_IDENTITY_MANIFEST_MISMATCH');
    expect(() => assertSemantic768ExecutorParityV1(base('qdrant'), { ...base('cuvs'), matrixChecksum: 'sha256:' + '4'.repeat(64) })).toThrow('SEMANTIC768_PARITY_MATRIX_MISMATCH');
  });

  it('rejects a mutation-enabled envelope', () => {
    expect(() => assertSemantic768ExecutorParityV1(base('qdrant'), { ...base('cuvs'), writesPerformed: true })).toThrow('SEMANTIC768_PARITY_MUTATION_POLICY:cuvs');
  });

  it('normalizes real Qdrant and cuVS receipt shapes before parity checking', () => {
    const qdrant = normalizeQdrantSemantic768ReceiptV1({
      representationId: 'semantic_768', representationRevision: 'semantic_768:r1', dimension: 768,
      returnedPacketKeys: 2, identityManifestChecksum: base('qdrant').identityManifestChecksum,
      matrixChecksum: base('qdrant').matrixChecksum, manifestStatus: 'PROVEN_FOR_RETURNED_PROJECTION',
    });
    const cuvs = normalizeCuvsSemantic768ReceiptV1({
      representationId: 'semantic_768', representationRevision: 'semantic_768:r1', dimension: 768,
      corpusRows: 2, identityManifestChecksum: base('cuvs').identityManifestChecksum,
      matrixChecksum: base('cuvs').matrixChecksum,
    });
    expect(assertSemantic768ExecutorParityV1(qdrant, cuvs).sameMatrix).toBe(true);
  });

  it('rejects unqualified Qdrant projection receipts', () => {
    expect(() => normalizeQdrantSemantic768ReceiptV1({
      representationId: 'semantic_768', representationRevision: 'semantic_768:r1', dimension: 768,
      returnedPacketKeys: 2, identityManifestChecksum: null, matrixChecksum: null,
      manifestStatus: 'BLOCKED_SOURCE_REVISION_AUTHORITY',
    })).toThrow('SEMANTIC768_PARITY_QDRANT_MANIFEST_STATUS');
  });
});
