import { describe, expect, it } from 'vitest';
import { aggregateExactKnnToFileTopK } from './file-topk-aggregation.js';
import type { AtlasSemantic768ExactHitV1 } from './atlas-rapids-semantic768-client.js';

function hit(overrides: Partial<AtlasSemantic768ExactHitV1>): AtlasSemantic768ExactHitV1 {
  return {
    rank: 1,
    packetKey: 'p1',
    sourceRevision: 'r1',
    symbolVersionId: null,
    sqeuclideanDistance: 0,
    cosineSimilarity: 1,
    ...overrides,
  };
}

describe('aggregateExactKnnToFileTopK', () => {
  it('maps each hit to its file via the caller-supplied identity join', () => {
    const hits = [hit({ packetKey: 'p1', cosineSimilarity: 0.9 })];
    const result = aggregateExactKnnToFileTopK(hits, new Map([['p1', 'src/a.ts']]), 5);
    expect(result.files).toEqual([{
      rank: 1, sourceRef: 'src/a.ts', packetKey: 'p1', sourceRevision: 'r1', cosineSimilarity: 0.9,
    }]);
    expect(result.uniqueFiles).toBe(1);
    expect(result.droppedNoSourceRef).toBe(0);
  });

  it('accepts a plain object as the identity join, not only a Map', () => {
    const hits = [hit({ packetKey: 'p1', cosineSimilarity: 0.5 })];
    const result = aggregateExactKnnToFileTopK(hits, { p1: 'src/a.ts' }, 5);
    expect(result.files[0].sourceRef).toBe('src/a.ts');
  });

  it('drops hits with no known sourceRef rather than fabricating one', () => {
    const hits = [
      hit({ packetKey: 'known', cosineSimilarity: 0.5 }),
      hit({ packetKey: 'unknown', cosineSimilarity: 0.9 }),
    ];
    const result = aggregateExactKnnToFileTopK(hits, new Map([['known', 'src/a.ts']]), 5);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].packetKey).toBe('known');
    expect(result.droppedNoSourceRef).toBe(1);
  });

  it('deduplicates multiple packets mapping to the same file, keeping the higher-similarity hit', () => {
    const hits = [
      hit({ packetKey: 'p1', cosineSimilarity: 0.6 }),
      hit({ packetKey: 'p2', cosineSimilarity: 0.9 }),
    ];
    const join = new Map([['p1', 'src/a.ts'], ['p2', 'src/a.ts']]);
    const result = aggregateExactKnnToFileTopK(hits, join, 5);
    expect(result.uniqueFiles).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].packetKey).toBe('p2');
    expect(result.files[0].cosineSimilarity).toBe(0.9);
  });

  it('breaks exact-tie similarity deterministically by packetKey', () => {
    const hits = [
      hit({ packetKey: 'zeta', cosineSimilarity: 0.7 }),
      hit({ packetKey: 'alpha', cosineSimilarity: 0.7 }),
    ];
    const join = new Map([['zeta', 'src/a.ts'], ['alpha', 'src/a.ts']]);
    const result = aggregateExactKnnToFileTopK(hits, join, 5);
    expect(result.files[0].packetKey).toBe('alpha');
  });

  it('sorts multiple distinct files by cosineSimilarity descending', () => {
    const hits = [
      hit({ packetKey: 'p1', cosineSimilarity: 0.3 }),
      hit({ packetKey: 'p2', cosineSimilarity: 0.95 }),
      hit({ packetKey: 'p3', cosineSimilarity: 0.6 }),
    ];
    const join = new Map([['p1', 'src/low.ts'], ['p2', 'src/high.ts'], ['p3', 'src/mid.ts']]);
    const result = aggregateExactKnnToFileTopK(hits, join, 5);
    expect(result.files.map((f) => f.sourceRef)).toEqual(['src/high.ts', 'src/mid.ts', 'src/low.ts']);
    expect(result.files.map((f) => f.rank)).toEqual([1, 2, 3]);
  });

  it('respects topK, reporting requestedK vs returnedK vs uniqueFiles distinctly', () => {
    const hits = [
      hit({ packetKey: 'p1', cosineSimilarity: 0.9 }),
      hit({ packetKey: 'p2', cosineSimilarity: 0.8 }),
      hit({ packetKey: 'p3', cosineSimilarity: 0.7 }),
    ];
    const join = new Map([['p1', 'src/a.ts'], ['p2', 'src/b.ts'], ['p3', 'src/c.ts']]);
    const result = aggregateExactKnnToFileTopK(hits, join, 2);
    expect(result.requestedK).toBe(2);
    expect(result.returnedK).toBe(2);
    expect(result.uniqueFiles).toBe(3);
    expect(result.files).toHaveLength(2);
  });

  it('rejects a non-positive-integer topK', () => {
    expect(() => aggregateExactKnnToFileTopK([], new Map(), 0)).toThrow(/ATLAS_FILE_TOPK_INVALID_K/);
    expect(() => aggregateExactKnnToFileTopK([], new Map(), -1)).toThrow(/ATLAS_FILE_TOPK_INVALID_K/);
    expect(() => aggregateExactKnnToFileTopK([], new Map(), 1.5)).toThrow(/ATLAS_FILE_TOPK_INVALID_K/);
  });

  it('returns an empty result for zero hits without throwing', () => {
    const result = aggregateExactKnnToFileTopK([], new Map(), 5);
    expect(result.files).toEqual([]);
    expect(result.returnedK).toBe(0);
    expect(result.uniqueFiles).toBe(0);
  });
});
