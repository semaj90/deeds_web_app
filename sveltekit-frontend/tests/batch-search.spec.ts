// @vitest-environment node

/**
 * P2.2 — Batch search contract tests.
 *
 * All hermetic: QdrantManager is mocked. No network calls.
 *
 * Covers:
 *  - Empty query array returns immediately with empty results
 *  - Output array length always equals input array length
 *  - Each result set is isolated (query A results don't leak into query B)
 *  - A failing sub-query returns [] rather than throwing
 *  - nativeBatch=false when client has no batchQuery method
 *  - HNSW ef params are forwarded to each search call
 *  - batchSearch with efProfile='interactive' uses ef=64
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock QdrantManager
// ---------------------------------------------------------------------------

const mockSearch = vi.fn();

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: () => ({
    client: { search: mockSearch },
    // No batchQuery → forces Promise.all fallback path
  }),
}));

import { batchSearch } from '../src/lib/server/retrieval/batch-search.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVector(seed = 0.1): number[] {
  return new Array(384).fill(seed);
}

function makeRawResult(id: number, score: number) {
  return { id, score, payload: { packet_key: `pk:${id}` } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('batchSearch — empty input', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty results without calling search', async () => {
    const response = await batchSearch('codebase_chunks_384_hybrid', []);

    expect(response.results).toHaveLength(0);
    expect(response.durationMs).toBe(0);
    expect(response.nativeBatch).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe('batchSearch — single query', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns one result set matching the single query', async () => {
    mockSearch.mockResolvedValue([
      makeRawResult(1, 0.95),
      makeRawResult(2, 0.88),
    ]);

    const response = await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector() },
    ]);

    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toHaveLength(2);
    expect(response.results[0]![0]!.score).toBe(0.95);
    expect(response.results[0]![1]!.id).toBe(2);
    expect(response.nativeBatch).toBe(false);
  });
});

describe('batchSearch — multiple queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('output length equals input length', async () => {
    mockSearch
      .mockResolvedValueOnce([makeRawResult(1, 0.9)])
      .mockResolvedValueOnce([makeRawResult(2, 0.8)])
      .mockResolvedValueOnce([makeRawResult(3, 0.7)]);

    const response = await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector(0.1) },
      { vector: makeVector(0.2) },
      { vector: makeVector(0.3) },
    ]);

    expect(response.results).toHaveLength(3);
    expect(mockSearch).toHaveBeenCalledTimes(3);
  });

  it('result sets are isolated — each query gets its own results', async () => {
    mockSearch
      .mockResolvedValueOnce([makeRawResult(10, 0.95), makeRawResult(11, 0.90)])
      .mockResolvedValueOnce([makeRawResult(20, 0.85)]);

    const response = await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector(0.1) },
      { vector: makeVector(0.2) },
    ]);

    expect(response.results[0]).toHaveLength(2);
    expect(response.results[0]![0]!.id).toBe(10);
    expect(response.results[1]).toHaveLength(1);
    expect(response.results[1]![0]!.id).toBe(20);
  });

  it('a failing sub-query returns [] and does not throw', async () => {
    mockSearch
      .mockResolvedValueOnce([makeRawResult(1, 0.9)])
      .mockRejectedValueOnce(new Error('connection timeout'))
      .mockResolvedValueOnce([makeRawResult(3, 0.7)]);

    const response = await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector(0.1) },
      { vector: makeVector(0.2) },
      { vector: makeVector(0.3) },
    ]);

    expect(response.results).toHaveLength(3);
    expect(response.results[0]).toHaveLength(1);
    expect(response.results[1]).toHaveLength(0); // failed → []
    expect(response.results[2]).toHaveLength(1);
  });
});

describe('batchSearch — HNSW ef forwarding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes params.hnsw_ef to each search call', async () => {
    mockSearch.mockResolvedValue([]);

    await batchSearch(
      'codebase_chunks_384_hybrid',
      [{ vector: makeVector(), limit: 10 }],
      'balanced',
    );

    expect(mockSearch).toHaveBeenCalledOnce();
    const [, searchReq] = mockSearch.mock.calls[0]!;
    expect(searchReq.params?.hnsw_ef).toBe(128);
  });

  it('interactive profile sets hnsw_ef=64', async () => {
    mockSearch.mockResolvedValue([]);

    await batchSearch(
      'codebase_chunks_384_hybrid',
      [{ vector: makeVector(), limit: 5 }],
      'interactive',
    );

    const [, searchReq] = mockSearch.mock.calls[0]!;
    expect(searchReq.params?.hnsw_ef).toBe(64);
  });

  it('thorough profile sets hnsw_ef=256', async () => {
    mockSearch.mockResolvedValue([]);

    await batchSearch(
      'codebase_chunks_384_hybrid',
      [{ vector: makeVector(), limit: 100 }],
      'thorough',
    );

    const [, searchReq] = mockSearch.mock.calls[0]!;
    expect(searchReq.params?.hnsw_ef).toBe(256);
  });

  it('infers thorough when limit > 50 and no profile specified', async () => {
    mockSearch.mockResolvedValue([]);

    await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector(), limit: 100 },
    ]);

    const [, searchReq] = mockSearch.mock.calls[0]!;
    expect(searchReq.params?.hnsw_ef).toBe(256);
  });
});

describe('batchSearch — payload shape', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps raw results to { id, score, payload }', async () => {
    mockSearch.mockResolvedValue([
      { id: 42, score: 0.77, payload: { packet_key: 'ace:packet:auth:001', source_ref: 'src/auth.ts' } },
    ]);

    const response = await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector() },
    ]);

    expect(response.results[0]![0]).toStrictEqual({
      id: 42,
      score: 0.77,
      payload: { packet_key: 'ace:packet:auth:001', source_ref: 'src/auth.ts' },
    });
  });

  it('handles null payload gracefully', async () => {
    mockSearch.mockResolvedValue([{ id: 1, score: 0.5, payload: null }]);

    const response = await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector() },
    ]);

    expect(response.results[0]![0]!.payload).toBeNull();
  });

  it('uses named vector when vectorName is provided', async () => {
    mockSearch.mockResolvedValue([]);

    await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector(), vectorName: 'content' },
    ]);

    const [, searchReq] = mockSearch.mock.calls[0]!;
    expect(searchReq.vector).toEqual({ name: 'content', vector: makeVector() });
  });

  it('uses raw array vector when vectorName is absent', async () => {
    mockSearch.mockResolvedValue([]);

    await batchSearch('codebase_chunks_384_hybrid', [
      { vector: makeVector() },
    ]);

    const [, searchReq] = mockSearch.mock.calls[0]!;
    expect(Array.isArray(searchReq.vector)).toBe(true);
  });
});
