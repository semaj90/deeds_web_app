import { describe, expect, it } from 'vitest';
import { mapRepoSearchIdentityV1 } from './repo-search-identity.js';

describe('mapRepoSearchIdentityV1', () => {
  it('keeps UUID repository and Qdrant IDs separate from canonical packet identity', () => {
    const result = mapRepoSearchIdentityV1({
      repositoryId: '550e8400-e29b-41d4-a716-446655440000',
      packetKey: 'packet:repo:42',
      sourceRef: 'src/a.ts',
      projectionId: '01J8QDRANTULID000000000000',
      projectionKind: 'qdrant',
    });

    expect(result.repositoryId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.canonicalId).toBe('packet:repo:42');
    expect(result.identityResolutionSource).toBe('packet_key');
    expect(result.identityResolutionStatus).toBe('canonical');
    expect(result.projectionId).toBe('01J8QDRANTULID000000000000');
  });

  it('uses canonicalSourceRef for source-level identity when packet identity is absent', () => {
    const result = mapRepoSearchIdentityV1({
      sourceRef: 'src/lib/a.ts',
      canonicalSourceRef: 'sveltekit-frontend/src/lib/a.ts',
      projectionId: 'qdrant-point-1',
    });

    expect(result.canonicalId).toBe('sveltekit-frontend/src/lib/a.ts');
    expect(result.identityResolutionSource).toBe('source_ref');
    expect(result.canonicalSourceRef).toBe('sveltekit-frontend/src/lib/a.ts');
  });

  it('marks a projection-only hit unresolved instead of promoting its UUID or ULID', () => {
    const result = mapRepoSearchIdentityV1({
      projectionId: '550e8400-e29b-41d4-a716-446655440000',
      projectionKind: 'qdrant',
    });

    expect(result.canonicalId).toBeNull();
    expect(result.identityResolutionSource).toBeNull();
    expect(result.identityResolutionStatus).toBe('unresolved');
    expect(result.projectionId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
});
