import type { IncidenceProjectionV1 } from './incidence-projection-v1.js';
import {
  validateStructuralGraphSnapshotV1,
  type StructuralGraphSnapshotV1
} from './structural-graph-snapshot-v1.js';

/** Build only the immutable descriptor; the Arrow artifact remains external. */
export function buildStructuralGraphSnapshotFromIncidenceV1(input: {
  projection: IncidenceProjectionV1;
  graphRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  edgeArtifact: StructuralGraphSnapshotV1['edgeArtifact'];
}): StructuralGraphSnapshotV1 {
  if (input.projection.workspaceRevision !== input.candidateSnapshotRevision) {
    throw new Error('CANDIDATE_SNAPSHOT_WORKSPACE_REVISION_MISMATCH');
  }

  return validateStructuralGraphSnapshotV1({
    schema: 'atlas.structural-graph-snapshot.v1',
    workspaceRevision: input.projection.workspaceRevision,
    graphRevision: input.graphRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    nodeCount: input.projection.nodes.length,
    edgeCount: input.projection.edges.length,
    edgeArtifact: input.edgeArtifact,
    canonicalAuthority: false
  });
}
