import { describe, expect, it, vi, afterEach } from 'vitest';
import type { QueryClassificationV1 } from '../agentic-file-compiler/query-classifier.js';

const originalFetch = global.fetch;

function classification(overrides: Partial<QueryClassificationV1> = {}): QueryClassificationV1 {
  return {
    schema: 'atlas.query-classification.v1',
    requestId: 'req-1',
    rawQuery: 'how does postgres retrieval work',
    operation: 'ANSWER',
    mutationKind: null,
    domains: ['retrieval'],
    artifactKinds: [],
    targetHints: [],
    symbols: ['classifyAtlasQuery'],
    retrievalNeeds: { lexical: true, ast: false, semantic: true, graph: false },
    exactPromotionRequired: false,
    requiresMutation: false,
    requiresValidation: false,
    producerRevision: 'query-classifier-v1',
    checksum: 'deadbeef',
    ...overrides,
  };
}

describe('AR-07: OAK query enrichment (additive, over an already-computed classification)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves each distinct candidate label independently', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.includes('/oak/search')) {
        return new Response(JSON.stringify({ matches: [{ entityId: 'concept:retrieval', label: 'Retrieval' }] }), { status: 200 });
      }
      if (path.includes('/oak/lookup')) {
        return new Response(JSON.stringify({ label: 'Retrieval', aliases: [] }), { status: 200 });
      }
      throw new Error(`unexpected ${path}`);
    }) as unknown as typeof fetch;

    const { enrichQueryClassificationWithOakV1 } = await import('./oak-query-enrichment-v1.js');
    const result = await enrichQueryClassificationWithOakV1(classification());

    expect(result.requestId).toBe('req-1');
    expect(result.evidence).toHaveLength(2); // 'retrieval' domain + 'classifyAtlasQuery' symbol
    expect(result.evidence.every((e) => e.canonicalAuthority === false)).toBe(true);
  });

  it('deduplicates labels across domains/symbols/targetHints', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ matches: [] }), { status: 200 })) as unknown as typeof fetch;

    const { enrichQueryClassificationWithOakV1 } = await import('./oak-query-enrichment-v1.js');
    const result = await enrichQueryClassificationWithOakV1(
      classification({ domains: ['retrieval'], symbols: ['retrieval'], targetHints: ['retrieval'] })
    );

    expect(result.evidence).toHaveLength(1);
  });

  it('respects maxLabels and never exceeds it', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ matches: [] }), { status: 200 })) as unknown as typeof fetch;

    const { enrichQueryClassificationWithOakV1 } = await import('./oak-query-enrichment-v1.js');
    const result = await enrichQueryClassificationWithOakV1(
      classification({ domains: ['a', 'b', 'c', 'd', 'e'] }),
      { maxLabels: 2 }
    );

    expect(result.evidence).toHaveLength(2);
  });

  it('one label failing does not block the others (independent fail-closed)', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      call += 1;
      if (call === 1) throw new Error('ECONNREFUSED');
      return new Response(JSON.stringify({ matches: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { enrichQueryClassificationWithOakV1 } = await import('./oak-query-enrichment-v1.js');
    const result = await enrichQueryClassificationWithOakV1(
      classification({ domains: ['a'], symbols: ['b'] })
    );

    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.some((e) => e.state === 'RESOLUTION_UNAVAILABLE')).toBe(true);
    expect(result.evidence.some((e) => e.state === 'UNRESOLVED')).toBe(true);
  });

  it('returns empty evidence for a classification with no candidate labels', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;

    const { enrichQueryClassificationWithOakV1 } = await import('./oak-query-enrichment-v1.js');
    const result = await enrichQueryClassificationWithOakV1(
      classification({ domains: [], symbols: [], targetHints: [] })
    );

    expect(result.evidence).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
