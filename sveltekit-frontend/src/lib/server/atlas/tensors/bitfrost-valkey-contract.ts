import {
  AceBitfrostCacheIdentityV1Schema,
  buildAceBitfrostCacheKeyV1,
  type AceBitfrostCacheIdentityV1,
} from '../cache/ace-bitfrost-cache-identity-v1.js';

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

/**
 * Revision-qualified centroid key. The legacy helper remains available for
 * compatibility, but new writes must use the complete identity.
 */
export function valkeyCentroidArtifactKeyV1(
  input: Omit<AceBitfrostCacheIdentityV1, 'cacheKind'>,
): string {
  return buildAceBitfrostCacheKeyV1(
    AceBitfrostCacheIdentityV1Schema.parse({
      cacheKind: 'CENTROID',
      ...input,
    }),
  );
}

export interface HotMetadataCache {
  getTileHint(key: string): Promise<TileCacheHint | null>;
  putTileHint(key: string, value: TileCacheHint, ttlSeconds: number): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
}
