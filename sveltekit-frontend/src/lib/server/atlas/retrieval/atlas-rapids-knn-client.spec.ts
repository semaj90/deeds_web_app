import { describe, expect, it, vi } from 'vitest';
// See atlas-rapids-knn-client.ts note: this client operates on the native
// 768-dim native semantic representation, matching the active canonical lane.
import { ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION as SEMANTIC_DIMENSION } from './qdrant-semantic-projection.js';
import { createAtlasRapidsKnnClient, type AtlasKnnRequest } from './atlas-rapids-knn-client.js';

const request: AtlasKnnRequest = {
  vector: Array.from({ length: SEMANTIC_DIMENSION }, (_, i) => i / SEMANTIC_DIMENSION),
  representationId: 'semantic_768',
  dimension: SEMANTIC_DIMENSION,
  corpus: [
    { packetKey: 'packet:a', sourceRevision: 'src-r1', symbolVersionId: 'sym:a', vector: Array(SEMANTIC_DIMENSION).fill(0) },
    { packetKey: 'packet:b', sourceRevision: 'src-r1', symbolVersionId: 'sym:b', vector: Array(SEMANTIC_DIMENSION).fill(1) },
  ],
  topK: 1,
};

describe('Atlas RAPIDS KNN client', () => {
  it('sends the canonical semantic_768 request to exact KNN', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      operation: 'knn.exact', backend: 'cuvs.brute_force', representationId: 'semantic_768', dimension: 768,
      results: [{ rank: 1, packetKey: 'packet:a', sourceRevision: 'src-r1', distance: 0.1 }], corpusRows: 2, durationMs: 1, truncated: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await createAtlasRapidsKnnClient('http://127.0.0.1:8098').exact(request);
    expect(result.results[0]?.packetKey).toBe('packet:a');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8098/v1/knn/exact');
    fetchMock.mockRestore();
  });

  it('rejects non-768 or missing canonical corpus identity before network I/O', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(createAtlasRapidsKnnClient().cagra({ ...request, corpus: [{ ...request.corpus[0], packetKey: '' }, request.corpus[1]] })).rejects.toThrow('CANONICAL_IDENTITY_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
