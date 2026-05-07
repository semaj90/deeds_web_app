// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock refs (hoisted so they're available inside vi.mock factories) ─────────
const mockPipelineExec  = vi.fn().mockResolvedValue([]);
const mockPipelineZincrby      = vi.fn();
const mockPipelineExpire       = vi.fn();
const mockPipelineZremrangebyrank = vi.fn();
const mockPipelineSetex        = vi.fn();

const mockPipeline = {
  zincrby:          mockPipelineZincrby,
  expire:           mockPipelineExpire,
  zremrangebyrank:  mockPipelineZremrangebyrank,
  setex:            mockPipelineSetex,
  exec:             mockPipelineExec,
};

const mockGet       = vi.fn();
const mockSet       = vi.fn();
const mockZrevrange = vi.fn();
const mockScan      = vi.fn();

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get:          mockGet,
    set:          mockSet,
    zrevrange:    mockZrevrange,
    scan:         mockScan,
    pipeline:     () => mockPipeline,
  }),
}));

// ── Import after mocks are registered ────────────────────────────────────────
import {
  recordEngramTransition,
  recordLastQuery,
  getEngramSuggestions,
  getEngramStats,
} from '../src/lib/server/search/engram-bigram.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMocks() {
  mockGet.mockReset();
  mockSet.mockReset();
  mockZrevrange.mockReset();
  mockScan.mockReset();
  mockPipelineExec.mockReset().mockResolvedValue([]);
  mockPipelineZincrby.mockReset();
  mockPipelineExpire.mockReset();
  mockPipelineZremrangebyrank.mockReset();
  mockPipelineSetex.mockReset();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('engram-bigram: recordEngramTransition', () => {
  beforeEach(resetMocks);

  it('calls pipeline with zincrby + expire + zremrangebyrank + 2x setex', async () => {
    await recordEngramTransition('find evidence', 'search statute');
    expect(mockPipelineZincrby).toHaveBeenCalledOnce();
    expect(mockPipelineExpire).toHaveBeenCalledOnce();
    expect(mockPipelineZremrangebyrank).toHaveBeenCalledOnce();
    expect(mockPipelineSetex).toHaveBeenCalledTimes(2);
    expect(mockPipelineExec).toHaveBeenCalledOnce();
  });

  it('stores normalized query text in setex (lowercase + trimmed)', async () => {
    await recordEngramTransition('  Find Evidence  ', '  Search Statute  ');
    const calls = mockPipelineSetex.mock.calls;
    // second and third args of setex are TTL and value
    const storedTexts = calls.map((c: unknown[]) => c[2] as string);
    expect(storedTexts.every((t) => t === t.toLowerCase())).toBe(true);
    expect(storedTexts.every((t) => t === t.trim())).toBe(true);
  });

  it('is a no-op when prevQuery and curQuery normalize to the same hash', async () => {
    // same query after normalize → same hash → skip
    await recordEngramTransition('find evidence', 'find evidence');
    expect(mockPipelineExec).not.toHaveBeenCalled();
  });

  it('is a no-op when prevQuery is empty', async () => {
    await recordEngramTransition('', 'search statute');
    expect(mockPipelineExec).not.toHaveBeenCalled();
  });

  it('is a no-op when curQuery is empty', async () => {
    await recordEngramTransition('find evidence', '');
    expect(mockPipelineExec).not.toHaveBeenCalled();
  });

  it('trims whitespace differences when comparing prev and cur hashes', async () => {
    await recordEngramTransition('find evidence', '  find evidence  ');
    // normalized to same string → same hash → no-op
    expect(mockPipelineExec).not.toHaveBeenCalled();
  });
});

describe('engram-bigram: recordLastQuery', () => {
  beforeEach(resetMocks);

  it('calls redis.set with EX + GET for atomic swap', async () => {
    mockSet.mockResolvedValue(null);
    await recordLastQuery('user-1', 'find evidence');
    expect(mockSet).toHaveBeenCalledOnce();
    const args = mockSet.mock.calls[0] as unknown[];
    expect(args[0]).toMatch(/ace:engram:last:user-1/);
    // value should be normalized
    expect(args[1]).toBe('find evidence');
    // should include 'EX' and 'GET'
    expect(args).toContain('EX');
    expect(args).toContain('GET');
  });

  it('returns the previous value from the atomic swap', async () => {
    mockSet.mockResolvedValue('previous query');
    const prev = await recordLastQuery('user-1', 'new query');
    expect(prev).toBe('previous query');
  });

  it('returns null when no previous value exists', async () => {
    mockSet.mockResolvedValue(null);
    const prev = await recordLastQuery('user-1', 'new query');
    expect(prev).toBeNull();
  });

  it('normalizes query before storing', async () => {
    mockSet.mockResolvedValue(null);
    await recordLastQuery('user-2', '  SEARCH STATUTE  ');
    const stored = mockSet.mock.calls[0][1] as string;
    expect(stored).toBe('search statute');
  });
});

