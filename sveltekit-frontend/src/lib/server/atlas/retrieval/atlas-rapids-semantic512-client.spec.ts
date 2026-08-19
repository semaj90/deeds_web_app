import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtlasRapidsSemantic512Client } from './atlas-rapids-semantic512-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Atlas semantic_512 exact client v2', () => {
  it('admits packet-qualified rows without fabricating sourceRevision', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.corpus[0].packetKey).toBe('packet-1');
      expect(body.corpus[0].sourceRevision).toBeUndefined();
      return new Response(JSON.stringify({
        schema: 'atlas.semantic512-exact-knn-receipt.v1',
        operation: 'knn.exact',
        backend: 'cuvs.neighbors.brute_force',
        metric: 'cosine',
        algorithmRevision: 'atlas.cuvs-exact-cosine.semantic512.v2-mutation-aware',
        identityRequirement: 'packet_key',
        sourceFreshnessAuthority: 'external-mutation-awareness-receipt',
        representationId: 'semantic_512',
        representationRevision: '109',
        dimension: 512,
        corpusRows: 1,
        topK: 1,
        identityManifestChecksum: 'abc',
        durationMs: 1,
        results: [{
          rank: 1,
          rowIndex: 0,
          packetKey: 'packet-1',
          sourceRevision: null,
          sourceRef: 'src/lib/a.ts',
          symbolVersionId: null,
          treeNodeId: null,
          featureLabel: null,
          cosineDistance: 0,
          cosineSimilarity: 1,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createAtlasRapidsSemantic512Client('http://127.0.0.1:8098');
    const receipt = await client.exactKnn({
      query: {
        vector: Array(512).fill(0).map((_, index) => index === 0 ? 1 : 0),
        representationId: 'semantic_512',
        representationRevision: '109',
      },
      corpus: [{
        packetKey: 'packet-1',
        sourceRef: 'src/lib/a.ts',
        vector: Array(512).fill(0).map((_, index) => index === 0 ? 1 : 0),
      }],
      topK: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8098/v1/semantic512/knn/exact-v2',
      expect.any(Object),
    );
    expect(receipt.identityRequirement).toBe('packet_key');
    expect(receipt.sourceFreshnessAuthority).toBe('external-mutation-awareness-receipt');
  });

  it('still rejects duplicate packet identity', async () => {
    const client = createAtlasRapidsSemantic512Client('http://127.0.0.1:8098');
    const vector = Array(512).fill(0).map((_, index) => index === 0 ? 1 : 0);
    await expect(client.exactKnn({
      query: { vector, representationId: 'semantic_512', representationRevision: '109' },
      corpus: [
        { packetKey: 'same', vector },
        { packetKey: 'same', vector },
      ],
      topK: 1,
    })).rejects.toThrow(/DUPLICATE_IDENTITY/);
  });
});
