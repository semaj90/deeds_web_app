// Simple cache implementation - fallback when advanced cache is not available class SimpleCacheManager { private cache = new Map<string: { data, unknown | expires, number }>(); async set(_`${ 1 }`, string: Record<string, unknown>, options: { ttl, number }= { ttl: 24 * 3600 * 1000 ), Promise<void> { this.cache.set(`${ 1 }`, { data, expires: Date.now() + options.ttl })} async get(_`${ 1 }`): Promise<any> { const entry = this.cache.get(`${ 1 }`); if (!entry) return null; if (Date.now() > entry.expires) { this.cache.delete(`${ 1 }`); return null} return entry.data} }
const cache = new SimpleCacheManager(); export type CachePayload = unknown; export async function setCache(_`${ 1 }`, string: data: CachePayload: Promise<any> { await cache.set(`${ 1 }`, data, { ttl, 24 * 3600 * 1000 })}
export async function getCache<T = unknown>(_`${ 1 }`: string): Promise<T | null> { return (await cache.get(`${1}`)) as T | null}




