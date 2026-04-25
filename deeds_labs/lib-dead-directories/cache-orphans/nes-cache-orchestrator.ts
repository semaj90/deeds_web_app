/**
 * NES Cache Orchestrator
 * Simple cache wrapper with TTL support for client-side caching.
 * Rewritten Session 63: Svelte 5 (no store dependencies)
 */

export class NESCacheOrchestrator {
	private cache = new Map<string, { value: unknown; expiresAt: number }>();

	async get<T>(key: string): Promise<T | null> {
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return null;
		}
		return entry.value as T;
	}

	async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
		this.cache.set(key, {
			value,
			expiresAt: Date.now() + ttlSeconds * 1000
		});
	}

	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}
}
