import { describe, expect, it } from 'vitest';
import { buildStructuralGraphSnapshotFromIncidenceV1 } from './structural-graph-snapshot-from-incidence-v1.js';

const checksum = 'a'.repeat(64);

function projection(workspaceRevision = 'workspace:W1') {
  return {
    schema: 'atlas.incidence-projection.v1',
    workspaceRevision,
    projectionRevision: 'projection:P1',
    nodes: [],
    edges: [],
    entityCount: 0,
    relationCount: 0,
    unresolvedParticipantCount: 0,
    nodeTableHash: 'b'.repeat(64),
    edgeTableHash: 'c'.repeat(64),
    projectionHash: 'd'.repeat(64),
  } as any;
}

describe('buildStructuralGraphSnapshotFromIncidenceV1', () => {
  it('allows workspaceRevision and candidateSnapshotRevision to be different coordinates', () => {
    const snapshot = buildStructuralGraphSnapshotFromIncidenceV1({
      projection: projection('workspace:W1'),
      graphRevision: 'graph:sha256:' + 'e'.repeat(64),
      candidateBinding: {
        workspaceRevision: 'workspace:W1',
        candidateSnapshotRevision: 'candidate:C42',
        ordinalMapChecksum: checksum,
        rowCount: 12,
      },
      edgeArtifact: {
        format: 'ARROW_IPC',
        checksum: 'f'.repeat(64),
        ref: 'fixture.arrow',
      },
    });

    expect(snapshot.workspaceRevision).toBe('workspace:W1');
    expect(snapshot.candidateSnapshotRevision).toBe('candidate:C42');
    expect(snapshot.ordinalMapChecksum).toBe(checksum);
  });

  it('rejects only a candidate-map workspace mismatch', () => {
    expect(() =>
      buildStructuralGraphSnapshotFromIncidenceV1({
        projection: projection('workspace:W1'),
        graphRevision: 'graph:sha256:' + 'e'.repeat(64),
        candidateBinding: {
          workspaceRevision: 'workspace:W2',
          candidateSnapshotRevision: 'candidate:C42',
          ordinalMapChecksum: checksum,
          rowCount: 12,
        },
        edgeArtifact: {
          format: 'ARROW_IPC',
          checksum: 'f'.repeat(64),
          ref: 'fixture.arrow',
        },
      }),
    ).toThrow('CANDIDATE_SNAPSHOT_WORKSPACE_REVISION_MISMATCH');
  });

  it('rejects a fake/non-sha ordinal checksum', () => {
    expect(() =>
      buildStructuralGraphSnapshotFromIncidenceV1({
        projection: projection(),
        graphRevision: 'graph:sha256:' + 'e'.repeat(64),
        candidateBinding: {
          workspaceRevision: 'workspace:W1',
          candidateSnapshotRevision: 'candidate:C42',
          ordinalMapChecksum: 'not-a-checksum',
          rowCount: 12,
        },
        edgeArtifact: {
          format: 'ARROW_IPC',
          checksum: 'f'.repeat(64),
          ref: 'fixture.arrow',
        },
      }),
    ).toThrow('STRUCTURAL_GRAPH_ORDINAL_MAP_CHECKSUM_INVALID');
  });
});
