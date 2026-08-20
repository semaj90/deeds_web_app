import { describe, expect, it } from 'vitest';
import {
  condenseSGraph,
  lexicographicalTopologicalSort,
  sortSGraph,
  stronglyConnectedComponents,
  transposeSGraph,
  type SGraphV1,
} from './s-graph-taxonomy.js';

const dag: SGraphV1 = {
  schema: 'atlas.s-graph.v1',
  workspaceRevision: 'w1',
  sourceRevision: 's1',
  graphRevision: 'g1',
  nodes: [
    { id: 'a', canonicalId: 'file:a', kind: 'file' },
    { id: 'b', canonicalId: 'symbol:b', kind: 'symbol' },
    { id: 'c', canonicalId: 'symbol:c', kind: 'symbol' },
  ],
  edges: [
    { source: 'a', target: 'b', kind: 'DEFINES' },
    { source: 'b', target: 'c', kind: 'CALLS' },
  ],
};

describe('SGraphV1 taxonomy', () => {
  it('orders a DAG deterministically', () => {
    expect(lexicographicalTopologicalSort(dag)).toEqual(['a', 'b', 'c']);
    expect(sortSGraph(dag)).toMatchObject({
      algorithm: 'LEXICOGRAPHICAL_TOPOLOGICAL',
      orderedNodeIds: ['a', 'b', 'c'],
      hadCycles: false,
    });
  });

  it('transposes every edge without changing node identity', () => {
    const transposed = transposeSGraph(dag);
    expect(transposed.nodes).toEqual(dag.nodes);
    expect(transposed.edges).toEqual([
      { source: 'b', target: 'a', kind: 'DEFINES' },
      { source: 'c', target: 'b', kind: 'CALLS' },
    ]);
  });

  it('condenses cyclic symbol groups before sorting', () => {
    const cyclic: SGraphV1 = {
      ...dag,
      edges: [
        { source: 'a', target: 'b', kind: 'DEFINES' },
        { source: 'b', target: 'c', kind: 'CALLS' },
        { source: 'c', target: 'b', kind: 'CALLS' },
      ],
    };
    expect(stronglyConnectedComponents(cyclic)).toContainEqual(['b', 'c']);
    const condensation = condenseSGraph(cyclic);
    expect(condensation.components).toHaveLength(2);
    const sorted = sortSGraph(cyclic);
    expect(sorted.algorithm).toBe('SCC_CONDENSATION_TOPOLOGICAL');
    expect(sorted.hadCycles).toBe(true);
    expect(sorted.orderedNodeIds).toEqual(['a', 'b', 'c']);
  });
});
