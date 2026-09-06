import { afterEach, describe, expect, it, vi } from 'vitest';
import { QdrantLane } from './search-lanes.js';

describe('Qdrant named-vector query contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the content vector for the live multi-vector 768 collection', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith('/collections/codebase_chunks_768')) {
        return new Response(JSON.stringify({ result: { status: 'green' } }), { status: 200 });
      }

      if (url.endsWith('/collections/codebase_chunks_768/points/query')) {
        return new Response(JSON.stringify({ result: { points: [] }, points: [] }), { status: 200 });
      }

      return new Response('{}', { status: 404 });
    });

    const lane = new QdrantLane(
      'http://qdrant.test',
      'codebase_chunks_768',
      768,
      'dense_768',
      1000,
    );

    await expect(lane.search({
      queryText: 'authentication session',
      queryVector: new Float32Array(768).fill(0.1),
      topK: 3,
    })).resolves.toEqual([]);

    const queryRequest = requests.find((request) => request.url.endsWith('/points/query'));
    expect(queryRequest).toBeDefined();
    const body = JSON.parse(String(queryRequest?.init?.body));
    expect(body).toMatchObject({
      using: 'content',
      limit: 3,
      with_payload: true,
      with_vector: false,
    });
    expect(body.query).toHaveLength(768);
  });
});
