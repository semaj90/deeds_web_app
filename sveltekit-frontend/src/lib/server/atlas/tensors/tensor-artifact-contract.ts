import { SEMANTIC_REPRESENTATION_ID, SEMANTIC_DIMENSION } from '../../embedding/embedding-contract-768.js';

export type TensorArtifactType =
  | typeof SEMANTIC_REPRESENTATION_ID
  | 'feature_matrix_5'
  | 'centroids_768'
  | 'topology_coordinate4'
  | 'nary_incidence'
  | 'engram_statistics'
  | 'route_trace_replay';

export type TensorDType = 'float32' | 'float16' | 'int8' | 'uint8' | 'uint32' | 'uint64';

export interface TensorArtifactManifest {
  artifactId: string;
  artifactType: TensorArtifactType;
  workspaceRevision: string;
  sourceRevision?: string;
  representationId?: string;
  representationRevision?: string;
  schemaVersion: 'atlas.tensor-artifact.v1';
  dtype: TensorDType;
  shape: number[];
  arrowPath: string;
  batchCount: number;
  compression: 'none' | 'lz4' | 'zstd';
  contentHash: string;
  merkleRoot?: string;
  byteLength: number;
  producer: string;
  producerRevision: string;
  createdAt: string;
}

/**
 * Immutable bulk-vector snapshot metadata. The snapshot is a transport/index
 * artifact; Postgres remains canonical for identities and revisions.
 */
export interface SemanticSnapshotManifest {
  schemaVersion: 'atlas.semantic-snapshot.v1';
  snapshotId: string;
  workspaceRevision: string;
  sourceRevision: string;
  representationId: typeof SEMANTIC_REPRESENTATION_ID;
  representationRevision: string;
  ordinalMapRevision: string;
  dimension: typeof SEMANTIC_DIMENSION;
  dtype: 'float32';
  vectorCount: number;
  identityDigest: string;
  vectorDigest: string;
  artifactPath: string;
  artifactFormat: 'arrow-ipc' | 'mmap';
  producer: string;
  producerRevision: string;
  createdAt: string;
}

/**
 * Revision-scoped KMeans routing metadata derived from a semantic snapshot.
 * Centroids route work to an executor; they are not canonical identities,
 * retrieval candidates, or additional fusion lanes.
 */
export interface SemanticCentroidRoutingManifest {
  schemaVersion: 'atlas.semantic-centroid-routing.v1';
  routingId: string;
  snapshotId: string;
  workspaceRevision: string;
  representationRevision: string;
  ordinalMapRevision: string;
  routingRevision: string;
  algorithm: 'kmeans';
  k: 64 | 128 | 256;
  dimension: typeof SEMANTIC_DIMENSION;
  vectorCount: number;
  centroidCount: number;
  seed: string;
  assignmentDigest: string;
  centroidDigest: string;
  producer: string;
  producerRevision: string;
  createdAt: string;
}

export function assertTensorArtifactManifest(m: TensorArtifactManifest): void {
  if (!m.artifactId || !m.workspaceRevision || !m.contentHash) throw new Error('invalid artifact lineage');
  if (!Array.isArray(m.shape) || m.shape.some((n) => !Number.isInteger(n) || n < 0)) throw new Error('invalid shape');
  if (!Number.isInteger(m.batchCount) || m.batchCount < 0) throw new Error('invalid batchCount');
  if (!Number.isFinite(m.byteLength) || m.byteLength < 0) throw new Error('invalid byteLength');
  if (m.artifactType === SEMANTIC_REPRESENTATION_ID && m.shape.at(-1) !== SEMANTIC_DIMENSION) throw new Error('semantic_768 must end in 768');
}

export function assertSemanticSnapshotManifest(m: SemanticSnapshotManifest): void {
  if (m.schemaVersion !== 'atlas.semantic-snapshot.v1') throw new Error('invalid semantic snapshot schema');
  if (!m.snapshotId || !m.workspaceRevision || !m.sourceRevision) throw new Error('semantic snapshot lineage required');
  if (m.representationId !== SEMANTIC_REPRESENTATION_ID || m.dimension !== SEMANTIC_DIMENSION) {
    throw new Error('semantic snapshot representation mismatch');
  }
  if (!m.representationRevision || !m.ordinalMapRevision) throw new Error('semantic snapshot revision required');
  if (m.dtype !== 'float32' || !Number.isInteger(m.vectorCount) || m.vectorCount < 0) {
    throw new Error('invalid semantic snapshot vectors');
  }
  if (!m.identityDigest || !m.vectorDigest || !m.artifactPath || !m.producer || !m.producerRevision || !m.createdAt) {
    throw new Error('semantic snapshot provenance required');
  }
}

export function assertSemanticCentroidRoutingManifest(m: SemanticCentroidRoutingManifest): void {
  if (m.schemaVersion !== 'atlas.semantic-centroid-routing.v1') throw new Error('invalid centroid routing schema');
  if (!m.routingId || !m.snapshotId || !m.workspaceRevision || !m.representationRevision || !m.ordinalMapRevision || !m.routingRevision) {
    throw new Error('centroid routing lineage required');
  }
  if (m.algorithm !== 'kmeans' || ![64, 128, 256].includes(m.k)) throw new Error('unsupported centroid routing configuration');
  if (m.dimension !== SEMANTIC_DIMENSION || !Number.isInteger(m.vectorCount) || m.vectorCount < 0) {
    throw new Error('centroid routing representation mismatch');
  }
  if (!Number.isInteger(m.centroidCount) || m.centroidCount !== m.k) throw new Error('centroid count must equal k');
  if (!m.seed || !m.assignmentDigest || !m.centroidDigest || !m.producer || !m.producerRevision || !m.createdAt) {
    throw new Error('centroid routing provenance required');
  }
}
