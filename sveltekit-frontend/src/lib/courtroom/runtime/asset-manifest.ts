/** Fetch over HTTPS; gRPC, Redis and RabbitMQ remain server-side. */
export type Lod = 0 | 1 | 2;
export interface LodAsset { level: Lod; url: string; bytes: number; sha256: string; distance: number; }
export interface AssetPack {
  id: string;
  revision: string;
  skeletonProfile?: string;
  models: LodAsset[];
  textures: LodAsset[];
}
export function selectLod(assets: readonly LodAsset[], distance: number): LodAsset {
  if (!assets.length || !Number.isFinite(distance) || distance < 0) throw new Error('Invalid LOD request');
  const ordered = [...assets].sort((a, b) => b.distance - a.distance);
  return ordered.find(a => distance >= a.distance) ?? ordered[ordered.length - 1];
}
export function validatePack(pack: AssetPack): void {
  if (!/^[a-z0-9_-]{1,128}$/i.test(pack.id)) throw new Error('Invalid pack id');
  if (pack.models.length > 3 || pack.textures.length > 3) throw new Error('Excess LOD levels');
  for (const item of [...pack.models, ...pack.textures]) {
    if (!/^\/[a-zA-Z0-9_./-]+$/.test(item.url) || item.url.includes('..') || item.url.startsWith('//'))
      throw new Error('Asset must be same-origin and path-safe');
    if (!/^[a-f0-9]{64}$/i.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0)
      throw new Error('Invalid asset digest/length');
  }
}
