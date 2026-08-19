import { describe, expect, it } from 'vitest';
import { evaluateAltLowerBound, altAStarPriority, compareExactThenAggressive } from './alt-landmark-heuristic.js';

function checksum(char: string): string {
  return char.repeat(64);
}

function snapshot(directed: boolean) {
  return {
    schema: 'atlas.landmark-distance-snapshot.v1' as const,
    workspaceRevision: 'ws-1',
    graphRevision: 'g-1',
    projectionRevision: 'gp-1',
    nodeOrdinalRevision: 'ord-1',
    landmarkRevision: 'lm-1',
    directed,
    weighted: false,
    nonnegativeWeightsRequired: true as const,
    landmarkCanonicalIds: ['L0', 'L1'],
    landmarkCount: 2,
    nodeCount: 4,
    forwardDistances: {
      artifactId: 'fwd',
      checksumSha256: checksum('a'),
      rows: 2,
      cols: 4,
      valueType: 'UINT32_HOPS' as const,
      layout: 'LANDMARK_MAJOR' as const,
      byteLength: 32,
    },
    reverseDistances: directed ? {
      artifactId: 'rev',
      checksumSha256: checksum('b'),
      rows: 2,
      cols: 4,
      valueType: 'UINT32_HOPS' as const,
      layout: 'LANDMARK_MAJOR' as const,
      byteLength: 32,
    } : null,
    distanceValueType: 'UINT32_HOPS' as const,
    distanceExactness: 'EXACT_INTEGER' as const,
    quantizedForExactSearch: false as const,
    precomputeExecutor: 'NETWORKX_REFERENCE' as const,
    unreachableSentinel: 'UINT_MAX' as const,
    producerRevision: 'test',
  };
}

describe('ALT landmark lower bound', () => {
  it('evaluates undirected triangle-inequality max difference', () => {
    const distances = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
    ];
    const result = evaluateAltLowerBound({
      requestId: 'r1',
      snapshot: snapshot(false),
      accessor: { forward: (l, n) => distances[l][n] },
      frontierOrdinals: [1, 2],
      targetOrdinal: 3,
      producerRevision: 'test',
    });
    expect(Array.from(result.heuristic)).toEqual([2, 1]);
    expect(result.receipt.admissibility).toBe('PROVEN_LOWER_BOUND');
  });

  it('evaluates both directed ALT inequalities', () => {
    const forward = [
      [0, 1, 4, 5],
      [4, 3, 1, 0],
    ];
    const reverse = [
      [0, 2, 3, 6],
      [5, 3, 1, 0],
    ];
    const result = evaluateAltLowerBound({
      requestId: 'r2',
      snapshot: snapshot(true),
      accessor: {
        forward: (l, n) => forward[l][n],
        reverse: (l, n) => reverse[l][n],
      },
      frontierOrdinals: [1],
      targetOrdinal: 3,
      producerRevision: 'test',
    });
    expect(result.heuristic[0]).toBe(4);
  });

  it('skips unreachable landmark pairs instead of converting them to fake zero distances', () => {
    const inf = Number.POSITIVE_INFINITY;
    const result = evaluateAltLowerBound({
      requestId: 'r3',
      snapshot: snapshot(false),
      accessor: {
        forward: (l, n) => (l === 0 ? [0, inf, 2, 3][n] : [3, 2, 1, 0][n]),
      },
      frontierOrdinals: [1],
      targetOrdinal: 3,
      producerRevision: 'test',
    });
    expect(result.heuristic[0]).toBe(2);
    expect(result.receipt.unreachablePairCount).toBeGreaterThan(0);
  });

  it('keeps aggressive scores as tie-breakers after exact f=g+h', () => {
    expect(altAStarPriority(3, 4)).toBe(7);
    expect(compareExactThenAggressive({
      left: { exactF: 7, aggressiveH: 0.2, canonicalId: 'A' },
      right: { exactF: 7, aggressiveH: 0.8, canonicalId: 'B' },
    })).toBeLessThan(0);
    expect(compareExactThenAggressive({
      left: { exactF: 8, aggressiveH: 0, canonicalId: 'A' },
      right: { exactF: 7, aggressiveH: 1, canonicalId: 'B' },
    })).toBeGreaterThan(0);
  });
});
