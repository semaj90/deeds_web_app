import { describe, expect, it } from 'vitest';
import { buildAltGpuPrecomputePlan, evaluateAltSnapshotPromotion } from './alt-cugraph-precompute-plan.js';
import { materializePersistentAltArtifacts, persistentAltArtifactAccessor } from './alt-landmark-artifact-codec.js';
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
  ],
  edges: [
    { source: 'nA', target: 'nB', kind: 'CALLS' as const },
    { source: 'nB', target: 'nC', kind: 'CALLS' as const },
  ],
};

function projection(weighted: boolean) {
  return {
    schema: 'atlas.graph-projection-manifest.v1' as const,
    workspaceRevision: 'ws-1',
    sourceRevision: 'src-1',
    graphRevision: 'g-1',
    projectionRevision: weighted ? 'gp-w' : 'gp-u',
    directed: true,
    weighted,
    multigraph: false,
    symmetrized: false,
    transposed: false,
    renumbered: false,
    layout: 'CSR' as const,
    nodeCount: 3,
    edgeCount: 2,
    edgeWeightMinimum: weighted ? 1 : null,
    negativeWeightsPresent: false,
    executor: 'CUGRAPH_GPU' as const,
    producerRevision: 'test',
  };
}

describe('ALT cuGraph precompute plan', () => {
  it('dispatches unweighted directed landmark runs to BFS on canonical and transposed views', () => {
    const plan = buildAltGpuPrecomputePlan({
      projection: projection(false),
      landmarkRevision: 'lm-1',
      landmarkCanonicalIds: ['A', 'C'],
      producerRevision: 'test',
    });
    expect(plan.forwardExecutor).toBe('CUGRAPH_BFS');
    expect(plan.reverseExecutor).toBe('CUGRAPH_BFS');
    expect(plan.jobs).toHaveLength(4);
    expect(plan.jobs.filter((job) => job.graphView === 'TRANSPOSED')).toHaveLength(2);
  });

  it('dispatches weighted landmark runs to SSSP', () => {
    const plan = buildAltGpuPrecomputePlan({
      projection: projection(true),
      landmarkRevision: 'lm-2',
      landmarkCanonicalIds: ['A'],
      producerRevision: 'test',
    });
    expect(plan.forwardExecutor).toBe('CUGRAPH_SSSP');
    expect(plan.jobs.every((job) => job.algorithm === 'SSSP')).toBe(true);
  });

  it('materializes explicit little-endian bytes and then passes structural promotion', () => {
    const reference = precomputeAltLandmarks({
      graph,
      projection: projection(false),
      landmarkRevision: 'lm-persist',
      costModelRevision: 'cost-v1',
      producerRevision: 'test',
      landmarkCount: 1,
      selectionStrategy: 'EXPLICIT',
      explicitLandmarkCanonicalIds: ['A'],
    });
    const inMemoryAccessor = landmarkArtifactAccessor({
      snapshot: reference.snapshot,
      forwardBytes: reference.forward.bytes,
      reverseBytes: reference.reverse?.bytes,
    });
    const persistent = materializePersistentAltArtifacts({
      snapshot: reference.snapshot,
      accessor: inMemoryAccessor,
    });
    expect(persistent.snapshot.forwardDistances.byteOrder).toBe('LITTLE_ENDIAN');
    expect(persistent.snapshot.reverseDistances?.byteOrder).toBe('LITTLE_ENDIAN');

    const decoded = persistentAltArtifactAccessor({
      snapshot: persistent.snapshot,
      forwardBytes: persistent.forwardBytes,
      reverseBytes: persistent.reverseBytes,
    });
    expect(decoded.forward(0, 2)).toBe(2);

    const gate = evaluateAltSnapshotPromotion({
      snapshot: persistent.snapshot,
      expectedGraphRevision: 'g-1',
      expectedProjectionRevision: 'gp-u',
      expectedCostModelRevision: 'cost-v1',
      expectedEdgeCostChecksumSha256: persistent.snapshot.edgeCostChecksumSha256,
      producerRevision: 'test',
    });
    expect(gate.eligible).toBe(true);
    expect(gate.exactSearchAuthority).toBe(true);
  });

  it('withholds exact authority from uncertified weighted floating snapshots', () => {
    const reference = precomputeAltLandmarks({
      graph,
      projection: projection(true),
      landmarkRevision: 'lm-w',
      costModelRevision: 'cost-w',
      producerRevision: 'test',
      landmarkCount: 1,
      selectionStrategy: 'EXPLICIT',
      explicitLandmarkCanonicalIds: ['A'],
      edgeCostsByKind: { CALLS: 1.25 },
    });
    const inMemoryAccessor = landmarkArtifactAccessor({
      snapshot: reference.snapshot,
      forwardBytes: reference.forward.bytes,
      reverseBytes: reference.reverse?.bytes,
    });
    const persistent = materializePersistentAltArtifacts({ snapshot: reference.snapshot, accessor: inMemoryAccessor });
    const gate = evaluateAltSnapshotPromotion({
      snapshot: persistent.snapshot,
      expectedGraphRevision: 'g-1',
      expectedProjectionRevision: 'gp-w',
      expectedCostModelRevision: 'cost-w',
      expectedEdgeCostChecksumSha256: persistent.snapshot.edgeCostChecksumSha256,
      producerRevision: 'test',
    });
    expect(gate.eligible).toBe(true);
    expect(gate.exactSearchAuthority).toBe(false);
    expect(gate.reasonCodes).toContain('FLOAT_DISTANCE_ERROR_BOUND_UNCERTIFIED');
  });
});
