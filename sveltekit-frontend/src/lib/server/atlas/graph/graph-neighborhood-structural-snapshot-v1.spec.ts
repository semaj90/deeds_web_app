import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeBfsStructuralFeatureSnapshotV1 } from './graph-neighborhood-structural-snapshot-v1.js';
import type { GraphNeighborhoodHitV1 } from './graph-neighborhood-candidate-ordinal-v1.js';

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

function hit(map: ReturnType<typeof ordinalMap>, candidateOrdinal: number, hop: number): GraphNeighborhoodHitV1 {
  return {
    schema: 'atlas.graph-neighborhood-hit.v1',
    candidateOrdinal,
    hop,
    proximity: 1 / (1 + hop),
    rank: candidateOrdinal + 1,
    executor: 'CUGRAPH_BFS',
    graphRevision: 'g-1',
    projectionRevision: 'proj-1',
    algorithmRevision: 'atlas.cugraph-bfs.v1',
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    identityAuthority: false,
    executorIdentityEscaped: false,
  };
}

describe('BFS -> StructuralFeatureSnapshotV1', () => {
  it('materializes only observed hop/proximity features', () => {
    const map = ordinalMap();
    const snapshot = materializeBfsStructuralFeatureSnapshotV1({
      ordinalMap: map,
      hits: [hit(map, 1, 2), hit(map, 0, 0)],
      producerRevision: 'bfs-snapshot-test-v1',
      generatedAt: '2026-08-22T18:00:00.000Z',
    });

    expect(snapshot.executor).toBe('cugraph');
    expect(snapshot.algorithmSet).toEqual(['atlas.cugraph-bfs.v1']);
    expect(snapshot.rows.map((row) => row.candidateOrdinal)).toEqual([0, 1]);
    expect(snapshot.rows[0]).toMatchObject({
      canonicalId: 'c1',
      queryProximity: 1,
      structuralDistance: 0,
      graphAuthority: null,
      communityId: null,
      neighborhoodOverlap: null,
      structuralAffinity: null,
    });
    expect(snapshot.rows[1]).toMatchObject({ queryProximity: 1 / 3, structuralDistance: 2 });
  });

  it('rejects mixed projection revisions', () => {
    const map = ordinalMap();
    const second = { ...hit(map, 1, 1), projectionRevision: 'proj-other' };
    expect(() => materializeBfsStructuralFeatureSnapshotV1({
      ordinalMap: map,
      hits: [hit(map, 0, 0), second],
      producerRevision: 'test',
    })).toThrow('BFS_STRUCTURAL_REVISION_SET_MISMATCH');
  });

  it('does not accept a graph revision that differs from the canonical candidate map', () => {
    const map = ordinalMap();
    const wrong = { ...hit(map, 0, 1), graphRevision: 'g-other' };
    expect(() => materializeBfsStructuralFeatureSnapshotV1({
      ordinalMap: map,
      hits: [wrong],
      producerRevision: 'test',
    })).toThrow('BFS_STRUCTURAL_GRAPH_REVISION_MISMATCH:0');
  });
});
