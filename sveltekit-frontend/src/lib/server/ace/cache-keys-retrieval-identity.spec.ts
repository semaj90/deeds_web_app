// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  aceTopkRevisionedKeyV1,
  bifrostRetrievalCacheKeyV2,
  bifrostRetrievalCacheKeyV3,
  bifrostRetrievalCacheLookupKey,
  shouldReadUnrevisionedSemanticCacheV1,
  type BifrostRetrievalCacheIdentityV3,
  type RetrievalCacheIdentityV1,
} from './cache-keys.js';

describe('revision-qualified ACE retrieval cache identity', () => {
  const base: RetrievalCacheIdentityV1 = {
    queryHash: 'query-1',
    model: 'embeddinggemma',
    dim: 768,
    workspaceRevision: 'workspace-1',
    candidateSnapshotRevision: 'snapshot-1',
    ordinalMapChecksum: 'ordinals-1',
    representationRevision: 'semantic-768-1',
    featureRevision: 'features-1',
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

describe('Bifrost retrieval cache v3 identity', () => {
  const base: BifrostRetrievalCacheIdentityV3 = {
    queryHash: 'query-1',
    workspaceRevision: 'workspace-1',
    candidateSnapshotRevision: 'snapshot-1',
    ordinalMapChecksum: 'ordinal-1',
    representationRevision: 'semantic-768-1',
    featureRevision: 'feature-1',
    retrievalPolicyRevision: 'retrieval-1',
    contextPolicyRevision: 'context-1',
    graphRevision: null,
    modelRevision: 'model-sha256:abc',
    dimension: 768,
  };

  it('creates a stable, distinct v3 namespace and leaves the v2 contract unchanged', () => {
    expect(bifrostRetrievalCacheKeyV3(base)).toBe(bifrostRetrievalCacheKeyV3({ ...base }));
    expect(bifrostRetrievalCacheKeyV3(base)).toMatch(/^bifrost:retrieval:v3:[a-f0-9]{64}$/);
    const legacy = {
      queryHash: base.queryHash,
      workspaceRevision: base.workspaceRevision,
      candidateSnapshotRevision: base.candidateSnapshotRevision,
      ordinalMapChecksum: base.ordinalMapChecksum,
      representationRevision: base.representationRevision,
      retrievalPolicyRevision: base.retrievalPolicyRevision,
      contextPolicyRevision: base.contextPolicyRevision,
      graphRevision: base.graphRevision,
    };
    expect(bifrostRetrievalCacheKeyV2(legacy)).toMatch(/^bifrost:retrieval:v2:[a-f0-9]{64}$/);
  });

  it('changes for every coordinate that can alter candidates or ordering', () => {
    const key = bifrostRetrievalCacheKeyV3(base);
    for (const [field, value] of Object.entries({
      featureRevision: 'feature-2',
      modelRevision: 'model-sha256:def',
      dimension: 512,
      representationRevision: 'semantic-768-2',
      candidateSnapshotRevision: 'snapshot-2',
      ordinalMapChecksum: 'ordinal-2',
      graphRevision: 'graph-2',
      retrievalPolicyRevision: 'retrieval-2',
      contextPolicyRevision: 'context-2',
      workspaceRevision: 'workspace-2',
      queryHash: 'query-2',
    })) {
      expect(bifrostRetrievalCacheKeyV3({ ...base, [field]: value } as BifrostRetrievalCacheIdentityV3), field)
        .not.toBe(key);
    }
  });

  it('fails closed for incomplete identity or invalid dimension', () => {
    expect(() => bifrostRetrievalCacheKeyV3({ ...base, modelRevision: '' })).toThrow('BIFROST_RETRIEVAL_V3_IDENTITY_INCOMPLETE');
    expect(() => bifrostRetrievalCacheKeyV3({ ...base, dimension: 0 })).toThrow('BIFROST_RETRIEVAL_V3_DIMENSION_INVALID');
  });

  it('never falls back to v2 or an unrevisioned key for a supplied mismatched v3 identity', () => {
    expect(bifrostRetrievalCacheLookupKey('query-1', base)).toBe(bifrostRetrievalCacheKeyV3(base));
    expect(bifrostRetrievalCacheLookupKey('different-query', base)).toBeNull();
    expect(bifrostRetrievalCacheLookupKey('query-1')).toBe('bitfrost:retrieval:query-1');
    expect(bifrostRetrievalCacheLookupKey('query-1', undefined, true)).toBeNull();
  });

  it('suppresses the legacy semantic cache when disabled or when strict identity is present', () => {
    expect(shouldReadUnrevisionedSemanticCacheV1({ hasRevisionedIdentity: false, disabled: true })).toBe(false);
    expect(shouldReadUnrevisionedSemanticCacheV1({ hasRevisionedIdentity: true, disabled: false })).toBe(false);
    expect(shouldReadUnrevisionedSemanticCacheV1({ hasRevisionedIdentity: false, disabled: false })).toBe(true);
  });
});
