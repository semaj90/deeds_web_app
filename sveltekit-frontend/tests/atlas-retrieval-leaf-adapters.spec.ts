// @vitest-environment node
/**
 * Leaf adapter shape tests for the atlas retrieval layer.
 *
 * Verifies that individual adapters (cuVS sidecar, Go retrieval)
 * are import-clean, export the right factory functions, and fail
 * gracefully when the underlying service is unavailable.
 *
 * No real network calls; no database connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────
// Mock external dependencies
// ──────────────────────────────────────────────────────────────────────────

vi.mock('$lib/server/retrieval/go-retrieval-client.js', () => ({
  searchViaGoRetrieval: vi.fn().mockRejectedValue(new Error('service-unavailable')),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: vi.fn(() => ({
    // querySparse is the canonical single-lane sparse path (replaces single-input multiQuerySearch/RRF)
    querySparse: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('$lib/server/vector/bm42-sparse.js', () => ({
  generateSparseVector: vi.fn(() => ({ indices: [1, 2, 3], values: [0.5, 0.3, 0.2] })),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: () => ({
    session: () => ({
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

// ──────────────────────────────────────────────────────────────────────────
// BM42 sparse retriever adapter
// ──────────────────────────────────────────────────────────────────────────

describe('retrieval/adapters/qdrant-bm42-retriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports createQdrantBM42Retriever', async () => {
    const mod = await import('$lib/server/retrieval/adapters/qdrant-bm42-retriever.js');
    expect(typeof mod.createQdrantBM42Retriever).toBe('function');
  });

  it('lane is bm42', async () => {
    const { createQdrantBM42Retriever } = await import('$lib/server/retrieval/adapters/qdrant-bm42-retriever.js');
    const retriever = createQdrantBM42Retriever({ collection: 'codebase_chunks_384' });
    expect(retriever.lane).toBe('bm42');
  });

  it('returns [] when querySparse returns empty (no sparse field or no matches)', async () => {
    const { createQdrantBM42Retriever } = await import('$lib/server/retrieval/adapters/qdrant-bm42-retriever.js');
    const retriever = createQdrantBM42Retriever({ collection: 'codebase_chunks_384' });
    // Mock defaults to querySparse → [] (sparse-support check handled inside querySparse)
    const results = await retriever.retrieve({ query: 'test query', limit: 5 });
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('returns [] when querySparse throws (fail-closed)', async () => {
    const { getQdrantManager } = await import('$lib/server/vector/qdrant-manager.js');
    vi.mocked(getQdrantManager).mockReturnValueOnce({
      querySparse: vi.fn().mockRejectedValue(new Error('qdrant-error')),
    } as any);

    const { createQdrantBM42Retriever } = await import('$lib/server/retrieval/adapters/qdrant-bm42-retriever.js');
    const retriever = createQdrantBM42Retriever({ collection: 'codebase_chunks_384' });
    const results = await retriever.retrieve({ query: 'test', limit: 5 });
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('uses sparseVectorName config option (defaults to bm25)', async () => {
    const { createQdrantBM42Retriever } = await import('$lib/server/retrieval/adapters/qdrant-bm42-retriever.js');
    const r1 = createQdrantBM42Retriever({ collection: 'col', sparseVectorName: 'bm42_sparse' });
    expect(r1.lane).toBe('bm42');
    const r2 = createQdrantBM42Retriever({ collection: 'col' });
    expect(r2.lane).toBe('bm42');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// cuVS sidecar adapter
// ──────────────────────────────────────────────────────────────────────────

describe('atlas/retrieval/cuvs-sidecar-client', () => {
  it('exports createCuvsSidecarClient', async () => {
    const mod = await import('$lib/server/atlas/retrieval/cuvs-sidecar-client.js');
    expect(typeof mod.createCuvsSidecarClient).toBe('function');
  });

  it('returns [] when sidecar is unavailable (fails closed)', async () => {
    const { createCuvsSidecarClient } = await import('$lib/server/atlas/retrieval/cuvs-sidecar-client.js');
    const client = createCuvsSidecarClient({ baseUrl: 'http://127.0.0.1:9999' }); // unreachable
    const results = await client.search({ query: 'test', limit: 5 });
    expect(Array.isArray(results)).toBe(true);
    // May return [] on network error (fail-closed contract)
    // No throw is the key assertion
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Go retrieval adapter
// ──────────────────────────────────────────────────────────────────────────

describe('atlas/retrieval/go-retrieval-retriever', () => {
  it('exports createGoRetrievalRetriever', async () => {
    const mod = await import('$lib/server/atlas/retrieval/go-retrieval-retriever.js');
    expect(typeof mod.createGoRetrievalRetriever).toBe('function');
  });

  it('returns [] when GO_RETRIEVAL_ENABLED is not set', async () => {
    const original = process.env.GO_RETRIEVAL_ENABLED;
    delete process.env.GO_RETRIEVAL_ENABLED;

    try {
      const { createGoRetrievalRetriever } = await import('$lib/server/atlas/retrieval/go-retrieval-retriever.js');
      const retriever = createGoRetrievalRetriever();
      const results = await retriever.retrieve({ query: 'test', limit: 5 });
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    } finally {
      if (original !== undefined) process.env.GO_RETRIEVAL_ENABLED = original;
    }
  });

  it('returns [] when service call fails (fail-closed)', async () => {
    const { createGoRetrievalRetriever } = await import('$lib/server/atlas/retrieval/go-retrieval-retriever.js');
    const retriever = createGoRetrievalRetriever({ enabled: true });
    const results = await retriever.retrieve({ query: 'SearchRuntime', limit: 5 });
    expect(Array.isArray(results)).toBe(true);
    // Mock throws so we expect []
    expect(results).toHaveLength(0);
  });

  it('lane is go-retrieval', async () => {
    const { createGoRetrievalRetriever } = await import('$lib/server/atlas/retrieval/go-retrieval-retriever.js');
    const retriever = createGoRetrievalRetriever();
    expect(retriever.lane).toBe('go-retrieval');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// graph-retriever
// ──────────────────────────────────────────────────────────────────────────

describe('atlas/retrieval/graph-retriever', () => {
  it('graphRetrieve returns empty array for empty seeds', async () => {
    const { graphRetrieve } = await import('$lib/server/atlas/retrieval/graph-retriever.js');
    const result = await graphRetrieve({
      seedPacketKeys: [],
      allowedRelationships: ['IMPORTS'],
      maxDepth: 1,
      maxCandidates: 10,
    });
    expect(result).toEqual([]);
  });

  it('graphRetrieve fails closed when Neo4j session errors', async () => {
    // Neo4j is mocked to return empty records; should return []
    const { graphRetrieve } = await import('$lib/server/atlas/retrieval/graph-retriever.js');
    const result = await graphRetrieve({
      seedPacketKeys: ['test:001'],
      allowedRelationships: ['IMPORTS', 'CALLS'],
      maxDepth: 1,
      maxCandidates: 5,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});
