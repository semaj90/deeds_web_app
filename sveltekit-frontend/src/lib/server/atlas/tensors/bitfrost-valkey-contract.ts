export interface TileCacheHint {
  tileKey: string;
  artifactId: string;
  representationRevision?: string;
  residency: 'COLD' | 'MMAPPED' | 'PINNED' | 'GPU_RESIDENT';
  utility: number;
  lastUsedAt: number;
  expiresAt?: number;
}

export function valkeyTileKey(workspaceRevision: string, tileKey: string): string {
  return `atlas:tensor:tile:${workspaceRevision}:${tileKey}`;
}

export function valkeyCentroidKey(representationRevision: string): string {
  return `atlas:tensor:centroids:${representationRevision}`;
}

export interface HotMetadataCache {
  getTileHint(key: string): Promise<TileCacheHint | null>;
  putTileHint(key: string, value: TileCacheHint, ttlSeconds: number): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
}
