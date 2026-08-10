export type HostResidency = 'COLD' | 'MMAPPED' | 'PINNED';
export type GpuResidency = 'ABSENT' | 'PREFETCHING' | 'RESIDENT' | 'IN_USE';

export interface TensorTileManifest {
  tileId: string;
  tileKey: string;
  artifactId: string;
  artifactRevision: string;
  representationId?: string;
  representationRevision?: string;
  recordBatchIndex: number;
  rowCount: number;
  dtype: 'float32' | 'float16' | 'int8' | 'uint8';
  byteLength: number;
  contentHash: string;
  hostState: HostResidency;
  gpuState: GpuResidency;
  utility: number;
  lastUsedAt: number;
  pinCount: number;
}

export interface TileDirectory {
  get(tileKey: string): Promise<TensorTileManifest | null>;
  put(tile: TensorTileManifest): Promise<void>;
  listByArtifact(artifactId: string): Promise<TensorTileManifest[]>;
}
