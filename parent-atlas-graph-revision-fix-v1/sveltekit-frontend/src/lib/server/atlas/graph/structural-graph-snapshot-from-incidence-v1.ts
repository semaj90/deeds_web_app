import type { CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import type { IncidenceProjectionV1 } from './incidence-projection-v1.js';
import {
  validateStructuralGraphSnapshotV1,
  type StructuralGraphSnapshotV1
} from './structural-graph-snapshot-v1.js';

export type CandidateSnapshotBindingV1 = Pick<
  CandidateOrdinalMapV1,
  'workspaceRevision' | 'candidateSnapshotRevision' | 'ordinalMapChecksum' | 'rowCount'
>;

/**
 * Build only the immutable graph descriptor; the Arrow edge artifact remains
 * external. workspaceRevision and candidateSnapshotRevision are independent
 * coordinates. The only equality required here is that the candidate map was
 * materialized from the same admitted workspace as the graph projection.
 */
export function buildStructuralGraphSnapshotFromIncidenceV1(input: {
  projection: IncidenceProjectionV1;
  graphRevision: string;
  candidateBinding: CandidateSnapshotBindingV1;
  edgeArtifact: StructuralGraphSnapshotV1['edgeArtifact'];
}): StructuralGraphSnapshotV1 {
  if (input.projection.workspaceRevision !== input.candidateBinding.workspaceRevision) {
    throw new Error('CANDIDATE_SNAPSHOT_WORKSPACE_REVISION_MISMATCH');
  }

  if (!input.graphRevision.trim()) {
    throw new Error('STRUCTURAL_GRAPH_GRAPH_REVISION_REQUIRED');
  }
  if (!input.candidateBinding.candidateSnapshotRevision.trim()) {
    throw new Error('STRUCTURAL_GRAPH_CANDIDATE_SNAPSHOT_REVISION_REQUIRED');
  }
  if (!/^[a-f0-9]{64}$/.test(input.candidateBinding.ordinalMapChecksum)) {
    throw new Error('STRUCTURAL_GRAPH_ORDINAL_MAP_CHECKSUM_INVALID');
  }
  if (!Number.isInteger(input.candidateBinding.rowCount) || input.candidateBinding.rowCount < 0) {
    throw new Error('STRUCTURAL_GRAPH_CANDIDATE_ROW_COUNT_INVALID');
  }

  return validateStructuralGraphSnapshotV1({
    schema: 'atlas.structural-graph-snapshot.v1',
    workspaceRevision: input.projection.workspaceRevision,
    graphRevision: input.graphRevision,
    candidateSnapshotRevision: input.candidateBinding.candidateSnapshotRevision,
    ordinalMapChecksum: input.candidateBinding.ordinalMapChecksum,
    nodeCount: input.projection.nodes.length,
    edgeCount: input.projection.edges.length,
    edgeArtifact: input.edgeArtifact,
    canonicalAuthority: false
  });
}
