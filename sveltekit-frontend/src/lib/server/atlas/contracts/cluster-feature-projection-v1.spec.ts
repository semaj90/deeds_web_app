import { describe, expect, it } from 'vitest';
import { buildClusterFeatureProjectionV1 } from './cluster-feature-projection-v1.js';

const BASE_INPUT = {
  packetKey: 'packet:cluster-test-1',
  sourceRef: 'src/lib/db/upsert.ts',
  sourceVersionReceiptId: 'svr:1',
  sourceRepresentationId: 'semantic_768' as const,
  sourceRepresentationRevision: 'sem768:r1',
  routingRepresentationId: 'latent_64' as const,
  autoencoderRevision: 'ae:1',
  kmeans: {
    clusterId: 7,
    probability: 0.82,
    distanceToCentroid: 0.14,
    algorithmRevision: 'kmeans:v1',
    randomState: 42,
  },
  som: {
    row: 8,
    col: 13,
    distance: 0.11,
    algorithmRevision: 'som:v1',
  },
  graphCommunity: {
    communityId: '41',
    algorithm: 'leiden' as const,
    algorithmRevision: 'leiden:v1',
    graphRevision: 'graph:338',
  },
  producerRevision: 'cluster-projection:test',
};

describe('ORF-4: ClusterFeatureProjectionV1', () => {
  it('always pins evidenceAuthority to false, even if the caller tries to override it at runtime', () => {
    // Bypass the type-level Omit to prove the runtime guard, not just the type checker.
    const spoofed = { ...BASE_INPUT, evidenceAuthority: true } as unknown as typeof BASE_INPUT;
    const projection = buildClusterFeatureProjectionV1(spoofed);
    expect(projection.evidenceAuthority).toBe(false);
  });

  it('produces a deterministic projectionDigest for identical input', () => {
    const first = buildClusterFeatureProjectionV1(BASE_INPUT);
    const second = buildClusterFeatureProjectionV1(BASE_INPUT);
    expect(second).toEqual(first);
    expect(first.projectionDigest).toBe(second.projectionDigest);
    expect(first.projectionDigest).toHaveLength(64);
  });

  it('changes the digest when only a routing hint (KMeans/SOM/community) changes, proving those values are not identity-independent noise but are also never packet identity themselves', () => {
    const withDifferentCluster = buildClusterFeatureProjectionV1({
      ...BASE_INPUT,
      kmeans: { ...BASE_INPUT.kmeans, clusterId: 99 },
    });
    const original = buildClusterFeatureProjectionV1(BASE_INPUT);

    // Digest reflects the change (routing hints are real projection content)...
    expect(withDifferentCluster.projectionDigest).not.toBe(original.projectionDigest);
    // ...but packetKey/sourceRef identity is untouched by which cluster the row lands in.
    expect(withDifferentCluster.packetKey).toBe(original.packetKey);
    expect(withDifferentCluster.sourceRef).toBe(original.sourceRef);
  });

  it('accepts all-null KMeans/SOM/community fields (no clustering run yet) without becoming invalid', () => {
    const projection = buildClusterFeatureProjectionV1({
      packetKey: 'packet:cluster-test-2',
      sourceRef: 'src/lib/db/select.ts',
      sourceVersionReceiptId: null,
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: 'sem768:r1',
      routingRepresentationId: null,
      autoencoderRevision: null,
      kmeans: { clusterId: null, probability: null, distanceToCentroid: null, algorithmRevision: null, randomState: null },
      som: { row: null, col: null, distance: null, algorithmRevision: null },
      graphCommunity: { communityId: null, algorithm: null, algorithmRevision: null, graphRevision: null },
      producerRevision: 'cluster-projection:test',
    });
    expect(projection.evidenceAuthority).toBe(false);
    expect(projection.kmeans.clusterId).toBeNull();
  });
});
