import { describe, expect, it } from 'vitest';
import {
  buildAcePrefillPacketReferenceV1,
  centroidRefToRedisKey,
} from './ace-prefill-packet-reference-v1.js';

const H64 = (fill: string) => fill.repeat(64).slice(0, 64);

describe('AcePrefillPacketReferenceV1', () => {
  it('carries only refs/checksums, never raw content', () => {
    const ref = buildAcePrefillPacketReferenceV1({
      packetKey: 'pk1',
      sourceRef: 'src/foo.ts',
      canonicalEvidenceRefs: ['pk1', 'pk1', 'pk2'],
      latentProjectionReceiptChecksum: H64('a'),
      modelManifestChecksum: H64('b'),
      ontologyTupleRefs: ['t2', 't1'],
      graphFeatureRevision: 'g1',
      centroidRef: { kind: 'GPU_CLUSTER', clusterId: 7 },
      cacheStatus: 'NOT_PROJECTED',
      producerRevision: 'rev1',
    });
    // Deduplicated + sorted, never raw evidence text.
    expect(ref.canonicalEvidenceRefs).toEqual(['pk1', 'pk2']);
    expect(ref.ontologyTupleRefs).toEqual(['t1', 't2']);
    expect(ref.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves centroidRef through the existing centroid-cache.ts key scheme', () => {
    expect(centroidRefToRedisKey({ kind: 'GPU_CLUSTER', clusterId: 7 }))
      .toBe('taxonomy:clusters:gpu:7');
    expect(centroidRefToRedisKey({ kind: 'SOM_CELL', row: 2, col: 3 }))
      .toBe('taxonomy:clusters:som:2:3');
  });

  it('allows a null centroidRef for packets not yet cluster-assigned', () => {
    const ref = buildAcePrefillPacketReferenceV1({
      packetKey: 'pk1',
      sourceRef: 'src/foo.ts',
      canonicalEvidenceRefs: ['pk1'],
      latentProjectionReceiptChecksum: null,
      modelManifestChecksum: null,
      ontologyTupleRefs: [],
      graphFeatureRevision: null,
      centroidRef: null,
      cacheStatus: 'NOT_PROJECTED',
      producerRevision: 'rev1',
    });
    expect(ref.centroidRef).toBeNull();
  });
});
