import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { adaptAtlasRapidsBfsReceiptToCandidateOrdinals } from './graph-neighborhood-candidate-ordinal-v1.js';
import type { AtlasBfsReceiptV1 } from './atlas-rapids-bfs-client.js';

function ordinalMap() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'cand-1',
    workspaceRevision: 'ws-1',
    producerRevision: 'test',
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
        producerRevision: 'test',
      } as never,
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
        producerRevision: 'test',
      } as never,
    ],
  });
}

function bfsReceipt(overrides: Partial<AtlasBfsReceiptV1> = {}): AtlasBfsReceiptV1 {
  return {
    schema: 'atlas.graph-bfs-receipt.v1',
    operation: 'bfs',
    backend: 'cugraph.bfs',
    algorithmRevision: 'atlas.cugraph-bfs.v1',
    graphRevision: 'g-1',
    projectionRevision: 'proj-1',
    nodeTableHash: 'nh',
    edgeTableHash: 'eh',
    seedNodeKey: 'n1',
    seedGpuNodeId: 10,
    direction: 'outbound',
    maxHops: 2,
    maxNodes: 32,
    candidateFilterCount: 2,
    nodeCount: 2,
    edgeCount: 1,
    truncated: false,
    results: [
      {
        rank: 1,
        gpuNodeId: 99,
        nodeKey: 'graph-local-n2',
        packetKey: 'p2',
        hop: 1,
        predecessorGpuNodeId: 10,
        predecessorNodeKey: 'n1',
        proximity: 0.5,
      },
    ],
    timings: { kernelMs: 1, resultSelectMs: 1 },
    ...overrides,
  };
}

describe('cuGraph BFS -> CandidateOrdinal boundary', () => {
  it('resolves packet identity while discarding GPU and predecessor IDs', () => {
    const result = adaptAtlasRapidsBfsReceiptToCandidateOrdinals({
      ordinalMap: ordinalMap(),
      receipt: bfsReceipt(),
      producerRevision: 'test-v1',
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({
      candidateOrdinal: 1,
      hop: 1,
      proximity: 0.5,
      executorIdentityEscaped: false,
    });
    expect(result.receipt.gpuNodeIdsEscapedAboveBoundary).toBe(false);
    expect(result.receipt.predecessorIdsEscapedAboveBoundary).toBe(false);
  });

  it('rejects rows with no canonical packet binding instead of using nodeKey/gpuNodeId', () => {
    const source = bfsReceipt();
    source.results[0] = { ...source.results[0]!, packetKey: null };
    const result = adaptAtlasRapidsBfsReceiptToCandidateOrdinals({
      ordinalMap: ordinalMap(),
      receipt: source,
      producerRevision: 'test-v1',
    });
    expect(result.hits).toEqual([]);
    expect(result.receipt.rejectedHitCount).toBe(1);
  });

  it('rejects graph revision mismatch through candidate resolution', () => {
    const result = adaptAtlasRapidsBfsReceiptToCandidateOrdinals({
      ordinalMap: ordinalMap(),
      receipt: bfsReceipt({ graphRevision: 'g-other' }),
      producerRevision: 'test-v1',
    });
    expect(result.hits).toEqual([]);
    expect(result.receipt.rejectedHitCount).toBe(1);
  });
});
