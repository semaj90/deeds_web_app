import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveOakEvidenceV1, resolveOakAncestorsV1 } from './oak-resolution-evidence-client.js';

const originalFetch = global.fetch;

describe('AR-01: OAK resolution evidence client', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves a single match to RESOLVED with canonicalAuthority: false', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.includes('/oak/search')) {
        return new Response(
          JSON.stringify({ matches: [{ entityId: 'concept:postgresql', label: 'PostgreSQL' }] }),
          { status: 200 }
        );
      }
      if (path.includes('/oak/lookup')) {
        return new Response(JSON.stringify({ label: 'PostgreSQL', aliases: ['postgres', 'pg'] }), {
          status: 200,
        });
      }
      throw new Error(`unexpected path ${path}`);
    }) as unknown as typeof fetch;

    const result = await resolveOakEvidenceV1('postgres');
    expect(result.state).toBe('RESOLVED');
    expect(result.resolvedCurie).toBe('concept:postgresql');
    expect(result.synonyms).toEqual(['postgres', 'pg']);
    expect(result.canonicalAuthority).toBe(false);
  });

  it('returns UNRESOLVED (not a fabricated CURIE) on zero matches', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ matches: [] }), { status: 200 })) as unknown as typeof fetch;

    const result = await resolveOakEvidenceV1('quantum blockchain nft');
    expect(result.state).toBe('UNRESOLVED');
    expect(result.resolvedCurie).toBeNull();
  });

  it('returns AMBIGUOUS on multiple matches, never picking one', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          matches: [
            { entityId: 'concept:a', label: 'A' },
            { entityId: 'concept:b', label: 'B' },
          ],
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const result = await resolveOakEvidenceV1('ambiguous term');
    expect(result.state).toBe('AMBIGUOUS');
    expect(result.resolvedCurie).toBeNull();
    expect(result.evidenceRefs).toHaveLength(2);
  });

  it('fails closed to RESOLUTION_UNAVAILABLE, never synthesizing concept:<raw-label>, when the sidecar is unreachable', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await resolveOakEvidenceV1('anything at all');
    expect(result.state).toBe('RESOLUTION_UNAVAILABLE');
    expect(result.resolvedCurie).toBeNull();
    expect(result.resolvedCurie).not.toBe('concept:anything at all');
  });

  it('fails closed to RESOLUTION_UNAVAILABLE on a non-2xx response', async () => {
    global.fetch = vi.fn(async () => new Response('server error', { status: 500 })) as unknown as typeof fetch;

    const result = await resolveOakEvidenceV1('postgres');
    expect(result.state).toBe('RESOLUTION_UNAVAILABLE');
  });

  it('walks ancestors for an already-resolved CURIE', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ nodes: [{ entityId: 'concept:database', label: 'Database' }] }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const result = await resolveOakAncestorsV1('concept:postgresql');
    expect(result.state).toBe('RESOLVED');
    expect(result.ancestors).toEqual(['concept:database']);
  });

  it('ancestor walk also fails closed when unreachable', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await resolveOakAncestorsV1('concept:postgresql');
    expect(result.state).toBe('RESOLUTION_UNAVAILABLE');
    expect(result.ancestors).toEqual([]);
  });
});
