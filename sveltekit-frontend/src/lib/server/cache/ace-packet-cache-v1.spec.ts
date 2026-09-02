import { describe, expect, it } from 'vitest';
import { buildRevisionedAcePacketCacheKeyV1 } from './ace-packet-cache.js';

const identity = {
  artifactKind: 'ace_packet',
  representationId: 'semantic_768',
  representationRevision: 'semantic:r1',
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'sha256:ordinal',
  graphRevision: 'graph:r1',
  featureRevision: 'feature:r1',
  producerRevision: 'producer:r1',
  normalizationPolicyRevision: 'context:v1',
  artifactChecksum: 'sha256:packet',
};

describe('revision-qualified ACE packet cache', () => {
  it('uses the packet namespace and complete identity', () => {
    const key = buildRevisionedAcePacketCacheKeyV1(identity);
    expect(key).toContain('ace_packet');
    expect(key).toContain('semantic_768');
    expect(key).toContain('candidate%3Ar1');
  });

  it('changes when packet lineage changes', () => {
    expect(buildRevisionedAcePacketCacheKeyV1(identity)).not.toBe(
      buildRevisionedAcePacketCacheKeyV1({
        ...identity,
        artifactChecksum: 'sha256:changed',
      }),
    );
  });
});
