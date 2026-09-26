import { describe, expect, it } from 'vitest';
import {
  assertSemantic768ManifestMatchesRowsV1,
  buildSemantic768IdentityManifestV1,
  SEMANTIC768_DIMENSION,
} from './semantic768-identity-manifest-v1.js';

function vector(index: number): number[] {
  const values = Array.from({ length: SEMANTIC768_DIMENSION }, () => 0);
  values[index] = 1;
  return values;
}

const rows = [
  { packetKey: 'packet:b', sourceRevision: 'sha256:b', vector: vector(1) },
  { packetKey: 'packet:a', sourceRevision: 'sha256:a', vector: vector(0) },
];

describe('semantic_768 identity manifest v1', () => {
  it('is order-independent while preserving the same matrix and identity checksums', () => {
    const first = buildSemantic768IdentityManifestV1({ representationRevision: 'semantic-768-v1', rows });
    const second = buildSemantic768IdentityManifestV1({ representationRevision: 'semantic-768-v1', rows: [...rows].reverse() });
    expect(second.identityManifestChecksum).toBe(first.identityManifestChecksum);
    expect(second.matrixChecksum).toBe(first.matrixChecksum);
    expect(first.identities.map((row) => row.packetKey)).toEqual(['packet:a', 'packet:b']);
  });

  it('separates identity changes from matrix/vector changes', () => {
    const first = buildSemantic768IdentityManifestV1({ representationRevision: 'semantic-768-v1', rows });
    const vectorChanged = buildSemantic768IdentityManifestV1({
      representationRevision: 'semantic-768-v1',
      rows: [{ ...rows[0], vector: vector(2) }, rows[1]],
    });
    const revisionChanged = buildSemantic768IdentityManifestV1({
      representationRevision: 'semantic-768-v1',
      rows: [{ ...rows[0], sourceRevision: 'sha256:c' }, rows[1]],
    });
    expect(vectorChanged.identityManifestChecksum).toBe(first.identityManifestChecksum);
    expect(vectorChanged.matrixChecksum).not.toBe(first.matrixChecksum);
    expect(revisionChanged.identityManifestChecksum).not.toBe(first.identityManifestChecksum);
    expect(revisionChanged.matrixChecksum).not.toBe(first.matrixChecksum);
  });

  it('rejects invalid dimensions, nonfinite values, empty revisions, and duplicates', () => {
    expect(() => buildSemantic768IdentityManifestV1({ representationRevision: 'v1', rows: [{ ...rows[0], vector: [1] }] })).toThrow('DIMENSION');
    expect(() => buildSemantic768IdentityManifestV1({ representationRevision: 'v1', rows: [{ ...rows[0], vector: [NaN, ...vector(1).slice(1)] }] })).toThrow('NONFINITE');
    expect(() => buildSemantic768IdentityManifestV1({ representationRevision: 'v1', rows: [{ ...rows[0], sourceRevision: '' }] })).toThrow('SOURCE_REVISION');
    expect(() => buildSemantic768IdentityManifestV1({ representationRevision: 'v1', rows: [rows[0], rows[0]] })).toThrow('DUPLICATE');
  });

  it('rejects a changed matrix when validating a shared manifest', () => {
    const manifest = buildSemantic768IdentityManifestV1({ representationRevision: 'semantic-768-v1', rows });
    expect(() => assertSemantic768ManifestMatchesRowsV1(manifest, [{ ...rows[0], vector: vector(3) }, rows[1]])).toThrow('MATRIX_CHECKSUM');
  });
});
