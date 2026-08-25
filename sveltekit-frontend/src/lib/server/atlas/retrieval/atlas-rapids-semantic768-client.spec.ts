import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtlasRapidsSemantic768Client } from './atlas-rapids-semantic768-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A unit vector in 768-dim: 1 at `hotIndex`, 0 elsewhere. */
function unitVector(hotIndex: number): number[] {
  return Array(768).fill(0).map((_, i) => (i === hotIndex ? 1 : 0));
}

describe('Atlas semantic_768 exact client', () => {
  it('calls the real /v1/knn/exact endpoint, not a fictional semantic768-specific route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      operation: 'knn.exact',
      backend: 'cuvs.brute_force',
      representationId: 'semantic_768',
      dimension: 768,
      corpusRows: 1,
      gpuMemoryBeforeMb: 1000,
      gpuMemoryAfterMb: 998,
      durationMs: 1.5,
      truncated: false,
      results: [{
        rank: 1,
        packetKey: 'packet-1',
        sourceRevision: 'rev-1',
        symbolVersionId: null,
        distance: 0,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    const receipt = await client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'packet-1', sourceRevision: 'rev-1', vector: unitVector(0) }],
      topK: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8098/v1/knn/exact',
      expect.any(Object),
    );
    expect(receipt.schema).toBe('atlas.semantic768-exact-knn-receipt.v1');
    expect(receipt.backend).toBe('cuvs.brute_force');
  });

  it('derives cosineSimilarity=1 from sqeuclideanDistance=0 for identical unit vectors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      operation: 'knn.exact', backend: 'cuvs.brute_force', representationId: 'semantic_768', dimension: 768,
      corpusRows: 1, gpuMemoryBeforeMb: null, gpuMemoryAfterMb: null, durationMs: 1, truncated: false,
      results: [{ rank: 1, packetKey: 'p1', sourceRevision: 'r1', symbolVersionId: null, distance: 0 }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    const receipt = await client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unitVector(0) }],
      topK: 1,
    });
    expect(receipt.results[0].sqeuclideanDistance).toBe(0);
    expect(receipt.results[0].cosineSimilarity).toBe(1);
  });

  it('derives cosineSimilarity=0 from sqeuclideanDistance=2 for orthogonal unit vectors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      operation: 'knn.exact', backend: 'cuvs.brute_force', representationId: 'semantic_768', dimension: 768,
      corpusRows: 1, gpuMemoryBeforeMb: null, gpuMemoryAfterMb: null, durationMs: 1, truncated: false,
      results: [{ rank: 1, packetKey: 'p1', sourceRevision: 'r1', symbolVersionId: null, distance: 2 }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    const receipt = await client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unitVector(1) }],
      topK: 1,
    });
    expect(receipt.results[0].cosineSimilarity).toBe(0);
  });

  it('fails closed on a non-unit-normalized query vector — does not silently send it', async () => {
    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    const unnormalized = Array(768).fill(0);
    unnormalized[0] = 5; // norm = 5, not 1
    await expect(client.exactKnn({
      query: { vector: unnormalized, representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unitVector(0) }],
      topK: 1,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_NOT_L2_NORMALIZED:query/);
  });

  it('fails closed on a non-unit-normalized corpus vector', async () => {
    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    const unnormalized = Array(768).fill(0);
    unnormalized[0] = 0.5; // norm = 0.5, not 1
    await expect(client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unnormalized }],
      topK: 1,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_NOT_L2_NORMALIZED:corpus\[0\]/);
  });

  it('rejects wrong-dimension vectors', async () => {
    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    await expect(client.exactKnn({
      query: { vector: Array(512).fill(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unitVector(0) }],
      topK: 1,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_QUERY_DIMENSION/);
  });

  it('rejects a corpus row missing sourceRevision — the sidecar requires it, never fabricated', async () => {
    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    await expect(client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: '', vector: unitVector(0) }],
      topK: 1,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_REVISION_IDENTITY/);
  });

  it('rejects duplicate (packetKey, sourceRevision) identity', async () => {
    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    await expect(client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [
        { packetKey: 'same', sourceRevision: 'r1', vector: unitVector(0) },
        { packetKey: 'same', sourceRevision: 'r1', vector: unitVector(1) },
      ],
      topK: 1,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_DUPLICATE_IDENTITY/);
  });

  it('rejects topK outside [1, corpus length]', async () => {
    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    await expect(client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unitVector(0) }],
      topK: 0,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_TOPK/);
  });

  it('surfaces a non-2xx sidecar response as an error rather than swallowing it', async () => {
    const fetchMock = vi.fn(async () => new Response('GPU unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createAtlasRapidsSemantic768Client('http://127.0.0.1:8098');
    await expect(client.exactKnn({
      query: { vector: unitVector(0), representationId: 'semantic_768' },
      corpus: [{ packetKey: 'p1', sourceRevision: 'r1', vector: unitVector(0) }],
      topK: 1,
    })).rejects.toThrow(/ATLAS_SEMANTIC768_HTTP_503/);
  });
});
