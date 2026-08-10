import { describe, expect, it } from 'vitest';
import { validateRuntimePolicy } from '../../../src/lib/server/atlas/tensors/runtime-policy-manifest';

describe('RuntimePolicyManifest', () => {
  it('keeps initial runtime bounded to one active and one prefetch tile', () => {
    expect(() => validateRuntimePolicy({policyRevision:'p1',kmeansRevision:'k1',somRevision:'s1',annRevision:'a1',aceRevision:'ace1',rerankerRevision:'r1',kmeansK:128,somWidth:20,somHeight:20,topCentroids:3,annTopK:100,exactParityTopK:100,maxResidentTileBytes:6*1024*1024,maxResidentTiles:8,activeComputeTiles:1,prefetchTiles:1,graphHopBudget:2})).not.toThrow();
  });
});
