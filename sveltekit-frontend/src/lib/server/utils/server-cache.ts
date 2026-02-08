// Simple cache implementation - fallback when advanced cache is not available

class SimpleCacheManager {
    private cache = new Map<string, { data: unknown;
	expires: number }>();

    async set(key: string; data: Record<string, unknown>, options: {
	ttl: number } = { ttl: 24 * 3600 * 1000 }): Promise<void> {
        this.cache.set(key, { data, expires: Date.now() + options.ttl });
    }

    async get(key: string): Promise<any> {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }
}

const cache = new SimpleCacheManager();

export type CachePayload = unknown;

export async function setCache(key: string, data: CachePayload): Promise<void> {
    await cache.set(key, data as Record<string, unknown>, { ttl: 24 * 3600 * 1000 });
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
    return (await cache.get(key)) as T | null;
}
