// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const mocks = vi.hoisted(() => ({
  generateEmbeddings: vi.fn(async () => ({ vectors: [Array.from({ length: 768 }, () => 0.01)] })),
  hybridSearch: vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'codebase_chunks_768') {
      return {
        results: [
          {
            id: 'semantic-1',
            score: 0.91,
            payload: {
              dir: 'src/lib/server/vector',
              filePath: 'src/lib/server/vector/qdrant-manager.ts',
              summary: 'Vector manager summary',
              pageRank: 0.2,
              gpuCluster: 1,
              topoClass: 'gpu',
            },
          },
        ],
      };
    }

    return {
      results: [
        {
          id: 'kag-1',
          score: 0.81,
          payload: {
            directoryPath: 'src/lib/server/wiki',
            relativePath: 'src/lib/server/wiki/wiki-mcp-service.ts',
            content: 'Wiki content body',
          },
        },
      ],
    };
  }),
  getRedis: vi.fn(() => ({
    get: vi.fn(async (key: string) => {
      if (key === 'cluster:kmeans:k20:manifold4:all') {
        return JSON.stringify([{ topoLabel: 'gpu', somRow: 1, somCol: 2 }]);
      }
      if (key === 'cluster:kmeans:k20:centroids') {
        return JSON.stringify([Array.from({ length: 768 }, () => 0.01)]);
      }
      if (key === 'wiki:note:dir:src:lib:server:vector') {
        return JSON.stringify({ summary: 'Redis wiki note' });
      }
      return null;
    }),
  })),
  readWikiCard: vi.fn(async () => ({ id: 'src/lib/server/wiki', summary: 'CouchDB wiki summary' })),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: (...args: unknown[]) => mocks.generateEmbeddings(...args),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    hybridSearch: (...args: unknown[]) => mocks.hybridSearch(...args),
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: (...args: unknown[]) => mocks.getRedis(...args),
}));

vi.mock('$lib/server/wiki/wiki-couchdb-client.js', () => ({
  readWikiCard: (...args: unknown[]) => mocks.readWikiCard(...args),
}));

describe('/api/rag/hyperrag', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes(':8099/search')) {
          return new Response(JSON.stringify({ ids: ['semantic-1'] }), { status: 200 });
        }

        if (url.includes(':3040/v1/chat/completions')) {
          return new Response(
            JSON.stringify({ choices: [{ message: { content: '- one\n- two\n- three\nNext: do the thing' } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('{}', { status: 404 });
      })
    );
  });

  it('returns a minified hyperrag packet for authenticated users', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', limit: 5 }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.packet.turbovecPrefilter).toBe(true);
    expect(body.packet.turbovecCandidates).toEqual(['semantic-1']);
    expect(body.packet.cluster.id).toBe(0);
    expect(body.packet.results).toHaveLength(2);
    expect(body.bitfrostSummary).toContain('Next: do the thing');
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval' }),
    });

    const result = await POST({ request, url: new URL(request.url), locals: {} } as any).catch((err) => err);
    expect(result.status ?? result?.statusCode).toBe(401);
  });
});
