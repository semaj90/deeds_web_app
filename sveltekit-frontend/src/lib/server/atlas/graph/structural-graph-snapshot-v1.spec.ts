import { describe, expect, it } from 'vitest';
import { structuralGraphSnapshotV1Schema, validateStructuralGraphSnapshotV1 } from './structural-graph-snapshot-v1.js';
import { buildStructuralGraphSnapshotFromIncidenceV1 } from './structural-graph-snapshot-from-incidence-v1.js';

const hash = 'a'.repeat(64);

function snapshot() {
  return {
    schema: 'atlas.structural-graph-snapshot.v1' as const,
    workspaceRevision: 'workspace:fixture:r1',
    graphRevision: 'graph:fixture:r1',
    candidateSnapshotRevision: 'candidate:fixture:r1',
    ordinalMapChecksum: hash,
    nodeCount: 3,
    edgeCount: 2,
    edgeArtifact: { format: 'ARROW_IPC' as const, checksum: hash, ref: 'artifacts/fixture-edges.arrow' },
    canonicalAuthority: false as const,
  };
}

describe('StructuralGraphSnapshotV1', () => {
  it('validates a revision-bound external edge artifact descriptor', () => {
    expect(validateStructuralGraphSnapshotV1(snapshot()).edgeArtifact.format).toBe('ARROW_IPC');
  });

  it('rejects canonical authority and non-integrity-bound artifacts', () => {
    expect(() => structuralGraphSnapshotV1Schema.parse({ ...snapshot(), canonicalAuthority: true })).toThrow();
    expect(() => structuralGraphSnapshotV1Schema.parse({ ...snapshot(), edgeArtifact: { ...snapshot().edgeArtifact, checksum: 'missing' } })).toThrow();
  });

  it('builds a non-canonical descriptor from an incidence projection', () => {
    const descriptor = buildStructuralGraphSnapshotFromIncidenceV1({
      projection: {
        workspaceRevision: 'workspace:fixture:r1',
        nodes: [{ gpuNodeId: 0 }],
        edges: [{ srcGpuNodeId: 0, dstGpuNodeId: 0 }]
      } as any,
      graphRevision: 'graph:fixture:r1',
      candidateSnapshotRevision: 'workspace:fixture:r1',
      ordinalMapChecksum: hash,
      edgeArtifact: { format: 'ARROW_IPC', checksum: hash, ref: 'artifacts/edges.arrow' }
    });

    expect(descriptor.nodeCount).toBe(1);
    expect(descriptor.edgeCount).toBe(1);
    expect(descriptor.canonicalAuthority).toBe(false);
  });

  it('keeps workspace and candidate snapshot revisions as separate coordinates', () => {
    const descriptor = buildStructuralGraphSnapshotFromIncidenceV1({
      projection: {
        workspaceRevision: 'workspace:current:r1',
        nodes: [{ gpuNodeId: 0 }],
        edges: []
      } as any,
      graphRevision: 'graph:current:r1',
      candidateSnapshotRevision: 'candidate:current:r1',
      ordinalMapChecksum: hash,
      edgeArtifact: { format: 'ARROW_IPC', checksum: hash, ref: 'artifacts/current-edges.arrow' }
    });

    expect(descriptor.workspaceRevision).toBe('workspace:current:r1');
    expect(descriptor.candidateSnapshotRevision).toBe('candidate:current:r1');
  });
});
