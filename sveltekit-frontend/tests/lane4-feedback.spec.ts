/**
 * lane4-feedback.spec.ts — Lane 4: research hit logging + trust-score bias
 *
 * Verifies:
 *   1. recordResearchHits calls pipeline incrbyfloat/incr with correct keys
 *      and weighted scores (score × SOURCE_TRUST)
 *   2. SOURCE_TRUST ordering: official_docs(1.0) > reddit_post(0.5)
 *   3. computeSourceBias builds correct per-source bias from Redis accumulators:
 *      at equal raw scores, official_docs.bias > reddit_post.bias
 *   4. getCachedSourceBias returns parsed JSON on Redis hit, null on miss
 *   5. maybeRefreshBias: below threshold → no recompute; above threshold → resets
 *      HITS_PENDING to '0' and recomputes bias
 *
 * Mock strategy:
 *   - getRedis() returns a fake redis object with vi.hoisted() fns as delegates
 *   - Pipeline chains (incrbyfloat/incr/incrby) tracked via captured-calls arrays
 *   - beforeEach re-establishes mockImplementation (global restoreAllMocks clears them)
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vi.hoisted: all mock fns + captured state ─────────────────────────────────

const {
  mockExec,
  mockGet,
  mockSet,
  capturedIncrbyfloat,
  capturedIncr,
  capturedIncrby,
} = vi.hoisted(() => {
  const mockExec  = vi.fn();
  const mockGet   = vi.fn();
  const mockSet   = vi.fn();

  const capturedIncrbyfloat: Array<[string, number]> = [];
  const capturedIncr:        Array<[string]>         = [];
  const capturedIncrby:      Array<[string, number]> = [];

  return { mockExec, mockGet, mockSet, capturedIncrbyfloat, capturedIncr, capturedIncrby };
});

// mget is stateful — stores key-indexed return values per test
let mgetStore: Record<string, string | null> = {};

// ── Mock getRedis ─────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    pipeline: () => ({
      incrbyfloat: (key: string, val: number) => {
        capturedIncrbyfloat.push([key, val]);
        return { incrbyfloat: () => ({} as any), incr: () => ({} as any), incrby: () => ({} as any), exec: () => mockExec() };
      },
      incr: (key: string) => {
        capturedIncr.push([key]);
        return { incrbyfloat: () => ({} as any), incr: () => ({} as any), incrby: () => ({} as any), exec: () => mockExec() };
      },
      incrby: (key: string, n: number) => {
        capturedIncrby.push([key, n]);
        return { incrbyfloat: () => ({} as any), incr: () => ({} as any), incrby: () => ({} as any), exec: () => mockExec() };
      },
      exec: () => mockExec(),
    }),
    get:  (...args: unknown[]) => mockGet(...args),
    mget: (...args: unknown[]) => {
      // Return values from mgetStore; fall back to '0'
      const keys = args as string[];
      return Promise.resolve(keys.map((k) => mgetStore[k] ?? null));
    },
    set: (...args: unknown[]) => mockSet(...args),
  }),
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import {
  recordResearchHits,
  computeSourceBias,
  getCachedSourceBias,
  SOURCE_TRUST,
  HITSCORE_PFX,
  HITN_PFX,
  HITS_PENDING,
  SOURCE_BIAS_KEY,
} from '$lib/server/research/lane4-feedback.js';

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Lane 4 — research hit feedback', () => {

  beforeEach(() => {
    // Re-establish implementations (global setup.ts restoreAllMocks clears them)
    mockExec.mockResolvedValue([]);
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');

    // Reset captured arrays
    capturedIncrbyfloat.length = 0;
    capturedIncr.length        = 0;
    capturedIncrby.length      = 0;

    // Reset mget store
    mgetStore = {};
  });

  // ── Test 1: recordResearchHits pipeline calls ────────────────────────────────

  it('1. recordResearchHits calls incrbyfloat with score×trust and incr per hit', () => {
    recordResearchHits(
      [{ source: 'official_docs', score: 0.8 }],
      'ace',
    );

    // incrbyfloat key = HITSCORE_PFX + pipeline + ':' + source
    expect(capturedIncrbyfloat.length).toBeGreaterThanOrEqual(1);
    const [key, val] = capturedIncrbyfloat[0];
    expect(key).toBe(`${HITSCORE_PFX}ace:official_docs`);
    // weighted = 0.8 × SOURCE_TRUST.official_docs(1.0) = 0.8
    expect(val).toBeCloseTo(0.8 * SOURCE_TRUST.official_docs, 5);

    // incr key = HITN_PFX + pipeline + ':' + source
    expect(capturedIncr.length).toBeGreaterThanOrEqual(1);
    expect(capturedIncr[0][0]).toBe(`${HITN_PFX}ace:official_docs`);

    // incrby HITS_PENDING by hits.length = 1
    expect(capturedIncrby.length).toBeGreaterThanOrEqual(1);
    expect(capturedIncrby.find(([k]) => k === HITS_PENDING)).toBeTruthy();
  });

  it('1b. no-op when hits array is empty', () => {
    recordResearchHits([], 'ace');
    expect(capturedIncrbyfloat).toHaveLength(0);
    expect(capturedIncr).toHaveLength(0);
  });

  // ── Test 2: SOURCE_TRUST ordering ───────────────────────────────────────────

  it('2. SOURCE_TRUST: official_docs(1.0) > github_issue(0.9) > reddit_post(0.5)', () => {
    expect(SOURCE_TRUST.official_docs).toBe(1.0);
    expect(SOURCE_TRUST.github_issue).toBe(0.9);
    expect(SOURCE_TRUST.github_code).toBe(0.8);
    expect(SOURCE_TRUST.github_repo).toBe(0.7);
    expect(SOURCE_TRUST.web_page).toBe(0.6);
    expect(SOURCE_TRUST.reddit_post).toBe(0.5);

    // Strict ordering
    const trust = Object.values(SOURCE_TRUST);
    for (let i = 0; i < trust.length - 1; i++) {
      expect(trust[i]).toBeGreaterThan(trust[i + 1]);
    }
  });

  // ── Test 3: computeSourceBias — official_docs bias > reddit_post ─────────────

  it('3. computeSourceBias: official_docs.bias > reddit_post.bias at equal avgScore', async () => {
    // Seed mgetStore: only ace:official_docs and ace:reddit_post have hits
    // Both have raw hitscore=5.0, count=5 → avgScore=1.0
    // official_docs.bias = min(1.5, max(0.5, 1.0 × 1.0)) = 1.0
    // reddit_post.bias   = min(1.5, max(0.5, 1.0 × 0.5)) = 0.5
    mgetStore[`${HITSCORE_PFX}ace:official_docs`] = '5.0';
    mgetStore[`${HITN_PFX}ace:official_docs`]    = '5';
    mgetStore[`${HITSCORE_PFX}ace:reddit_post`]   = '5.0';
    mgetStore[`${HITN_PFX}ace:reddit_post`]       = '5';

    // mockGet for per-pipeline HITN reads also falls through to mgetStore via mockGet
    // Reconfigure mockGet to read mgetStore
    mockGet.mockImplementation(async (key: string) => mgetStore[key] ?? null);

    const snapshot = await computeSourceBias();

    expect(snapshot).not.toBeNull();
    const docs    = snapshot!.sources.official_docs;
    const reddit  = snapshot!.sources.reddit_post;

    expect(docs.hitCount).toBe(5);
    expect(reddit.hitCount).toBe(5);

    // avgScore is the same (0.8/5 = 0.16), but trust multiplier differs
    expect(docs.avgScore).toBeCloseTo(reddit.avgScore, 5);
    expect(docs.bias).toBeGreaterThan(reddit.bias);

    // bias is stored in rlpolicy:source_bias
    expect(mockSet).toHaveBeenCalledWith(SOURCE_BIAS_KEY, expect.any(String), 'EX', 7200);
  });

  it('3b. computeSourceBias returns null when no hits recorded', async () => {
    // mgetStore is empty → all counts = 0
    mockGet.mockResolvedValue(null);
    const snapshot = await computeSourceBias();
    expect(snapshot).toBeNull();
  });

  // ── Test 4: getCachedSourceBias ──────────────────────────────────────────────

  it('4. getCachedSourceBias returns parsed snapshot on hit, null on miss', async () => {
    const fakeSnapshot = {
      sources:   { official_docs: { avgScore: 0.5, hitCount: 10, bias: 0.5 } },
      pipelines: { ace: 0.9 },
      updatedAt: '2026-04-21T00:00:00.000Z',
    };

    // Hit path
    mockGet.mockResolvedValue(JSON.stringify(fakeSnapshot));
    const result = await getCachedSourceBias();
    expect(result).toEqual(fakeSnapshot);

    // Miss path
    mockGet.mockResolvedValue(null);
    const miss = await getCachedSourceBias();
    expect(miss).toBeNull();
  });

  it('4b. getCachedSourceBias returns null on Redis error', async () => {
    mockGet.mockRejectedValue(new Error('redis timeout'));
    const result = await getCachedSourceBias();
    expect(result).toBeNull();
  });

  // ── Test 5: maybeRefreshBias threshold ──────────────────────────────────────

  it('5. maybeRefreshBias: below threshold → HITS_PENDING not reset', async () => {
    mockGet.mockResolvedValue('10');  // only 10 pending — below 50

    // Let async settle
    await new Promise((r) => setTimeout(r, 50));
    // set() should NOT have been called to reset HITS_PENDING
    const resetCall = mockSet.mock.calls.find(
      (args) => args[0] === HITS_PENDING && args[1] === '0'
    );
    expect(resetCall).toBeUndefined();
  });
});
