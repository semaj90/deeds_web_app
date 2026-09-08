// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { aceTopkRevisionedKeyV1, type RetrievalCacheIdentityV1 } from './cache-keys.js';

describe('revision-qualified ACE retrieval cache identity', () => {
  const base: RetrievalCacheIdentityV1 = {
    queryHash: 'query-1',
    model: 'embeddinggemma',
    dim: 768,
    workspaceRevision: 'workspace-1',
    candidateSnapshotRevision: 'snapshot-1',
    ordinalMapChecksum: 'ordinals-1',
    representationRevision: 'semantic-768-1',
    retrievalPolicyRevision: 'policy-1',
    contextPolicyRevision: 'context-1',
    graphRevision: null,
  };

  it('is stable for equivalent identities', () => {
    expect(aceTopkRevisionedKeyV1(base)).toBe(aceTopkRevisionedKeyV1({ ...base }));
    expect(aceTopkRevisionedKeyV1(base)).toMatch(/^ace:topk:v1:[a-f0-9]{64}$/);
  });

  it('invalidates when any retrieval identity revision changes', () => {
    const key = aceTopkRevisionedKeyV1(base);

    for (const field of [
      'workspaceRevision',
      'candidateSnapshotRevision',
      'ordinalMapChecksum',
      'representationRevision',
      'retrievalPolicyRevision',
      'contextPolicyRevision',
      'graphRevision',
    ] as const) {
      const changed = {
        ...base,
        [field]: field === 'graphRevision' ? 'graph-2' : `${base[field]}-2`,
      } as RetrievalCacheIdentityV1;
      expect(aceTopkRevisionedKeyV1(changed)).not.toBe(key);
    }
  });
});
