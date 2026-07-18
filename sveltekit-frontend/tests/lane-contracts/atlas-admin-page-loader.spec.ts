import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_CHAT_MODEL: 'gemma4-legal-vlm:latest',
    OLLAMA_EMBED_MODEL: 'embeddinggemma:latest',
  },
}));

const { load } = await import('../../src/routes/(app)/admin/atlas/+page.server.js');

describe('admin atlas page server load', () => {
  it('includes the runtime registry in page data', async () => {
    const responseMap = new Map<string, Response>([
      [
        '/api/admin/atlas/health',
        Response.json({
          ok: true,
          timestamp: '2026-07-17T00:00:00.000Z',
          redis: { ok: true, latencyMs: 1 },
          qdrant: { ok: true, latencyMs: 2, points: { codebase_chunks_768: 12 } },
          neo4j: { ok: true, latencyMs: 3 },
          ollama: { ok: true, latencyMs: 4, models: [] },
        }),
      ],
      [
        '/api/admin/atlas/runtime-registry',
        Response.json({
          version: 'atlas-runtime-registry-v1',
          adminPath: '/admin/atlas',
          searchPath: '/api/admin/atlas/registry/search',
          sections: [
            {
              id: 'contract',
              title: 'Contract Registry',
              owner: 'atlas-contracts',
              status: 'active',
              adminPath: '/admin/atlas',
              searchPath: '/api/admin/atlas/registry/search',
              notes: 'frozen contracts',
              items: [],
            },
          ],
        }),
      ],
      [
        '/api/admin/cache-stats',
        Response.json({
          timestamp: '2026-07-17T00:00:00.000Z',
          l1_redis: {
            totalKeys: 1,
            llmCacheKeys: 0,
            memoryMB: '1.00',
            usedMemoryMB: '0.50',
            hitRate: '0.00',
            keyspaceHits: 0,
            keyspaceMisses: 0,
          },
        }),
      ],
    ]);

    const data = await load({
      locals: { user: { role: 'admin' } },
      url: new URL('http://localhost/admin/atlas'),
      fetch: async (input: RequestInfo | URL) => {
        const key = typeof input === 'string' ? input : input.toString();
        const response = responseMap.get(key);
        if (!response) throw new Error(`unexpected fetch: ${key}`);
        return response.clone();
      },
    } as Parameters<typeof load>[0]);

    expect(data.runtimeRegistry?.version).toBe('atlas-runtime-registry-v1');
    expect(data.runtimeRegistry?.sections[0].id).toBe('contract');
    expect(data.health).not.toBeNull();
    expect(data.cacheStats).not.toBeNull();
  });
});
