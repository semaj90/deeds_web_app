import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    QDRANT_URL: 'http://127.0.0.1:6333',
  },
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: vi.fn(() => ({
    getCollections: vi.fn(),
    client: {
      getCollection: vi.fn(),
    },
  })),
}));

describe('rrf split', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('imports search runtime and rrf integration without infra side effects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');

    const start = performance.now();
    await import('../search-runtime.js');
    await import('../rrf-integration.js');
    const elapsed = performance.now() - start;

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(intervalSpy).not.toHaveBeenCalled();
    expect(elapsed).toBeLessThan(3000);
  });

  it('fuses lane results with the pure RRF core', async () => {
    const { reciprocalRankFusion } = await import('../rrf-fuse.js');

    const fused = reciprocalRankFusion(
      [
        {
          lane: 'bm42',
          status: 'ok',
          latencyMs: 5,
          hits: [
            { packetKey: 'packet-a', lane: 'bm42', rank: 1, rawScore: 0.91 },
            { packetKey: 'packet-b', lane: 'bm42', rank: 2, rawScore: 0.74 },
          ],
        },
        {
          lane: 'dense_768',
          status: 'ok',
          latencyMs: 7,
          hits: [
            { packetKey: 'packet-b', lane: 'dense_768', rank: 1, rawScore: 0.88 },
            { packetKey: 'packet-a', lane: 'dense_768', rank: 2, rawScore: 0.77 },
          ],
        },
      ],
      { bm42: 1, dense_768: 1 },
      60,
      10,
    );

    expect(fused).toHaveLength(2);
    expect(fused[0]?.packetKey).toBe('packet-a');
    expect(fused[0]?.sources).toHaveLength(2);
    expect(fused[0]?.fusionScore).toBeGreaterThan(0);
  });
});
