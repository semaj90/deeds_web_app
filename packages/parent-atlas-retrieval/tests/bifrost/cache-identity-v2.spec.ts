import { describe, expect, it } from 'vitest';
import { BifrostCacheManager } from '../../src/bifrost/bifrost-cache-manager.js';

const baseIdentity = {
  queryHash: 'query:r1',
  workspaceRevision: 'workspace:r1',
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'ordinal:r1',
  representationRevision: 'semantic_768:r1',
  retrievalPolicyRevision: 'retrieval-policy:r1',
  contextPolicyRevision: 'context-policy:r1',
  graphRevision: 'graph:r1',
};

describe('BitFrost retrieval cache identity v2', () => {
  it('is deterministic and revision-qualified across every identity axis', () => {
    const first = BifrostCacheManager.buildRetrievalCacheKeyV2(baseIdentity);
    const replay = BifrostCacheManager.buildRetrievalCacheKeyV2({ ...baseIdentity });

    expect(first).toBe(replay);
    expect(first).toMatch(/^bitfrost:retrieval:v2:[a-f0-9]{64}$/);

    for (const field of [
      'queryHash',
      'workspaceRevision',
      'candidateSnapshotRevision',
      'ordinalMapChecksum',
      'representationRevision',
      'retrievalPolicyRevision',
      'contextPolicyRevision',
      'graphRevision',
    ] as const) {
      expect(
        BifrostCacheManager.buildRetrievalCacheKeyV2({
          ...baseIdentity,
          [field]: `${baseIdentity[field]}:changed`,
        }),
      ).not.toBe(first);
    }
  });
});