describe('engram-bigram: getEngramSuggestions', () => {
  beforeEach(resetMocks);

  it('returns empty array when no bigram entries exist', async () => {
    mockZrevrange.mockResolvedValue([]);
    const results = await getEngramSuggestions('find evidence');
    expect(results).toEqual([]);
  });

  it('resolves suggestion text and returns shaped EngramSuggestion', async () => {
    const nextHash = 'abcdef1234567890';
    // ZREVRANGE WITHSCORES returns [member, score, member, score, ...]
    mockZrevrange.mockResolvedValue([nextHash, '3']);
    mockGet.mockResolvedValue('search statute');

    const results = await getEngramSuggestions('find evidence');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      suggestion: 'search statute',
      hitCount:   3,
      source:     'engram',
    });
    // Exponential score: 1 - exp(-3/5) ≈ 0.4512
    expect(results[0].score).toBeCloseTo(1 - Math.exp(-3 / 5), 4);
  });

  it('score uses exponential formula not hard saturation', async () => {
    const hash10 = 'hash10';
    const hash100 = 'hash100';
    mockZrevrange
      .mockResolvedValueOnce([hash10,  '10'])
      .mockResolvedValueOnce([hash100, '100']);
    mockGet.mockResolvedValue('any suggestion');

    const [r10]  = await getEngramSuggestions('q', 1);
    const [r100] = await getEngramSuggestions('q', 1);

    // Both scores < 1 (not hard-capped)
    expect(r10.score).toBeLessThan(1);
    expect(r100.score).toBeLessThan(1);
    // Higher frequency → higher score
    expect(r100.score).toBeGreaterThan(r10.score);
    // r10 score ≈ 1 - exp(-10/5) ≈ 0.8647
    expect(r10.score).toBeCloseTo(1 - Math.exp(-10 / 5), 4);
  });

  it('skips entries where suggestion lookup returns null', async () => {
    mockZrevrange.mockResolvedValue(['hash1', '5', 'hash2', '3']);
    mockGet.mockResolvedValueOnce('valid suggestion').mockResolvedValueOnce(null);

    const results = await getEngramSuggestions('find evidence');
    expect(results).toHaveLength(1);
    expect(results[0].suggestion).toBe('valid suggestion');
  });

  it('respects the limit parameter', async () => {
    // ZREVRANGE called with 0..limit-1 — mock returns only what we gave it
    mockZrevrange.mockResolvedValue(['h1', '2']);
    mockGet.mockResolvedValue('suggestion');
    const results = await getEngramSuggestions('query', 1);
    expect(mockZrevrange).toHaveBeenCalledWith(
      expect.stringContaining('ace:engram:bigram:'),
      0,
      0, // limit - 1
      'WITHSCORES',
    );
    expect(results).toHaveLength(1);
  });
});

describe('engram-bigram: getEngramStats', () => {
  beforeEach(resetMocks);

  it('uses SCAN not KEYS for each namespace', async () => {
    // Return cursor '0' immediately (single-page scan)
    mockScan
      .mockResolvedValueOnce(['0', ['ace:engram:bigram:aaa', 'ace:engram:bigram:bbb']])
      .mockResolvedValueOnce(['0', ['ace:engram:query:ccc']])
      .mockResolvedValueOnce(['0', ['ace:engram:last:ddd']]);

    const stats = await getEngramStats();

    expect(mockScan).toHaveBeenCalledTimes(3);
    // Should NOT have called redis.keys at all
    expect(stats).toEqual({ bigramKeys: 2, queryKeys: 1, activeUsers: 1 });
  });

  it('iterates multiple SCAN pages until cursor returns "0"', async () => {
    // Promise.all runs the 3 scans concurrently so calls interleave.
    // Use pattern-aware mock: bigram gets a 2-page response, others single-page.
    mockScan.mockImplementation((_cursor: string, _match: string, pattern: string, _count: string, _n: number) => {
      if (pattern === 'ace:engram:bigram:*') {
        // Track how many times bigram has been called to simulate pagination
        const calls = mockScan.mock.calls.filter(
          (c: unknown[]) => c[2] === 'ace:engram:bigram:*'
        );
        return Promise.resolve(calls.length === 1 ? ['42', ['k1', 'k2']] : ['0', ['k3']]);
      }
      return Promise.resolve(['0', []]);
    });

    const stats = await getEngramStats();
    // bigram had 2 pages → k1,k2,k3 = 3
    expect(stats.bigramKeys).toBe(3);
    expect(stats.queryKeys).toBe(0);
    expect(stats.activeUsers).toBe(0);
  });

  it('returns zeros when Redis throws', async () => {
    mockScan.mockRejectedValue(new Error('redis down'));
    const stats = await getEngramStats();
    expect(stats).toEqual({ bigramKeys: 0, queryKeys: 0, activeUsers: 0 });
  });
});
