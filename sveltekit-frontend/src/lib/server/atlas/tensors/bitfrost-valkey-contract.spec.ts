import { describe, expect, it } from 'vitest';
import { valkeyCentroidArtifactKeyV1, valkeyCentroidKey } from './bitfrost-valkey-contract.js';

const base = {
  artifactKind: 'som_centroid',
  representationId: 'semantic_768',
  representationRevision: 'semantic:r1',
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'sha256:ordinal',
  graphRevision: 'graph:r1',
  featureRevision: 'feature:r1',
  producerRevision: 'producer:r1',
  normalizationPolicyRevision: 'l2-renorm:v1',
  artifactChecksum: 'sha256:artifact',
};

describe('BitFrost centroid key contract', () => {
  it('preserves the legacy key helper for compatibility', () => {
    expect(valkeyCentroidKey('semantic:r1')).toBe('atlas:tensor:centroids:semantic:r1');
  });

  it('requires revision-qualified identity for new centroid keys', () => {
    const key = valkeyCentroidArtifactKeyV1(base);
    expect(key).toContain('centroid');
    expect(key).not.toBe(valkeyCentroidKey(base.representationRevision));
    expect(() => valkeyCentroidArtifactKeyV1({ ...base, graphRevision: '' })).toThrow();
  });
});
