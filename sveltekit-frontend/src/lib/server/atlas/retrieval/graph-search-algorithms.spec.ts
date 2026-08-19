import { describe, expect, it } from 'vitest';
import { aStarSearch, breadthFirstSearch, greedyBestFirstSearch, type GraphSearchGraph } from './graph-search-algorithms.js';

function graph(edges: Array<[string, string, number]>): GraphSearchGraph {
  const map = new Map<string, Array<{ from: string; to: string; cost: number }>>();
  for (const [from, to, cost] of edges) {
    const arr = map.get(from) ?? [];
    arr.push({ from, to, cost });
    map.set(from, arr);
  }
  return { neighbors: (node) => map.get(node) ?? [] };
}

const budget = { maxDepth: 8, maxExpanded: 100, maxFrontier: 100 };

describe('graph search fallbacks', () => {
  it('BFS returns a minimum-hop path', () => {
    const g = graph([
      ['A', 'B', 10], ['B', 'D', 10],
      ['A', 'C', 1], ['C', 'E', 1], ['E', 'D', 1],
    ]);
    expect(breadthFirstSearch({ graph: g, start: 'A', goal: 'D', budget })?.nodes).toEqual(['A', 'B', 'D']);
  });

  it('A* refuses an unproven heuristic', () => {
    const g = graph([['A', 'B', 1]]);
    expect(() => aStarSearch({
      graph: g,
      start: 'A',
      goal: 'B',
      heuristic: () => 0,
      heuristicAdmissible: false,
      budget,
    })).toThrow('ASTAR_HEURISTIC_NOT_PROVEN_ADMISSIBLE');
  });

  it('A* finds the lower-cost path with an admissible zero heuristic', () => {
    const g = graph([
      ['A', 'B', 10], ['B', 'D', 10],
      ['A', 'C', 1], ['C', 'E', 1], ['E', 'D', 1],
    ]);
    expect(aStarSearch({
      graph: g,
      start: 'A',
      goal: 'D',
      heuristic: () => 0,
      heuristicAdmissible: true,
      budget,
    })?.nodes).toEqual(['A', 'C', 'E', 'D']);
  });

  it('greedy best-first is allowed to be relevance-oriented rather than optimal', () => {
    const g = graph([
      ['A', 'B', 10], ['B', 'D', 10],
      ['A', 'C', 1], ['C', 'D', 1],
    ]);
    const h = (node: string) => ({ A: 2, B: 0, C: 1, D: 0 }[node] ?? 100);
    const result = greedyBestFirstSearch({ graph: g, start: 'A', goal: 'D', heuristic: h, budget });
    expect(result?.strategy).toBe('GREEDY_BEST_FIRST');
  });
});
