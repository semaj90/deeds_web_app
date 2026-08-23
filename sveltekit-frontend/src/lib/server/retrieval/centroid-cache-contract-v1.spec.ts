import { describe, expect, it } from 'vitest';
import {
  CENTROID_CACHE_DIMENSION_V1,
  normalizeCentroidCacheRecordV1,
  serializeCentroidCacheEnvelopeV1,
} from './centroid-cache-contract-v1';

const vector = Array.from({ length: CENTROID_CACHE_DIMENSION_V1 }, (_, index) => index / 1000);

describe('centroid-cache-contract-v1', () => {
  it('qualifies lineage only when both revisions are explicit', () => {
    const envelope = serializeCentroidCacheEnvelopeV1({
      clusterId: 7,
      vector,
      representationRevision: 'repr:semantic_768:r3',
      producerRevision: 'producer:graphify-semantic:r9',
      topoClass: 'service-layer',
      topoByte: 42,
    });

    expect(envelope.lineageQualified).toBe(true);
    expect(envelope.dimension).toBe(768);
    expect(envelope.representationId).toBe('semantic_768');
    expect(envelope.sourceCollection).toBe('codebase_chunks_768');
  });

  it('reads legacy array records without inventing lineage', () => {
    const envelope = normalizeCentroidCacheRecordV1(3, vector);
    expect(envelope.clusterId).toBe(3);
    expect(envelope.lineageQualified).toBe(false);
    expect(envelope.representationRevision).toBeNull();
    expect(envelope.producerRevision).toBeNull();
  });

  it('preserves topology metadata from legacy object records', () => {
    const envelope = normalizeCentroidCacheRecordV1(4, {
      vector,
      topoClass: 'adapter',
      topoByte: 17,
    });

    expect(envelope.topoClass).toBe('adapter');
    expect(envelope.topoByte).toBe(17);
    expect(envelope.lineageQualified).toBe(false);
  });

  it('rejects the wrong vector dimension', () => {
    expect(() => normalizeCentroidCacheRecordV1(1, [1, 2, 3])).toThrow(
      'CENTROID_CACHE_VECTOR_DIMENSION_MISMATCH:3',
    );
  });

  it('rejects a payload cluster id that does not match the cache key', () => {
    expect(() =>
      normalizeCentroidCacheRecordV1(5, {
        schema: 'atlas.centroid-cache-envelope.v1',
        clusterId: 6,
        vector,
        dimension: 768,
        representationId: 'semantic_768',
        sourceCollection: 'codebase_chunks_768',
        representationRevision: null,
        producerRevision: null,
      }),
    ).toThrow('CENTROID_CACHE_CLUSTER_ID_MISMATCH');
  });
});
