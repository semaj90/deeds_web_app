import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheMocks = vi.hoisted(() => ({
  getContextCacheWithSource: vi.fn(async () => ({ source: 'miss', pack: null })),
  setContextCache: vi.fn(async () => undefined),
  bumpContextCacheHit: vi.fn(async () => undefined),
}));

function qualifiedState() {
  return buildAceContextPlannerState({
    query: 'inspect cache routing',
    repoGitSha: 'repo-revision-a',
    corpusHash: 'corpus-revision-a',
    evidenceBundleHash: 'evidence-revision-a',
    ragBundleHash: 'rag-revision-a',
    graphSnapshotHash: 'graph-revision-a',
  });
}

vi.mock('./llm-context-cache.js', () => ({
  buildContextCacheKey: vi.fn(() => 'fixture-cache-key'),
  getContextCacheWithSource: (...args: unknown[]) => cacheMocks.getContextCacheWithSource(...args),
  setContextCache: (...args: unknown[]) => cacheMocks.setContextCache(...args),
  bumpContextCacheHit: (...args: unknown[]) => cacheMocks.bumpContextCacheHit(...args),
  normalizeCachedContextPacket: vi.fn((value: unknown) => value),
}));

import {
  buildAceContextPlannerState,
  loadAceContextPlannerHit,
  storeAceContextPlannerHit,
} from './context-cache-planner.js';
import { aceTopkRevisionedKeyV1, type RetrievalCacheIdentityV1 } from './cache-keys.js';

const retrievalIdentity: RetrievalCacheIdentityV1 = {
  queryHash: 'query-hash-v1',
  model: 'embeddinggemma',
  dim: 768,
  workspaceRevision: 'sha256:workspace-v1',
  candidateSnapshotRevision: 'snapshot-v1',
  ordinalMapChecksum: `sha256:${'a'.repeat(64)}`,
  representationRevision: 'semantic-768-v1',
  featureRevision: 'feature-v1',
  retrievalPolicyRevision: 'retrieval-policy-v1',
  contextPolicyRevision: 'context-policy-v1',
  graphRevision: 'graph-v1',
};

describe('ACE context cache planner identity gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not read or write cache entries with placeholder snapshot identities', async () => {
    const state = buildAceContextPlannerState({ query: 'inspect cache routing' });

    await expect(loadAceContextPlannerHit(state)).resolves.toBeNull();
    await storeAceContextPlannerHit(state, { summary: 'fixture' } as never);

    expect(cacheMocks.getContextCacheWithSource).not.toHaveBeenCalled();
    expect(cacheMocks.setContextCache).not.toHaveBeenCalled();
    expect(cacheMocks.bumpContextCacheHit).not.toHaveBeenCalled();
  });

  it('permits lookup when every context snapshot identity is supplied', async () => {
    const state = qualifiedState();

    await expect(loadAceContextPlannerHit(state)).resolves.toBeNull();
    expect(cacheMocks.getContextCacheWithSource).toHaveBeenCalledWith(state.cacheKey);
  });

  it('uses the existing admitted SearchRuntime identity as a cache boundary', async () => {
    const state = buildAceContextPlannerState({
      query: 'inspect cache routing',
      retrievalCacheIdentity: retrievalIdentity,
    });
    const otherSnapshotState = buildAceContextPlannerState({
      query: 'inspect cache routing',
      retrievalCacheIdentity: { ...retrievalIdentity, candidateSnapshotRevision: 'snapshot-v2' },
    });

    expect(state.retrievalCacheIdentityKey).toBe(aceTopkRevisionedKeyV1(retrievalIdentity));
    expect(otherSnapshotState.retrievalCacheIdentityKey).not.toBe(state.retrievalCacheIdentityKey);
    await expect(loadAceContextPlannerHit(state)).resolves.toBeNull();
    expect(cacheMocks.getContextCacheWithSource).toHaveBeenCalledWith(state.cacheKey);
  });

  it('rejects empty snapshot identity fields', async () => {
    const state = buildAceContextPlannerState({
      query: 'inspect cache routing',
      repoGitSha: 'repo-revision-a',
      corpusHash: 'corpus-revision-a',
      evidenceBundleHash: 'evidence-revision-a',
      ragBundleHash: 'rag-revision-a',
      graphSnapshotHash: ' ',
    });

    await expect(loadAceContextPlannerHit(state)).resolves.toBeNull();
    expect(cacheMocks.getContextCacheWithSource).not.toHaveBeenCalled();
  });

  it('rejects each documented placeholder revision independently', async () => {
    const placeholders = [
      { repoGitSha: 'unknown' },
      { corpusHash: 'codebase-graph:unknown' },
      { evidenceBundleHash: 'evidence:none' },
      { ragBundleHash: 'rag:none' },
      { graphSnapshotHash: 'graph:none' },
    ];

    for (const override of placeholders) {
      const state = buildAceContextPlannerState({
        query: 'inspect cache routing',
        repoGitSha: 'repo-revision-a',
        corpusHash: 'corpus-revision-a',
        evidenceBundleHash: 'evidence-revision-a',
        ragBundleHash: 'rag-revision-a',
        graphSnapshotHash: 'graph-revision-a',
        ...override,
      });
      await expect(loadAceContextPlannerHit(state)).resolves.toBeNull();
      await storeAceContextPlannerHit(state, { summary: 'fixture' } as never);
    }

    expect(cacheMocks.getContextCacheWithSource).not.toHaveBeenCalled();
    expect(cacheMocks.setContextCache).not.toHaveBeenCalled();
  });

  it('rejects cached planner state from a different graph snapshot before recording a hit', async () => {
    const state = qualifiedState();
    cacheMocks.getContextCacheWithSource.mockImplementationOnce(async () => ({
      source: 'redis',
      pack: {
        summary: 'stale context',
        plannerState: { ...state, graphSnapshotHash: 'graph-revision-old' },
      } as never,
    }));

    await expect(loadAceContextPlannerHit(state)).resolves.toBeNull();
    expect(cacheMocks.bumpContextCacheHit).not.toHaveBeenCalled();
  });

  it('rejects cached packets without planner-state readback', async () => {
    cacheMocks.getContextCacheWithSource.mockImplementationOnce(async () => ({
      source: 'redis',
      pack: { summary: 'unbound context' } as never,
    }));

    await expect(loadAceContextPlannerHit(qualifiedState())).resolves.toBeNull();
    expect(cacheMocks.bumpContextCacheHit).not.toHaveBeenCalled();
  });

  it('accepts an exact cached planner-state match', async () => {
    const state = qualifiedState();
    cacheMocks.getContextCacheWithSource.mockImplementationOnce(async () => ({
      source: 'redis',
      pack: { summary: 'matching context', plannerState: state } as never,
    }));

    const hit = await loadAceContextPlannerHit(state);

    expect(hit?.packet.summary).toBe('matching context');
    expect(hit?.meta.deltaFields).toEqual([]);
    expect(cacheMocks.bumpContextCacheHit).toHaveBeenCalledWith(state.cacheKey);
  });
});
