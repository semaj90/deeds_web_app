import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({ ENV: { TOPOLOGY_SEARCH_URL: 'http://topology.test' } }));

import { isTopologySearchReady, queryTopology } from './topology-search-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('topology search client metadata', () => {
  it('preserves cosine-only fallback metadata from HTTP responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      rankingMode: 'cosine_only',
      topologyStatus: 'unmatched',
      fallbackReason: 'identity_mismatch',
      identityJoin: { matched: 0, unmatched: 2 },
      center: null,
      radius: 0.25,
      totalFound: 1,
      durationMs: 3,
      hits: [{ stableKey: 'stable-a', sourceRevision: 'sha256:source', path: 'src/a.ts', cosineScore: 0.8 }],
      unmatchedTopologyHits: [{ stableKey: 'stable-a', path: 'src/a.ts' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await queryTopology('test query');
    expect(result.rankingMode).toBe('cosine_only');
    expect(result.topologyStatus).toBe('unmatched');
    expect(result.fallbackReason).toBe('identity_mismatch');
    expect(result.identityJoin).toEqual({ matched: 0, unmatched: 2 });
    expect(result.hits[0].sourceRevision).toBe('sha256:source');
    expect(result.unmatchedTopologyHits).toHaveLength(1);
  });

  it('preserves explicit HTTP errors instead of converting them to a successful topology result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false, code: 'TOPOLOGY_QUERY_FAILED', error: 'Topology query is unavailable',
    }), { status: 503, headers: { 'content-type': 'application/json' } })));

    const result = await queryTopology('test query');
    expect(result.ok).toBe(false);
    expect(result.rankingMode).toBe('unavailable');
    expect(result.topologyStatus).toBe('unavailable');
    expect(result.errorCode).toBe('TOPOLOGY_QUERY_FAILED');
  });

  it('reports transport failures and readiness separately from liveness', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const result = await queryTopology('test query');
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe('transport_error');
    expect(await isTopologySearchReady()).toBe(false);
    expect(fetchMock).toHaveBeenLastCalledWith('http://topology.test/ready', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
