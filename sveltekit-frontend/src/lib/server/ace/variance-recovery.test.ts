import { describe, expect, it } from 'vitest';
import { buildVarianceRecoveryContext } from './variance-recovery.js';

describe('buildVarianceRecoveryContext', () => {
  it('hydrates semantic variance fields from source refs, loki cache, and cluster tags', async () => {
    const result = await buildVarianceRecoveryContext({
      query: 'qdrant redis semantic cache fallback',
      sourceRefs: ['src/lib/server/cache/ace-packet-cache.ts:12'],
      rankedCards: [{ path: 'src/lib/server/cache/ace-packet-cache.ts' }],
      lokiData: {
        collections: [
          { name: 'cards', data: [{ id: 1 }] },
        ],
      },
      clusterTags: [
        {
          clusterKey: 'cluster:dir:src',
          fileCount: 12,
          topoClasses: ['graph-rag'],
          topTags: [
            { tag: 'qdrant', count: 5 },
            { tag: 'redis', count: 3 },
          ],
          topFiles: ['src/lib/server/cache/ace-packet-cache.ts'],
        },
      ],
      promptCacheKey: 'ace:prompt:abc123',
      degraded: true,
    });

    expect(result.sourceRefs).toEqual(
      expect.arrayContaining(['src/lib/server/cache/ace-packet-cache.ts:12'])
    );
    expect(result.rankedCards.length).toBeGreaterThan(0);
    expect(result.varianceRecovery.exactMatchFailed).toBe(false);
    expect(result.varianceRecovery.qdrantTags).toEqual(
      expect.arrayContaining(['qdrant', 'redis'])
    );
    expect(result.varianceRecovery.semanticCacheHits).toEqual(['loki:cards:1']);
    expect(result.varianceRecovery.didYouMean?.length).toBeGreaterThan(0);
    expect(result.varianceRecovery.acePacket).toBe('ace:prompt:abc123');
  });

  it('falls back to recovery steps when exact and fuzzy search miss', async () => {
    const result = await buildVarianceRecoveryContext({
      query: 'zzzxqv qwyxxz',
      sourceRefs: [],
      rankedCards: [],
      lokiData: { collections: [{ name: 'cards', data: [] }] },
      clusterTags: [],
      promptCacheKey: 'ace:prompt:empty',
      degraded: true,
    });

    expect(result.varianceRecovery.exactMatchFailed).toBe(true);
    expect(result.varianceRecovery.fuzzySearchCandidates).toEqual([]);
    expect(result.varianceRecovery.semanticSearchHits).toEqual([]);
    expect(result.varianceRecovery.semanticCacheHits).toEqual([]);
    expect(result.varianceRecovery.nextSteps).toEqual(
      expect.arrayContaining(['run exact search', 'recall cluster tags', 'extract entities', 'build ACE packet'])
    );
  });
});
