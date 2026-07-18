// @vitest-environment node
/**
 * Atlas skeleton smoke tests.
 *
 * Verifies that the Atlas adapter layer files exist and export the
 * expected symbols — no database, no HTTP, no GPU calls.
 * These tests are import-shape guards, not integration tests.
 */

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────
// Module-level mocks (hoisted so they run before dynamic imports)
// ──────────────────────────────────────────────────────────────────────────

vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: () => ({
    session: () => ({
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

vi.mock('$lib/server/retrieval/search-runtime.js', () => ({
  SearchRuntime: class {
    search = vi.fn().mockResolvedValue({
      packets: [],
      metadata: { query: '', topK: 10, totalCandidates: 0, fusionMethod: 'rrf' },
      provenance: {},
    });
  },
}));

vi.mock('$lib/server/retrieval/canonical-rerank-executor.js', () => ({
  MixedbreadCanonicalReranker: class {
    rerank = vi.fn().mockResolvedValue({
      ranked: [],
      provenance: { modelVersion: 'mock', rankingStage: 'deterministic', crossEncoderAttempted: false, crossEncoderUsed: false },
    });
  },
}));

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('atlas/retrieval/graph-retriever', () => {
  it('exports graphRetrieve and createGraphRetriever', async () => {
    const mod = await import('$lib/server/atlas/retrieval/graph-retriever.js');
    expect(typeof mod.graphRetrieve).toBe('function');
    expect(typeof mod.createGraphRetriever).toBe('function');
  });
});

describe('atlas/retrieval/search-runtime-adapter', () => {
  it('exports createAtlasSearchAdapter', async () => {
    const mod = await import('$lib/server/atlas/retrieval/search-runtime-adapter.js');
    expect(typeof mod.createAtlasSearchAdapter).toBe('function');
  });

  it('createAtlasSearchAdapter returns an object with a search method', async () => {
    const { createAtlasSearchAdapter } = await import('$lib/server/atlas/retrieval/search-runtime-adapter.js');
    const adapter = createAtlasSearchAdapter();
    expect(typeof adapter.search).toBe('function');
  });

  it('search resolves with packets, topPacketKeys, metadata, provenance', async () => {
    const { createAtlasSearchAdapter } = await import('$lib/server/atlas/retrieval/search-runtime-adapter.js');
    const adapter = createAtlasSearchAdapter();
    const result = await adapter.search({ query: 'test', topK: 5 });
    expect(result).toHaveProperty('packets');
    expect(result).toHaveProperty('topPacketKeys');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('provenance');
    expect(Array.isArray(result.packets)).toBe(true);
    expect(Array.isArray(result.topPacketKeys)).toBe(true);
  });

  it('does not include graphExpanded when withGraphExpansion is false', async () => {
    const { createAtlasSearchAdapter } = await import('$lib/server/atlas/retrieval/search-runtime-adapter.js');
    const adapter = createAtlasSearchAdapter();
    const result = await adapter.search({ query: 'test', withGraphExpansion: false });
    expect(result.graphExpanded).toBeUndefined();
  });
});

describe('atlas/ranking/index', () => {
  it('exports createAtlasReranker and createDisabledAtlasReranker', async () => {
    const mod = await import('$lib/server/atlas/ranking/index.js');
    expect(typeof mod.createAtlasReranker).toBe('function');
    expect(typeof mod.createDisabledAtlasReranker).toBe('function');
  });

  it('createDisabledAtlasReranker reranker resolves with ranked array and fallbackReason', async () => {
    const { createDisabledAtlasReranker } = await import('$lib/server/atlas/ranking/index.js');
    const reranker = createDisabledAtlasReranker('test-disabled');
    expect(reranker.modelVersion).toBe('disabled');

    const result = await reranker.rerank({
      query: 'what is auth',
      candidates: [
        { packetKey: 'k1', sourceRef: 'src/a.ts', score: 0.9, lane: 'dense' },
        { packetKey: 'k2', sourceRef: 'src/b.ts', score: 0.5, lane: 'bm25' },
      ],
    });
    expect(result.fallbackReason).toBe('test-disabled');
    expect(result.ranked).toHaveLength(2);
    expect(result.ranked[0].packetKey).toBe('k1'); // highest score first
    expect(result.ranked[0].rank).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('disabled reranker preserves original score order', async () => {
    const { createDisabledAtlasReranker } = await import('$lib/server/atlas/ranking/index.js');
    const reranker = createDisabledAtlasReranker('no-service');
    const result = await reranker.rerank({
      query: 'auth',
      candidates: [
        { packetKey: 'low', sourceRef: 'src/low.ts', score: 0.1, lane: 'dense' },
        { packetKey: 'high', sourceRef: 'src/high.ts', score: 0.9, lane: 'dense' },
        { packetKey: 'mid', sourceRef: 'src/mid.ts', score: 0.5, lane: 'dense' },
      ],
    });
    expect(result.ranked.map(r => r.packetKey)).toEqual(['high', 'mid', 'low']);
  });
});

describe('atlas/ranking/reranker — re-exports', () => {
  it('re-exports Reranker interface shape (checked at runtime via factory)', async () => {
    const mod = await import('$lib/server/atlas/ranking/reranker.js');
    // No runtime values — only types. Just verify the module resolves without error.
    expect(mod).toBeDefined();
  });
});
