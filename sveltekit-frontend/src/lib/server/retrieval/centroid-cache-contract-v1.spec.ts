import { describe, expect, it } from 'vitest';
import {
  CENTROID_CACHE_DIMENSION,
  CENTROID_CACHE_REPRESENTATION,
  CENTROID_CACHE_SOURCE_COLLECTION,
  buildCentroidCacheEnvelopeV1,
  normalizeCentroidCachePayloadV1,
} from './centroid-cache-contract-v1.js';

function vector(fill = 0.25): number[] {
  return Array.from({ length: CENTROID_CACHE_DIMENSION }, () => fill);
}

describe('CentroidCacheEnvelopeV1', () => {
  it('builds a lineage-qualified semantic_768 centroid when revisions are explicit', () => {
    const envelope = buildCentroidCacheEnvelopeV1({
      clusterId: 7,
      vector: vector(),
      representationRevision: 'semantic-768-r42',
      producerRevision: 'graphify-semantic-r19',
      topoClass: 'retrieval',
      topoByte: 3,
    });

    expect(envelope.representationId).toBe(CENTROID_CACHE_REPRESENTATION);
    expect(envelope.sourceCollection).toBe(CENTROID_CACHE_SOURCE_COLLECTION);
    expect(envelope.dimension).toBe(768);
    expect(envelope.lineageQualified).toBe(true);
  });

  it('normalizes the historical bare-array payload without fabricating lineage', () => {
    const envelope = normalizeCentroidCachePayloadV1(2, vector(0.5));

    expect(envelope.clusterId).toBe(2);
    expect(envelope.vector).toHaveLength(768);
    expect(envelope.representationRevision).toBeNull();
    expect(envelope.producerRevision).toBeNull();
    expect(envelope.lineageQualified).toBe(false);
  });

  it('normalizes the historical object payload while preserving topology hints', () => {
    const envelope = normalizeCentroidCachePayloadV1(11, {
      vector: vector(0.75),
      topoClass: 'graph',
      topoByte: 9,
    });

    expect(envelope.clusterId).toBe(11);
    expect(envelope.topoClass).toBe('graph');
    expect(envelope.topoByte).toBe(9);
    expect(envelope.lineageQualified).toBe(false);
  });

  it('rejects wrong dimensionality instead of silently mixing vector representations', () => {
    expect(() => normalizeCentroidCachePayloadV1(1, [1, 2, 3])).toThrow();
  });

  it('rejects a versioned envelope whose embedded cluster identity disagrees with the key', () => {
    const envelope = buildCentroidCacheEnvelopeV1({
      clusterId: 8,
      vector: vector(),
    });

    expect(() => normalizeCentroidCachePayloadV1(9, envelope)).toThrow(
      'CENTROID_CLUSTER_ID_MISMATCH:9:8',
    );
  });
});
