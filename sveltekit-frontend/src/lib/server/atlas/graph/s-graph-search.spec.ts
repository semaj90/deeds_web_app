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
    allowedEdgeKinds: ['CALLS', 'REFERENCES'],
    maxDepth: 8,
    maxExpansions: 100,
    maxPathCost: 100,
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

  it('restricts traversal to the edge kinds declared by the plan', () => {
    const receipt = searchSGraph({
      graph,
      plan: plan({ allowedEdgeKinds: ['CALLS'] }),
    });
    expect(receipt.pathCanonicalIds).toEqual(['A', 'B', 'D']);
    expect(receipt.allowedEdgeKinds).toEqual(['CALLS']);
  });

  it('searches from multiple roots with deterministic seed ordering', () => {
    const first = searchSGraph({
      graph,
      plan: {
        ...plan({}),
        sourceCanonicalId: undefined,
        sourceCanonicalIds: ['C', 'A'],
      },
    });
    const reversed = searchSGraph({
      graph,
      plan: {
        ...plan({}),
        sourceCanonicalId: undefined,
        sourceCanonicalIds: ['A', 'C'],
      },
    });
    expect(first.sourceCanonicalIds).toEqual(['A', 'C']);
    expect(first.pathCanonicalIds).toEqual(['A', 'B', 'D']);
    expect(reversed.pathCanonicalIds).toEqual(first.pathCanonicalIds);
  });

  it('enforces and reports the path-cost ceiling', () => {
    const boundedPlan = plan({
      edgeCostModel: 'EDGE_KIND_COST',
      maxPathCost: 6,
      requireOptimalPath: false,
    });
    const receipt = searchSGraph({
      graph,
      plan: boundedPlan,
      edgeCostsByKind: { CALLS: 5, REFERENCES: 1 },
    });
    expect(receipt.found).toBe(false);
    expect(receipt.termination).toBe('PATH_COST_LIMIT_REACHED');
    expect(receipt.maxPathCost).toBe(6);
  });

  it.each(['UNIFORM_COST', 'GREEDY_BEST_FIRST', 'BEAM', 'A_STAR'] as const)(
    '%s honors the same path-cost ceiling',
    (algorithm) => {
      const receipt = searchSGraph({
        graph,
        plan: plan({
          algorithm,
          edgeCostModel: 'EDGE_KIND_COST',
          maxPathCost: 6,
          beamWidth: algorithm === 'BEAM' ? 2 : null,
          heuristicKind: 'ZERO',
          heuristicAdmissibility: 'NOT_REQUIRED',
          requireOptimalPath: algorithm !== 'GREEDY_BEST_FIRST' && algorithm !== 'BEAM',
        }),
        edgeCostsByKind: { CALLS: 5, REFERENCES: 1 },
      });
      expect(receipt.found).toBe(false);
      expect(receipt.termination).toBe('PATH_COST_LIMIT_REACHED');
    },
  );

  it('rejects duplicate edge kinds in the plan', () => {
    expect(() => searchSGraph({
      graph,
      plan: plan({ allowedEdgeKinds: ['CALLS', 'CALLS'] }),
    })).toThrow(/allowedEdgeKinds must be unique/);
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
