import { describe, expect, it } from 'vitest';

import {
  buildSemanticKnnGraphV1,
  connectedComponentsFromAdjacencyV1,
  flattenEmbeddingMatrixV1,
  maxAbsDifferenceV1,
  pageRankCpuOracleV1,
} from './semantic-knn-graph-v1';

function v(...values: number[]): Float32Array {
  return new Float32Array(values);
}

describe('semantic-knn-graph-v1', () => {
  it('flattens embeddings row-major and rejects mixed dimensions', () => {
    expect(Array.from(flattenEmbeddingMatrixV1([v(1, 2), v(3, 4)]))).toEqual([1, 2, 3, 4]);
    expect(() => flattenEmbeddingMatrixV1([v(1, 2), v(3)])).toThrow(/DIMENSION_MISMATCH/);
  });

  it('builds a deterministic symmetric kNN graph without canonical authority', () => {
    const vectors = [
      v(1, 0),
      v(0.99, 0.01),
      v(0, 1),
      v(0.01, 0.99),
    ];
    const a = buildSemanticKnnGraphV1(vectors, { k: 1, symmetric: true, minSimilarity: 0 });
    const b = buildSemanticKnnGraphV1(vectors, { k: 1, symmetric: true, minSimilarity: 0 });

    expect(a.canonicalAuthority).toBe(false);
    expect(a.nodeCount).toBe(4);
    expect(a.k).toBe(1);
    expect(Array.from(a.adjacency)).toEqual(Array.from(b.adjacency));
    expect(a.adjacency[0 * 4 + 1]).toBeGreaterThan(0.99);
    expect(a.adjacency[1 * 4 + 0]).toBe(a.adjacency[0 * 4 + 1]);
    expect(a.adjacency[2 * 4 + 3]).toBeGreaterThan(0.99);
    expect(a.adjacency[3 * 4 + 2]).toBe(a.adjacency[2 * 4 + 3]);
  });

  it('uses stable index tie-breaking for equal similarities', () => {
    const graph = buildSemanticKnnGraphV1(
      [v(1, 0), v(0, 1), v(0, -1)],
      { k: 1, symmetric: false, minSimilarity: -1 },
    );
    // Node 0 has equal cosine 0 to nodes 1 and 2; lower ordinal wins.
    expect(graph.adjacency[1]).toBe(0);
    expect(graph.adjacency[2]).toBe(0);
    // Even though zero weights are not materialized as graph edges, replay is deterministic.
    const replay = buildSemanticKnnGraphV1(
      [v(1, 0), v(0, 1), v(0, -1)],
      { k: 1, symmetric: false, minSimilarity: -1 },
    );
    expect(Array.from(graph.adjacency)).toEqual(Array.from(replay.adjacency));
  });

  it('computes PageRank oracle with normalized finite scores', () => {
    const n = 3;
    const adjacency = new Float32Array([
      0, 1, 0,
      0, 0, 1,
      1, 0, 0,
    ]);
    const ranks = pageRankCpuOracleV1(adjacency, n, 0.85, 60);
    const sum = Array.from(ranks).reduce((acc, value) => acc + value, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(Array.from(ranks).every(Number.isFinite)).toBe(true);
    expect(maxAbsDifferenceV1(ranks, new Float32Array([1 / 3, 1 / 3, 1 / 3]))).toBeLessThan(1e-5);
  });

  it('detects connected components over directed or symmetric edges', () => {
    const n = 4;
    const adjacency = new Float32Array(n * n);
    adjacency[0 * n + 1] = 1;
    adjacency[2 * n + 3] = 1;
    const components = connectedComponentsFromAdjacencyV1(adjacency, n);
    expect(components[0]).toBe(components[1]);
    expect(components[2]).toBe(components[3]);
    expect(components[0]).not.toBe(components[2]);
  });

  it('fails closed when adjacency shape is invalid', () => {
    expect(() => pageRankCpuOracleV1(new Float32Array(3), 2)).toThrow(/SHAPE_MISMATCH/);
    expect(() => connectedComponentsFromAdjacencyV1(new Float32Array(3), 2)).toThrow(/SHAPE_MISMATCH/);
  });
});
