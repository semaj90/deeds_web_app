export type TensorArtifactType =
  | 'semantic_768'
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

export function assertTensorArtifactManifest(m: TensorArtifactManifest): void {
  if (!m.artifactId || !m.workspaceRevision || !m.contentHash) throw new Error('invalid artifact lineage');
  if (!Array.isArray(m.shape) || m.shape.some((n) => !Number.isInteger(n) || n < 0)) throw new Error('invalid shape');
  if (!Number.isInteger(m.batchCount) || m.batchCount < 0) throw new Error('invalid batchCount');
  if (!Number.isFinite(m.byteLength) || m.byteLength < 0) throw new Error('invalid byteLength');
  if (m.artifactType === 'semantic_768' && m.shape.at(-1) !== 768) throw new Error('semantic_768 must end in 768');
}
