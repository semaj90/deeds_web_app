import { describe, expect, it } from 'vitest';
import { compareBfsParity, referenceBfs } from './bfs-parity.js';

describe('BFS parity oracle', () => {
  const edges = [
    { from: 'a', to: 'b', type: 'CALLS' },
    { from: 'a', to: 'c', type: 'CALLS' },
    { from: 'b', to: 'd', type: 'CALLS' },
    { from: 'c', to: 'e', type: 'IMPORTS' },
  ];

  it('derives bounded hop distances deterministically', () => {
    const result = referenceBfs({ seed: 'a', edges, maxHops: 2, direction: 'out' });
    expect(result.distanceByNode).toEqual({ a: 0, b: 1, c: 1, d: 2, e: 2 });
  });

  it('supports relationship filtering', () => {
    const result = referenceBfs({ seed: 'a', edges, maxHops: 2, direction: 'out', edgeTypes: ['CALLS'] });
    expect(result.visited).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports exact parity only when node set and distances agree', () => {
    const oracle = referenceBfs({ seed: 'a', edges, maxHops: 2, direction: 'out' });
    expect(compareBfsParity({ oracle, executorDistanceByNode: { a: 0, b: 1, c: 1, d: 2, e: 2 } }).status).toBe('PASS');
    const failed = compareBfsParity({ oracle, executorDistanceByNode: { a: 0, b: 1, c: 2, d: 2 } });
    expect(failed.status).toBe('FAIL');
    expect(failed.missingFromExecutor).toContain('e');
    expect(failed.distanceMismatches).toContainEqual({ nodeId: 'c', expected: 1, actual: 2 });
  });
});
