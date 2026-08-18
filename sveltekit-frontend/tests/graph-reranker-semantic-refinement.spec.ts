import { describe, expect, it } from 'vitest';
import { rerankHits } from '../src/lib/server/ai/graph-reranker.js';

describe('semantic refinement stays one logical vote', () => {
  it('uses the refinement as the semantic slot rather than adding a second score', () => {
    const hits = [
      { chunkId: 'a', score: .9, payload: {} },
      { chunkId: 'b', score: .7, payload: {} },
    ];
    const refinement = new Map([['a', .2], ['b', .95]]);
    const results = rerankHits(hits, undefined, 2, {
      activeLanes: ['semantic'],
      semanticScoreByChunk: refinement,
    });
    expect(results[0]?.chunkId).toBe('b');
    expect(results[0]?.scores.qdrant).toBe(.95);
    expect(results[0]?.score).toBe(.95);
    expect(results[0]?.scores.pagerank).toBe(0);
  });
});
