// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { admitAceRouteCacheIdentityV1 } from './ace-route-cache-admission-v1.js';

const identity = {
  cacheKind: 'ACE_PACKET',
  artifactKind: 'ace-packet',
  requestHash: 'ace:packet:query-1',
  representationId: 'semantic_768',
  representationRevision: 'rep-1',
  candidateSnapshotRevision: 'snapshot-1',
  ordinalMapChecksum: 'sha256:ordinal',
  graphRevision: 'graph-1',
  featureRevision: 'feature-1',
  producerRevision: 'producer-1',
  normalizationPolicyRevision: 'norm-1',
  artifactChecksum: 'sha256:packet',
} as const;

describe('ACE route cache admission', () => {
  it('requires an explicit identity', () => {
    expect(admitAceRouteCacheIdentityV1(undefined, 'ace:packet:query-1')).toMatchObject({
      status: 'BLOCKED_IDENTITY',
      reason: 'ACE_ROUTE_IDENTITY_REQUIRED',
    });
  });

  it('rejects incomplete and non-packet identities', () => {
    expect(admitAceRouteCacheIdentityV1({ ...identity, graphRevision: '' }, 'ace:packet:query-1')).toMatchObject({
      status: 'BLOCKED_IDENTITY',
      reason: 'ACE_ROUTE_IDENTITY_INVALID',
    });
    expect(admitAceRouteCacheIdentityV1({ ...identity, cacheKind: 'RESIDENCY' }, 'ace:packet:query-1')).toMatchObject({
      status: 'BLOCKED_IDENTITY',
      reason: 'ACE_ROUTE_IDENTITY_INVALID',
    });
    expect(admitAceRouteCacheIdentityV1({ ...identity, requestHash: 'ace:packet:other' }, 'ace:packet:query-1')).toMatchObject({
      status: 'BLOCKED_IDENTITY',
      reason: 'ACE_ROUTE_IDENTITY_INVALID',
    });
  });

  it('admits only a complete ACE_PACKET identity with a revisioned key', () => {
    const result = admitAceRouteCacheIdentityV1(identity, 'ace:packet:query-1');
    expect(result.status).toBe('ADMITTED');
    if (result.status === 'ADMITTED') {
      expect(result.identity).toEqual(identity);
      expect(result.cacheKey).toMatch(/^atlas:bitfrost:v1:ace_packet:/);
      expect(result.reason).toBeNull();
    }
  });
});
