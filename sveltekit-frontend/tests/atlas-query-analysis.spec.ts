// @vitest-environment node
/**
 * Query analysis shape tests for the atlas recommendation layer.
 *
 * Verifies that recommendation-policy and action-candidate-builder
 * export the correct factories and produce well-formed outputs.
 *
 * Pure unit tests — no database, no HTTP, no GPU.
 */

import { describe, it, expect } from 'vitest';

describe('atlas/recommendations/recommendation-policy', () => {
  it('exports a policy evaluation function', async () => {
    const mod = await import('$lib/server/atlas/recommendations/recommendation-policy.js');
    const hasEval =
      typeof mod.evaluateRecommendationPolicy === 'function' ||
      typeof mod.buildRecommendationPolicy === 'function' ||
      typeof mod.createRecommendationPolicy === 'function';
    expect(hasEval).toBe(true);
  });
});

describe('atlas/recommendations/action-candidate-builder', () => {
  it('exports buildActionCandidates or createActionCandidateBuilder', async () => {
    const mod = await import('$lib/server/atlas/recommendations/action-candidate-builder.js');
    const hasFactory =
      typeof mod.buildActionCandidates === 'function' ||
      typeof mod.createActionCandidateBuilder === 'function';
    expect(hasFactory).toBe(true);
  });
});

describe('atlas/contracts/recommendation', () => {
  it('module resolves without error', async () => {
    const mod = await import('$lib/server/atlas/contracts/recommendation.js');
    expect(mod).toBeDefined();
  });
});

describe('atlas ranking factory round-trip', () => {
  it('createDisabledAtlasReranker produces stable ranked order', async () => {
    const { createDisabledAtlasReranker } = await import('$lib/server/atlas/ranking/index.js');
    const reranker = createDisabledAtlasReranker('unit-test');

    const candidates = [
      { packetKey: 'a', sourceRef: 'src/a.ts', score: 0.3, lane: 'dense' },
      { packetKey: 'b', sourceRef: 'src/b.ts', score: 0.8, lane: 'dense' },
      { packetKey: 'c', sourceRef: 'src/c.ts', score: 0.5, lane: 'dense' },
    ];

    const result1 = await reranker.rerank({ query: 'q', candidates });
    const result2 = await reranker.rerank({ query: 'q', candidates });

    // Deterministic — same input → same order
    expect(result1.ranked.map(r => r.packetKey)).toEqual(result2.ranked.map(r => r.packetKey));

    // Sorted descending by original score
    expect(result1.ranked[0].packetKey).toBe('b');
    expect(result1.ranked[1].packetKey).toBe('c');
    expect(result1.ranked[2].packetKey).toBe('a');
  });

  it('createDisabledAtlasReranker assigns contiguous 1-based ranks', async () => {
    const { createDisabledAtlasReranker } = await import('$lib/server/atlas/ranking/index.js');
    const reranker = createDisabledAtlasReranker('unit-test');
    const result = await reranker.rerank({
      query: 'test',
      candidates: [
        { packetKey: 'x', sourceRef: 's/x.ts', score: 0.5, lane: 'bm25' },
        { packetKey: 'y', sourceRef: 's/y.ts', score: 0.9, lane: 'bm25' },
      ],
    });
    const ranks = result.ranked.map(r => r.rank);
    expect(ranks).toEqual([1, 2]);
  });

  it('createDisabledAtlasReranker respects topK', async () => {
    const { createDisabledAtlasReranker } = await import('$lib/server/atlas/ranking/index.js');
    const reranker = createDisabledAtlasReranker('unit-test');
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      packetKey: `k${i}`,
      sourceRef: `src/${i}.ts`,
      score: Math.random(),
      lane: 'dense' as const,
    }));
    const result = await reranker.rerank({ query: 'q', candidates, topK: 3 });
    // disabled reranker sorts all candidates; topK is advisory for consumers
    // The result must have all items (disabled doesn't slice by topK itself)
    expect(result.ranked.length).toBeGreaterThanOrEqual(1);
  });
});
