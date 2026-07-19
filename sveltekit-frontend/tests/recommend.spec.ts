// @vitest-environment node

/**
 * P2.3 — Recommendation contract tests.
 *
 * All hermetic: QdrantManager is mocked. No network calls.
 *
 * Covers:
 *  - Happy path: returns results in { id, score, payload } shape
 *  - Positive IDs are excluded from results (belt-and-suspenders filter)
 *  - Empty positiveIds returns ok=false without calling Qdrant
 *  - Invalid positive ID (empty string / negative int) returns ok=false
 *  - Invalid negative ID returns ok=false
 *  - Qdrant failure returns ok=false with message
 *  - negativeIds forwarded in recommend request
 *  - vectorName forwarded as 'using' field
 *  - strategy forwarded; defaults to 'average_vector'
 *  - filter forwarded when provided
 *  - Returns ok=true with empty results when Qdrant returns empty array
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock QdrantManager
// ---------------------------------------------------------------------------

const mockRecommend = vi.fn();

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: () => ({
    client: { recommend: mockRecommend },
  }),
}));

import { recommend } from '../src/lib/server/retrieval/recommend.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const COLLECTION = 'codebase_chunks_384_hybrid';

function makeRaw(id: number, score: number) {
  return { id, score, payload: { packet_key: `pk:${id}` } };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('recommend — happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok=true with mapped results', async () => {
    mockRecommend.mockResolvedValue([
      makeRaw(10, 0.92),
      makeRaw(11, 0.85),
      makeRaw(12, 0.78),
    ]);

    const result = await recommend({
      collection: COLLECTION,
      positiveIds: [1],
    });

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toStrictEqual({
      id: 10,
      score: 0.92,
      payload: { packet_key: 'pk:10' },
    });
    expect(result.collection).toBe(COLLECTION);
    expect(result.positiveIds).toEqual([1]);
    expect(result.message).toMatch(/Found 3/);
  });

  it('returns ok=true with empty results when Qdrant returns []', async () => {
    mockRecommend.mockResolvedValue([]);

    const result = await recommend({ collection: COLLECTION, positiveIds: [1] });

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Positive-ID exclusion (belt-and-suspenders)
// ---------------------------------------------------------------------------

describe('recommend — positive ID exclusion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('excludes positive IDs from results even if Qdrant returns them', async () => {
    // Qdrant should never return a positive example in recommend results,
    // but we filter defensively.
    mockRecommend.mockResolvedValue([
      makeRaw(1, 1.0),  // positive ID — must be excluded
      makeRaw(5, 0.88),
      makeRaw(6, 0.77),
    ]);

    const result = await recommend({ collection: COLLECTION, positiveIds: [1] });

    expect(result.results).toHaveLength(2);
    expect(result.results.map(r => r.id)).toEqual([5, 6]);
  });

  it('excludes multiple positive IDs', async () => {
    mockRecommend.mockResolvedValue([
      makeRaw(1, 1.0),
      makeRaw(2, 0.99),
      makeRaw(7, 0.80),
    ]);

    const result = await recommend({ collection: COLLECTION, positiveIds: [1, 2] });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Validation guards
// ---------------------------------------------------------------------------

describe('recommend — input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok=false when positiveIds is empty', async () => {
    const result = await recommend({ collection: COLLECTION, positiveIds: [] });

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(result.message).toMatch(/positiveIds.*empty/i);
    expect(mockRecommend).not.toHaveBeenCalled();
  });

  it('returns ok=false for empty-string positive ID', async () => {
    const result = await recommend({ collection: COLLECTION, positiveIds: [''] });

    expect(result.ok).toBe(false);
    expect(mockRecommend).not.toHaveBeenCalled();
  });

  it('returns ok=false for negative integer positive ID', async () => {
    const result = await recommend({ collection: COLLECTION, positiveIds: [-1] });

    expect(result.ok).toBe(false);
    expect(mockRecommend).not.toHaveBeenCalled();
  });

  it('returns ok=false for invalid negative ID', async () => {
    const result = await recommend({
      collection: COLLECTION,
      positiveIds: [1],
      negativeIds: [''],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/negativeIds/i);
    expect(mockRecommend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Qdrant failure
// ---------------------------------------------------------------------------

describe('recommend — Qdrant failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok=false when recommend throws', async () => {
    mockRecommend.mockRejectedValue(new Error('collection not found'));

    const result = await recommend({ collection: COLLECTION, positiveIds: [1] });

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(result.message).toMatch(/collection not found/);
  });
});

// ---------------------------------------------------------------------------
// Request payload forwarding
// ---------------------------------------------------------------------------

describe('recommend — request payload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards negativeIds', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1], negativeIds: [99, 100] });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.negative).toEqual([99, 100]);
  });

  it('omits negative key when negativeIds is empty', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1] });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.negative).toBeUndefined();
  });

  it('forwards vectorName as "using"', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1], vectorName: 'content' });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.using).toBe('content');
  });

  it('defaults strategy to average_vector', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1] });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.strategy).toBe('average_vector');
  });

  it('forwards explicit strategy', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1], strategy: 'best_score' });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.strategy).toBe('best_score');
  });

  it('forwards filter when provided', async () => {
    mockRecommend.mockResolvedValue([]);
    const filter = { must: [{ key: 'packet_type', match: { value: 'function' } }] };

    await recommend({ collection: COLLECTION, positiveIds: [1], filter });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.filter).toStrictEqual(filter);
  });

  it('omits filter key when filter is absent', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1] });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.filter).toBeUndefined();
  });

  it('forwards limit', async () => {
    mockRecommend.mockResolvedValue([]);

    await recommend({ collection: COLLECTION, positiveIds: [1], limit: 25 });

    const req = mockRecommend.mock.calls[0]![1];
    expect(req.limit).toBe(25);
  });
});
