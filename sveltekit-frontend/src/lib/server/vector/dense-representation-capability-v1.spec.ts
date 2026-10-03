import { describe, expect, it } from 'vitest';
import {
  assertDenseRepresentationCapabilityV1,
  buildDenseRepresentationCapabilityV1,
} from './dense-representation-capability-v1.js';

const base = {
  schema: 'atlas.dense-representation-capability.v1' as const,
  logicalRepresentation: 'semantic_768',
  dimensions: 768,
  metric: 'cosine' as const,
  qdrant: { collection: 'summary_lenses_768', vectorName: 'summary' },
  available: true,
  representationRevision: 'summary-lenses-schema-v1',
  writesPerformed: false as const,
};

describe('DenseRepresentationCapabilityV1', () => {
  it('builds and verifies deterministic capability identity', () => {
    const first = buildDenseRepresentationCapabilityV1(base);
    const second = buildDenseRepresentationCapabilityV1({ ...base, qdrant: { ...base.qdrant } });
    expect(first).toEqual(second);
    expect(assertDenseRepresentationCapabilityV1(first)).toEqual(first);
  });

  it('rejects tampered capability checksums', () => {
    const capability = buildDenseRepresentationCapabilityV1(base);
    expect(() => assertDenseRepresentationCapabilityV1({ ...capability, representationRevision: 'tampered' })).toThrow(
      'DENSE_REPRESENTATION_CAPABILITY_CHECKSUM_MISMATCH',
    );
  });

  it('represents an unavailable optional representation without mutation', () => {
    const capability = buildDenseRepresentationCapabilityV1({
      ...base,
      logicalRepresentation: 'embedding_512',
      dimensions: 512,
      qdrant: null,
      available: false,
      reason: 'COLUMN_ABSENT',
    });
    expect(capability).toMatchObject({ available: false, reason: 'COLUMN_ABSENT', writesPerformed: false });
    expect(assertDenseRepresentationCapabilityV1(capability)).toEqual(capability);
  });
});
