// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { aceTopkRevisionedKeyV1, type RetrievalCacheIdentityV1 } from '../ace/cache-keys.js';
import {
  admitRevisionedAceTopRetrievalEntry,
  buildRevisionedAceTopRetrievalEntry,
  normalizeAceTopRetrievalEntry,
  type AceTopRetrievalCacheEntry,
} from './ace-top-retrieval-cache.js';

describe('revision-qualified ACE top-K cache admission', () => {
  const identity: RetrievalCacheIdentityV1 = {
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

  const entry: AceTopRetrievalCacheEntry = {
    cacheKey: aceTopkRevisionedKeyV1(identity),
    queryHash: identity.queryHash,
    topN: 20,
    createdAt: '2026-09-15T00:00:00.000Z',
    results: [{ id: 'packet-1', score: 0.9 }],
    identity,
  };

  it('admits an exact identity and top-N match', () => {
    const built = buildRevisionedAceTopRetrievalEntry(identity, entry.results, 20);
    expect(admitRevisionedAceTopRetrievalEntry(built, { ...identity }, 20)).toEqual(built);
  });

  it('rejects legacy entries without identity', () => {
    const legacy = { ...entry, identity: undefined, cacheKey: 'ace:retrieval:topn:query-1:20' };
    expect(admitRevisionedAceTopRetrievalEntry(legacy, identity, 20)).toBeNull();
  });

  it('marks identity-less legacy values degraded during normalization', () => {
    const legacy = normalizeAceTopRetrievalEntry({
      queryHash: identity.queryHash,
      topN: 20,
      createdAt: entry.createdAt,
      results: entry.results,
    });
    expect(legacy.identity).toBeUndefined();
    expect(legacy.degraded).toBe(true);
  });

  it('does not allow an explicit legacy degraded=false flag to upgrade an entry', () => {
    const legacy = normalizeAceTopRetrievalEntry({
      queryHash: identity.queryHash,
      topN: 20,
      createdAt: entry.createdAt,
      results: entry.results,
      degraded: false,
    });
    expect(legacy.identity).toBeUndefined();
    expect(legacy.degraded).toBe(true);
  });

  it('rejects changed revision, query, top-N, or derived key', () => {
    expect(admitRevisionedAceTopRetrievalEntry(entry, { ...identity, graphRevision: 'graph-2' }, 20)).toBeNull();
    expect(admitRevisionedAceTopRetrievalEntry(entry, { ...identity, queryHash: 'query-2' }, 20)).toBeNull();
    expect(admitRevisionedAceTopRetrievalEntry(entry, identity, 10)).toBeNull();
    expect(admitRevisionedAceTopRetrievalEntry({ ...entry, cacheKey: 'wrong-key' }, identity, 20)).toBeNull();
  });

  it('rejects an invalid top-N before a writer can create a cache entry', () => {
    expect(() => buildRevisionedAceTopRetrievalEntry(identity, [], 0)).toThrow(/topN/);
    expect(() => buildRevisionedAceTopRetrievalEntry(identity, [], 1.5)).toThrow(/topN/);
  });
});
