import { describe, expect, it, vi } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  admitAtlasRapidsBfsV1,
  executeAtlasRapidsBfsStructuralSnapshotV1,
  type AtlasRapidsBfsClientLike,
  type ExecuteGraphNeighborhoodV1Input,
} from './graph-neighborhood-executor-v1.js';

function ordinalMap() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'cand-1',
    workspaceRevision: 'ws-1',
    producerRevision: 'test-map',
    candidates: [
      {
        canonicalId: 'c1',
        packetKey: 'p1',
        treeNodeId: 't1',
        symbolVersionId: 's1',
        workspaceRevision: 'ws-1',
        sourceRevision: 'src-1',
        graphRevision: 'g-1',
        semanticRevision: 'sem-1',
        degradedIdentity: false,
        evidenceRefs: [],
      },
      {
        canonicalId: 'c2',
        packetKey: 'p2',
        treeNodeId: 't2',
        symbolVersionId: 's2',
        workspaceRevision: 'ws-1',
        sourceRevision: 'src-2',
        graphRevision: 'g-1',
        semanticRevision: 'sem-1',
        degradedIdentity: false,
        evidenceRefs: [],
      },
    ],
  });
}

function input(overrides: Partial<ExecuteGraphNeighborhoodV1Input> = {}): ExecuteGraphNeighborhoodV1Input {
  return {
    ordinalMap: ordinalMap(),
    graphRevision: 'g-1',
    seedNodeKey: 'graph:n1',
    candidateNodeKeys: ['graph:n1', 'graph:n2'],
    maxHops: 2,
    maxNodes: 32,
    direction: 'outbound',
    edgeTypes: [],
    gpuAvailable: true,
    frozenSnapshotAvailable: true,
    producerRevision: 'graph-bfs:test-v1',
    deadlineMs: 1000,
    ...overrides,
  };
}

function client(): AtlasRapidsBfsClientLike {
  return {
    bfs: vi.fn(async (request) => ({
      schema: 'atlas.graph-bfs-receipt.v1',
      operation: 'bfs',
      backend: 'cugraph.bfs',
      algorithmRevision: 'atlas.cugraph-bfs.v1',
      graphRevision: request.graphRevision,
      projectionRevision: 'proj-1',
      nodeTableHash: 'nh',
      edgeTableHash: 'eh',
      seedNodeKey: request.seedNodeKey,
      seedGpuNodeId: 0,
      direction: 'outbound',
      maxHops: request.maxHops ?? 2,
      maxNodes: request.maxNodes ?? 128,
      candidateFilterCount: request.candidateNodeKeys?.length ?? 0,
      nodeCount: 2,
      edgeCount: 1,
      truncated: false,
      results: [
        {
          rank: 1,
          gpuNodeId: 0,
          nodeKey: 'graph:n1',
          packetKey: 'p1',
          hop: 0,
          predecessorGpuNodeId: null,
          predecessorNodeKey: null,
          proximity: 1,
        },
        {
          rank: 2,
          gpuNodeId: 1,
          nodeKey: 'graph:n2',
          packetKey: 'p2',
          hop: 1,
          predecessorGpuNodeId: 0,
          predecessorNodeKey: 'graph:n1',
          proximity: 0.5,
        },
      ],
      timings: { kernelMs: 1, resultSelectMs: 1 },
    })),
  };
}

describe('cuGraph BFS structural executor', () => {
  it('admits only the proven frozen outbound no-filter shape', () => {
    expect(admitAtlasRapidsBfsV1(input())).toEqual({
      admitted: true,
      reasonCodes: ['GPU_FROZEN_GRAPH_OUTBOUND_BFS_ADMITTED'],
    });
  });

  it('fails closed for reverse traversal and edge filtering', () => {
    const gate = admitAtlasRapidsBfsV1(input({ direction: 'both', edgeTypes: ['CALLS'] }));
    expect(gate.admitted).toBe(false);
    expect(gate.reasonCodes).toContain('DIRECTION_NOT_PROVEN:both');
    expect(gate.reasonCodes).toContain('EDGE_TYPE_FILTERING_NOT_PROVEN');
  });

  it('fails closed when candidate graph revisions do not match the requested graph', () => {
    const gate = admitAtlasRapidsBfsV1(input({ graphRevision: 'g-other' }));
    expect(gate.admitted).toBe(false);
    expect(gate.reasonCodes).toContain('CANDIDATE_GRAPH_REVISION_SET_MISMATCH');
  });

  it('executes transport -> ordinal normalization -> structural snapshot', async () => {
    const fakeClient = client();
    const result = await executeAtlasRapidsBfsStructuralSnapshotV1(input(), fakeClient);
    expect(fakeClient.bfs).toHaveBeenCalledOnce();
    expect(result.normalizationReceipt.outputHitCount).toBe(2);
    expect(result.normalizationReceipt.gpuNodeIdsEscapedAboveBoundary).toBe(false);
    expect(result.snapshot.rows).toEqual([
      expect.objectContaining({ candidateOrdinal: 0, canonicalId: 'c1', structuralDistance: 0, queryProximity: 1 }),
      expect.objectContaining({ candidateOrdinal: 1, canonicalId: 'c2', structuralDistance: 1, queryProximity: 0.5 }),
    ]);
  });
});
