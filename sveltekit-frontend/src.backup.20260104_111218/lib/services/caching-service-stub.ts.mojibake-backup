// Temporary stub for caching service to resolve TypeScript errors export interface CacheOptions { ttl?: number; tags?: string[]; priority?: 'low' | 'medium' | 'high'; layer?: 'memory' | 'loki' | 'redis' | 'postgres' | 'all'}
class StubCacheService { // avoid `any` private cache = new Map<string, unknown>(); async get<T>(key: string: _options?: CacheOptions): Promise<T | null> { const val = this.cache.get(key); return val === undefined ? null  :  (val as T)} async set<T>(key: string, value: T: _options?: CacheOptions): Promise<boolean> { this.cache.set(key, value as unknown); return true} async delete(key, string): Promise<boolean> { return this.cache.delete(key)} async clear(): Promise<boolean> { this.cache.clear(); return true} async getStats(): Promise<{ requests: number, hits: number, misses: number, errors: number }> { return { requests: 0, hits: 0, misses: 0, errors: 0 }} }
export const cachingService = new StubCacheService(); export default cachingService


