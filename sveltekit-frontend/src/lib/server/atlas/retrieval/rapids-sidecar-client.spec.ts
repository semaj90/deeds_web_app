// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    ATLAS_RAPIDS_SIDECAR_URL: 'http://127.0.0.1:9998/',
  },
  privateEnv: {},
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('atlas/retrieval/rapids-sidecar-client', () => {
  it('normalizes the resolved base URL', async () => {
    const { createRapidsSidecarClient } = await import('$lib/server/atlas/retrieval/rapids-sidecar-client.js');
    const client = createRapidsSidecarClient();
    expect(client.baseUrl).toBe('http://127.0.0.1:9998');
  });

  it('reads /health and /v1/capabilities from the sidecar', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'ok',
            gpu: { available: true, device_name: 'RTX 3060 Ti' },
            packages: { cuvs: { available: true, version: '26.06.00' } },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/v1/capabilities')) {
        return new Response(
          JSON.stringify({
            sidecar_version: '0.2.0',
            schema_version: 1,
            operations: [
              { op: 'knn.exact', status: 'RUNTIME_SMOKE_PROVEN', backend: 'cuvs.brute_force' },
              { op: 'knn.cagra', status: 'RUNTIME_SMOKE_PROVEN', backend: 'cuvs.cagra' },
            ],
            gpu_memory: { free_mb: 1234.5 },
            row_identity_contract: 'packetKey+sourceRevision',
            timestamp: 1700000000000,
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { createRapidsSidecarClient } = await import('$lib/server/atlas/retrieval/rapids-sidecar-client.js');
    const client = createRapidsSidecarClient('http://127.0.0.1:9998/');

    await expect(client.health()).resolves.toMatchObject({
      status: 'ok',
      gpu: { available: true, device_name: 'RTX 3060 Ti' },
    });

    await expect(client.capabilities()).resolves.toMatchObject({
      sidecar_version: '0.2.0',
      operations: [
        { op: 'knn.exact', status: 'RUNTIME_SMOKE_PROVEN', backend: 'cuvs.brute_force' },
        { op: 'knn.cagra', status: 'RUNTIME_SMOKE_PROVEN', backend: 'cuvs.cagra' },
      ],
      row_identity_contract: 'packetKey+sourceRevision',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('posts exact and CAGRA requests with the bounded identity manifest', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push({ url, body });

      if (url.endsWith('/v1/knn/exact')) {
        return new Response(
          JSON.stringify({
            operation: 'knn.exact',
            backend: 'cuvs.brute_force',
            representationId: 'semantic_768',
            dimension: 768,
            results: [
              { rank: 1, packetKey: 'packet-a', sourceRevision: 'rev-1', symbolVersionId: 'sym-a', distance: 0 },
            ],
            corpusRows: 1,
            gpuMemoryBeforeMb: 4096,
            gpuMemoryAfterMb: 4088,
            durationMs: 12.5,
            truncated: false,
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/v1/knn/cagra')) {
        return new Response(
          JSON.stringify({
            operation: 'knn.cagra',
            backend: 'cuvs.cagra',
            representationId: 'semantic_768',
            dimension: 768,
            results: [
              { rank: 1, packetKey: 'packet-a', sourceRevision: 'rev-1', symbolVersionId: 'sym-a', distance: 0 },
            ],
            corpusRows: 1,
            gpuMemoryBeforeMb: 4096,
            gpuMemoryAfterMb: 4087,
            durationMs: 11.25,
            truncated: false,
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { createRapidsSidecarClient } = await import('$lib/server/atlas/retrieval/rapids-sidecar-client.js');
    const client = createRapidsSidecarClient('http://127.0.0.1:9998');

    const queryVector = Array.from({ length: 768 }, (_, index) => (index === 1 ? 1 : 0));
    const corpusVector = Array.from({ length: 768 }, (_, index) => (index === 1 ? 1 : 0));
    const request = {
      query: {
        vector: queryVector,
        representationId: 'semantic_768',
        dimension: 768,
      },
      corpus: [
        {
          packetKey: 'packet-a',
          sourceRevision: 'rev-1',
          symbolVersionId: 'sym-a',
          vector: corpusVector,
        },
      ],
      topK: 1,
      deadlineMs: 10_000,
    };

    const exact = await client.knnExact(request);
    const cagra = await client.knnCagra(request);

    expect(exact).toMatchObject({
      operation: 'knn.exact',
      backend: 'cuvs.brute_force',
      representationId: 'semantic_768',
      dimension: 768,
      results: [
        { rank: 1, packetKey: 'packet-a', sourceRevision: 'rev-1', symbolVersionId: 'sym-a', distance: 0 },
      ],
    });
    expect(cagra).toMatchObject({
      operation: 'knn.cagra',
      backend: 'cuvs.cagra',
      representationId: 'semantic_768',
      dimension: 768,
      results: [
        { rank: 1, packetKey: 'packet-a', sourceRevision: 'rev-1', symbolVersionId: 'sym-a', distance: 0 },
      ],
    });

    expect(requests[0]?.url).toContain('/v1/knn/exact');
    expect(requests[1]?.url).toContain('/v1/knn/cagra');
    expect(requests[0]?.body).toMatchObject({
      topK: 1,
      deadlineMs: 10_000,
      query: {
        representationId: 'semantic_768',
        dimension: 768,
      },
      corpus: [
        {
          packetKey: 'packet-a',
          sourceRevision: 'rev-1',
          symbolVersionId: 'sym-a',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
