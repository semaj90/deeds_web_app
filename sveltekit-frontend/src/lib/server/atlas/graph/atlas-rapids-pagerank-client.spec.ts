import { describe, expect, it, vi } from 'vitest';
import { createAtlasRapidsPageRankClient } from './atlas-rapids-pagerank-client.js';

describe('Atlas RAPIDS PageRank client', () => {
  it('rejects duplicate seed identities before transport', async () => {
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    await expect(client.pagerank({
      graphRevision: 'g1',
      seeds: [{ nodeKey: 'n1' }, { nodeKey: 'n1' }],
      candidateNodeKeys: ['n1'],
    })).rejects.toThrow('ATLAS_PAGERANK_DUPLICATE_SEED:n1');
  });

  it('rejects more than 512 candidate node keys before transport', async () => {
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    await expect(client.pagerank({
      graphRevision: 'g1',
      candidateNodeKeys: Array.from({ length: 513 }, (_, index) => `n${index}`),
    })).rejects.toThrow('ATLAS_PAGERANK_TOO_MANY_CANDIDATES:513');
  });

  it('sends revision-qualified bounded defaults', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.graphRevision).toBe('g-339');
      expect(body.alpha).toBe(0.85);
      expect(body.tol).toBe(1e-6);
      expect(body.maxIter).toBe(100);
      expect(body.candidateNodeKeys).toEqual(['n1', 'n2']);
      return new Response(JSON.stringify({
        schema: 'atlas.graph-pagerank-receipt.v1',
        operation: 'personalized_pagerank',
        backend: 'cugraph.pagerank',
        algorithmRevision: 'atlas.cugraph-pagerank.v1',
        graphRevision: 'g-339',
        projectionRevision: 'p1',
        nodeTableHash: 'n',
        edgeTableHash: 'e',
        seedChecksum: 's',
        seedCount: 1,
        candidateFilterCount: 2,
        alpha: 0.85,
        tol: 1e-6,
        maxIter: 100,
        didConverge: true,
        precomputedOutWeight: true,
        cacheHit: false,
        nodeCount: 2,
        edgeCount: 1,
        results: [],
        timings: { kernelMs: 1, resultSelectMs: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createAtlasRapidsPageRankClient('http://127.0.0.1:8098');
    const receipt = await client.pagerank({
      graphRevision: 'g-339',
      seeds: [{ nodeKey: 'n1' }],
      candidateNodeKeys: ['n1', 'n2'],
      topK: 2,
    });
    expect(receipt.graphRevision).toBe('g-339');
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
