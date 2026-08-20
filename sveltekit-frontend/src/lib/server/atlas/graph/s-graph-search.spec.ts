import { describe, expect, it } from 'vitest';
import { searchSGraph, type SGraphSearchPlanV1 } from './s-graph-search.js';
import type { SGraphV1 } from './s-graph-taxonomy.js';

const graph: SGraphV1 = {
  schema: 'atlas.s-graph.v1',
  workspaceRevision: 'ws-1',
  sourceRevision: 'src-1',
  graphRevision: 'g-1',
  nodes: [
    { id: 'nA', canonicalId: 'A', kind: 'symbol' },
    { id: 'nB', canonicalId: 'B', kind: 'symbol' },
    { id: 'nC', canonicalId: 'C', kind: 'symbol' },
    { id: 'nD', canonicalId: 'D', kind: 'symbol' },
    { id: 'nE', canonicalId: 'E', kind: 'symbol' },
  ],
  edges: [
    { source: 'nA', target: 'nB', kind: 'CALLS' },
    { source: 'nA', target: 'nC', kind: 'REFERENCES' },
    { source: 'nB', target: 'nD', kind: 'CALLS' },
    { source: 'nC', target: 'nE', kind: 'REFERENCES' },
    { source: 'nE', target: 'nD', kind: 'CALLS' },
  ],
};

function plan(overrides: Partial<SGraphSearchPlanV1>): SGraphSearchPlanV1 {
  return {
    schema: 'atlas.s-graph-search-plan.v1',
    requestId: 'req-1',
    workspaceRevision: 'ws-1',
    graphRevision: 'g-1',
    algorithm: 'BREADTH_FIRST',
    sourceCanonicalId: 'A',
    targetCanonicalIds: ['D'],
    maxDepth: 8,
    maxExpansions: 100,
    beamWidth: null,
    edgeCostModel: 'UNIFORM',
    heuristicKind: 'ZERO',
    heuristicAdmissibility: 'NOT_REQUIRED',
    requireOptimalPath: true,
    exactPromotionRequired: true,
    producerRevision: 'test',
    ...overrides,
  };
}

describe('SGraph search ladder', () => {
  it('BFS returns the minimum-hop path under uniform edge costs', () => {
    const receipt = searchSGraph({ graph, plan: plan({}) });
    expect(receipt.found).toBe(true);
    expect(receipt.pathCanonicalIds).toEqual(['A', 'B', 'D']);
    expect(receipt.pathCost).toBe(2);
    expect(receipt.optimalityClaim).toBe('SHORTEST_HOPS');
    expect(receipt.approximate).toBe(false);
  });

  it('uniform-cost search chooses the cheaper weighted path even when it has more hops', () => {
    const receipt = searchSGraph({
      graph,
      plan: plan({
        algorithm: 'UNIFORM_COST',
        edgeCostModel: 'EDGE_KIND_COST',
        heuristicKind: 'ZERO',
        heuristicAdmissibility: 'NOT_REQUIRED',
        beamWidth: null,
      }),
      edgeCostsByKind: { CALLS: 5, REFERENCES: 1 },
    });
    expect(receipt.pathCanonicalIds).toEqual(['A', 'C', 'E', 'D']);
    expect(receipt.pathCost).toBe(7);
    expect(receipt.optimalityClaim).toBe('LOWEST_NONNEGATIVE_COST');
  });

  it('greedy best-first follows the heuristic but makes no optimality claim', () => {
    const receipt = searchSGraph({
      graph,
      plan: plan({
        algorithm: 'GREEDY_BEST_FIRST',
        requireOptimalPath: false,
        heuristicKind: 'PCA_LATENT_ESTIMATE',
        heuristicAdmissibility: 'UNPROVEN',
      }),
      heuristicByCanonicalId: { A: 2, B: 4, C: 1, E: 0.5, D: 0 },
    });
    expect(receipt.pathCanonicalIds).toEqual(['A', 'C', 'E', 'D']);
    expect(receipt.optimalityClaim).toBe('NONE');
    expect(receipt.approximate).toBe(true);
  });

  it('beam search remains explicitly approximate', () => {
    const receipt = searchSGraph({
      graph,
      plan: plan({
        algorithm: 'BEAM',
        requireOptimalPath: false,
        beamWidth: 1,
        heuristicKind: 'SPECTRAL_ESTIMATE',
        heuristicAdmissibility: 'UNPROVEN',
      }),
      heuristicByCanonicalId: { A: 3, B: 5, C: 1, E: 0.5, D: 0 },
    });
    expect(receipt.found).toBe(true);
    expect(receipt.pathCanonicalIds).toEqual(['A', 'C', 'E', 'D']);
    expect(receipt.approximate).toBe(true);
  });

  it('A* with a proven lower-bound heuristic preserves the optimal weighted path claim', () => {
    const receipt = searchSGraph({
      graph,
      plan: plan({
        algorithm: 'A_STAR',
        edgeCostModel: 'EDGE_KIND_COST',
        heuristicKind: 'GRAPH_LOWER_BOUND',
        heuristicAdmissibility: 'PROVEN_LOWER_BOUND',
        requireOptimalPath: true,
      }),
      edgeCostsByKind: { CALLS: 5, REFERENCES: 1 },
      heuristicByCanonicalId: { A: 2, B: 5, C: 1, E: 0.5, D: 0 },
    });
    expect(receipt.pathCanonicalIds).toEqual(['A', 'C', 'E', 'D']);
    expect(receipt.pathCost).toBe(7);
    expect(receipt.optimalityClaim).toBe('CONDITIONAL_ON_ADMISSIBLE_HEURISTIC');
    expect(receipt.approximate).toBe(false);
  });

  it('rejects an optimal A* claim from an unproven PCA heuristic', () => {
    expect(() => searchSGraph({
      graph,
      plan: plan({
        algorithm: 'A_STAR',
        heuristicKind: 'PCA_LATENT_ESTIMATE',
        heuristicAdmissibility: 'UNPROVEN',
        requireOptimalPath: true,
      }),
      heuristicByCanonicalId: { A: 2, B: 1, C: 1, D: 0, E: 0.5 },
    })).toThrow(/Optimal A\*/);
  });
});
