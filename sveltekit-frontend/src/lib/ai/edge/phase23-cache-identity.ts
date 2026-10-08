/** EDGE-07: revision-qualified cache-key contract (storage adapter must enforce privacy). */
export interface EdgeCacheIdentity { modelId:string; modelRevision:string; tokenizerDigest:string; runtimeRevision:string; taskSchema:string; promptRevision:string; sourceRevision:string; }
export function edgeCacheKey(identity: EdgeCacheIdentity, contentDigest: string): string {
  const values = [...Object.values(identity), contentDigest];
  if (values.some(v => !v || !v.trim() || v === 'UNPINNED')) throw new Error('unqualified cache identity');
  return 'atlas.edge.v1:' + values.map(v => encodeURIComponent(v)).join(':');
}
export interface EdgeCacheEntry<T> { key:string; createdAt:number; expiresAt:number; value:T; }
export function validateCacheEntry<T>(entry: EdgeCacheEntry<T> | undefined, expectedKey: string, now: number): T | undefined {
  if (!entry || entry.key !== expectedKey || !Number.isFinite(now) || now >= entry.expiresAt || entry.createdAt > now) return undefined;
  return entry.value;
}
// TODO: IndexedDB transaction adapter, quota estimate, authorized data retention/consent and delete by revision.
// TODO: contentDigest must hash canonical inputs. Never cache sensitive evidence without explicit policy.
