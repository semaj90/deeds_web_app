import { describe, expect, it } from 'vitest';
import { evaluateAltLowerBound } from './alt-landmark-heuristic.js';
import { landmarkArtifactAccessor, precomputeAltLandmarks } from './alt-landmark-precompute.js';

const graph = {
  schema: 'atlas.s-graph.v1' as const,
  workspaceRevision: 'ws-1',
  sourceRevision: 'src-1',
  graphRevision: 'g-1',
  nodes: [
    { id: 'nA', canonicalId: 'A', kind: 'symbol' as const },
    { id: 'nB', canonicalId: 'B', kind: 'symbol' as const },
    { id: 'nC', canonicalId: 'C', kind: 'symbol' as const },
    { id: 'nD', canonicalId: 'D', kind: 'symbol' as const },
  ],
  edges: [
    { source: 'nA', target: 'nB', kind: 'CALLS' as const },
    { source: 'nB', target: 'nC', kind: 'CALLS' as const },
    { source: 'nC', target: 'nD', kind: 'CALLS' as const },
  ],
};

function projection(directed: boolean, weighted = false) {
  return {
    schema: 'atlas.graph-projection-manifest.v1' as const,
    workspaceRevision: 'ws-1',
    sourceRevision: 'src-1',
    graphRevision: 'g-1',
    projectionRevision: weighted ? 'gp-weighted' : 'gp-unweighted',
    directed,
    weighted,
    multigraph: false,
    symmetrized: false,
    transposed: false,
    renumbered: false,
    layout: 'COO' as const,
    nodeCount: 4,
    edgeCount: 3,
    edgeWeightMinimum: weighted ? 1 : null,
    negativeWeightsPresent: false,
    executor: 'TYPESCRIPT_REFERENCE' as const,
    producerRevision: 'test',
  };
}

describe('ALT landmark precompute', () => {
  it('builds exact directed hop artifacts with graph and transpose distances', () => {
    const result = precomputeAltLandmarks({
      graph,
      projection: projection(true),
      landmarkRevision: 'lm-1',
      costModelRevision: 'cost-1',
      producerRevision: 'test',
      landmarkCount: 1,
      selectionStrategy: 'EXPLICIT',
      explicitLandmarkCanonicalIds: ['A'],
    });

    expect(result.nodeOrdinals).toEqual(['A', 'B', 'C', 'D']);
    expect(result.snapshot.distanceValueType).toBe('UINT32_HOPS');
    expect(result.snapshot.distanceExactness).toBe('EXACT_INTEGER');
    expect(result.snapshot.reverseDistances).not.toBeNull();
    expect(result.receipt.precomputeAlgorithm).toBe('BFS');

    const accessor = landmarkArtifactAccessor({
      snapshot: result.snapshot,
      forwardBytes: result.forward.bytes,
      reverseBytes: result.reverse?.bytes,
    });
    expect(accessor.forward(0, 0)).toBe(0);
    expect(accessor.forward(0, 3)).toBe(3);
    expect(accessor.reverse?.(0, 3)).toBe(Number.POSITIVE_INFINITY);
  });

  it('converts UINT_MAX unreachable sentinel to Infinity before heuristic math', () => {
    const disconnected = {
      ...graph,
      nodes: [...graph.nodes, { id: 'nZ', canonicalId: 'Z', kind: 'symbol' as const }],
    };
    const proj = { ...projection(false), nodeCount: 5 };
    const result = precomputeAltLandmarks({
      graph: disconnected,
      projection: proj,
      landmarkRevision: 'lm-2',
      costModelRevision: 'cost-1',
      producerRevision: 'test',
      landmarkCount: 1,
      selectionStrategy: 'EXPLICIT',
      explicitLandmarkCanonicalIds: ['A'],
    });
    const accessor = landmarkArtifactAccessor({
      snapshot: result.snapshot,
      forwardBytes: result.forward.bytes,
    });
    const zOrdinal = result.nodeOrdinalByCanonicalId.get('Z');
    expect(zOrdinal).toBeDefined();
    expect(accessor.forward(0, zOrdinal!)).toBe(Number.POSITIVE_INFINITY);
  });

  it('selects disconnected regions first under deterministic farthest-point selection', () => {
    const disconnected = {
      ...graph,
      nodes: [...graph.nodes, { id: 'nZ', canonicalId: 'Z', kind: 'symbol' as const }],
    };
    const proj = { ...projection(false), nodeCount: 5 };
    const result = precomputeAltLandmarks({
      graph: disconnected,
      projection: proj,
      landmarkRevision: 'lm-3',
      costModelRevision: 'cost-1',
      producerRevision: 'test',
      landmarkCount: 2,
      selectionStrategy: 'FARTHEST_GRAPH_DISTANCE',
    });
    expect(result.snapshot.landmarkCanonicalIds).toEqual(['A', 'Z']);
  });

  it('marks weighted floating reference snapshots non-authoritative for exact termination until error is certified', () => {
    const result = precomputeAltLandmarks({
      graph,
      projection: projection(true, true),
      landmarkRevision: 'lm-4',
      costModelRevision: 'weighted-v1',
      producerRevision: 'test',
      landmarkCount: 1,
      selectionStrategy: 'EXPLICIT',
      explicitLandmarkCanonicalIds: ['A'],
      edgeCostsByKind: { CALLS: 1.25 },
    });
    expect(result.snapshot.distanceValueType).toBe('FLOAT64_COST');
    expect(result.snapshot.distanceExactness).toBe('AUTHORITATIVE_FLOAT');
    expect(result.snapshot.floatingErrorBoundCertified).toBe(false);
    expect(result.snapshot.edgeCostChecksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const accessor = landmarkArtifactAccessor({
      snapshot: result.snapshot,
      forwardBytes: result.forward.bytes,
      reverseBytes: result.reverse?.bytes,
    });
    const evaluated = evaluateAltLowerBound({
      requestId: 'weighted-alt',
      snapshot: result.snapshot,
      accessor,
      frontierOrdinals: [1],
      targetOrdinal: 3,
      producerRevision: 'test',
    });
    expect(evaluated.receipt.admissibility).toBe('UNPROVEN_NUMERIC');
    expect(evaluated.receipt.mayTerminateExactSearch).toBe(false);
  });
});
